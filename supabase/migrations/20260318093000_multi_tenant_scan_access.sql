-- Multi-tenant scan access:
-- - users always see their own records
-- - org owners/admins/viewers can see org-wide scan data
-- - org members can run scans but only see their own scans
-- - pending invites no longer use a fake placeholder UUID

ALTER TABLE public.organization_members
  ALTER COLUMN user_id DROP NOT NULL;

UPDATE public.organization_members
SET user_id = NULL
WHERE user_id = '00000000-0000-0000-0000-000000000000';

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_organization_id_user_id_key;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_or_invite_check
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique_user
  ON public.organization_members (organization_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_unique_invite_email
  ON public.organization_members (organization_id, lower(invited_email))
  WHERE invited_email IS NOT NULL;

DROP POLICY IF EXISTS "Users can view own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can insert own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can update own domains" ON public.domains;
DROP POLICY IF EXISTS "Users can delete own domains" ON public.domains;
DROP POLICY IF EXISTS "Org members can view org domains" ON public.domains;

CREATE POLICY "Users can view permitted domains"
ON public.domains FOR SELECT
USING (
  auth.uid() = user_id
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

CREATE POLICY "Users can insert personal or managed org domains"
ON public.domains FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

CREATE POLICY "Users can update personal or managed org domains"
ON public.domains FOR UPDATE
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

CREATE POLICY "Users can delete personal or managed org domains"
ON public.domains FOR DELETE
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

DROP POLICY IF EXISTS "Users can view own scans" ON public.scans;
DROP POLICY IF EXISTS "Users can insert own scans" ON public.scans;
DROP POLICY IF EXISTS "Users can update own scans" ON public.scans;

CREATE POLICY "Users can view permitted scans"
ON public.scans FOR SELECT
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
  )
);

CREATE POLICY "Users can insert own scans in allowed scopes"
ON public.scans FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND (
    organization_id IS NULL
    OR public.is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Users can update own or managed org scans"
ON public.scans FOR UPDATE
USING (
  auth.uid() = user_id
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

DROP POLICY IF EXISTS "Users can view own scan issues" ON public.scan_issues;
DROP POLICY IF EXISTS "Users can insert own scan issues" ON public.scan_issues;
DROP POLICY IF EXISTS "Users can update own scan issues" ON public.scan_issues;

CREATE POLICY "Users can view permitted scan issues"
ON public.scan_issues FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_issues.scan_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.organization_id IS NOT NULL
          AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
        )
      )
  )
);

CREATE POLICY "Users can insert own scan issues"
ON public.scan_issues FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own or managed scan issues"
ON public.scan_issues FOR UPDATE
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_issues.scan_id
      AND s.organization_id IS NOT NULL
      AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

DROP POLICY IF EXISTS "Users can view own scan results" ON public.scan_results;
DROP POLICY IF EXISTS "Users can insert own scan results" ON public.scan_results;
DROP POLICY IF EXISTS "Users can update own scan results" ON public.scan_results;

CREATE POLICY "Users can view permitted scan results"
ON public.scan_results FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_results.scan_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.organization_id IS NOT NULL
          AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
        )
      )
  )
);

CREATE POLICY "Users can insert own scan results"
ON public.scan_results FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_results.scan_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own or managed scan results"
ON public.scan_results FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_results.scan_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.organization_id IS NOT NULL
          AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin']::app_role[])
        )
      )
  )
);
