-- Fix signup/profile schema drift:
-- - some environments have profiles.company_name instead of profiles.business_name
-- - make signup trigger resilient and aligned with the live Supabase project
-- - correct the org-membership check order for domain inserts

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'business_name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'company_name'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN business_name TO company_name;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS company_name TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_company_name TEXT;
  company_slug TEXT;
  created_org_id UUID;
BEGIN
  new_company_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'company_name'), '');

  INSERT INTO public.profiles (id, full_name, company_name)
  VALUES (
    NEW.id,
    NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
    new_company_name
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    company_name = EXCLUDED.company_name,
    updated_at = now();

  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  IF new_company_name IS NOT NULL THEN
    company_slug := regexp_replace(lower(new_company_name), '[^a-z0-9]+', '-', 'g');
    company_slug := trim(both '-' from company_slug);
    company_slug := company_slug || '-' || left(NEW.id::text, 8);

    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (new_company_name, company_slug, NEW.id)
    RETURNING id INTO created_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
    VALUES (created_org_id, NEW.id, 'owner'::public.app_role, now())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS "Users can insert their own domains" ON public.domains;

CREATE POLICY "Users can insert their own domains"
ON public.domains FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR public.is_org_member(auth.uid(), organization_id)
  )
);
