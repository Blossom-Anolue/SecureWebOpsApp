-- Signup enhancements:
-- - store user full name on profiles
-- - optionally create an organization from signup metadata
-- - keep domains private to the user who created them

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  company_name TEXT;
  company_slug TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name)
  VALUES (
    NEW.id,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data ->> 'company_name'), '')
  );

  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id);

  company_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'company_name'), '');

  IF company_name IS NOT NULL THEN
    company_slug := regexp_replace(lower(company_name), '[^a-z0-9]+', '-', 'g');
    company_slug := trim(both '-' from company_slug);
    company_slug := company_slug || '-' || left(NEW.id::text, 8);

    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (company_name, company_slug, NEW.id);

    INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
    SELECT id, NEW.id, 'owner'::public.app_role, now()
    FROM public.organizations
    WHERE slug = company_slug;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can view permitted domains" ON public.domains;
DROP POLICY IF EXISTS "Users can insert personal or managed org domains" ON public.domains;
DROP POLICY IF EXISTS "Users can update personal or managed org domains" ON public.domains;
DROP POLICY IF EXISTS "Users can delete personal or managed org domains" ON public.domains;

CREATE POLICY "Users can view only their own domains"
ON public.domains FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own domains"
ON public.domains FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR public.is_org_member(organization_id, auth.uid())
  )
);

CREATE POLICY "Users can update only their own domains"
ON public.domains FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete only their own domains"
ON public.domains FOR DELETE
USING (auth.uid() = user_id);
