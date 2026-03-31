ALTER TABLE public.phishing_checks
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS risk_score INTEGER CHECK (risk_score >= 0 AND risk_score <= 100),
  ADD COLUMN IF NOT EXISTS analysis_source TEXT NOT NULL DEFAULT 'heuristic';

CREATE INDEX IF NOT EXISTS idx_phishing_checks_org_checked
  ON public.phishing_checks(organization_id, checked_at DESC);

DROP POLICY IF EXISTS "Users can view own phishing checks" ON public.phishing_checks;
DROP POLICY IF EXISTS "Users can insert own phishing checks" ON public.phishing_checks;

CREATE POLICY "Users can view permitted phishing checks"
ON public.phishing_checks FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = phishing_checks.organization_id
        AND om.user_id = auth.uid()
        AND (
          om.role IN ('owner', 'admin', 'viewer')
          OR phishing_checks.user_id = auth.uid()
        )
    )
  )
);

CREATE POLICY "Users can insert personal or managed phishing checks"
ON public.phishing_checks FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = phishing_checks.organization_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin', 'member')
    )
  )
);

DROP POLICY IF EXISTS "Users can view own phishing red flags" ON public.phishing_red_flags;
DROP POLICY IF EXISTS "Users can insert own phishing red flags" ON public.phishing_red_flags;

CREATE POLICY "Users can view permitted phishing red flags"
ON public.phishing_red_flags FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.phishing_checks pc
    WHERE pc.id = phishing_red_flags.check_id
      AND (
        pc.user_id = auth.uid()
        OR (
          pc.organization_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.organization_members om
            WHERE om.organization_id = pc.organization_id
              AND om.user_id = auth.uid()
              AND (
                om.role IN ('owner', 'admin', 'viewer')
                OR pc.user_id = auth.uid()
              )
          )
        )
      )
  )
);

CREATE POLICY "Users can insert phishing red flags for permitted checks"
ON public.phishing_red_flags FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.phishing_checks pc
    WHERE pc.id = phishing_red_flags.check_id
      AND pc.user_id = auth.uid()
      AND (
        pc.organization_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.organization_members om
          WHERE om.organization_id = pc.organization_id
            AND om.user_id = auth.uid()
            AND om.role IN ('owner', 'admin', 'member')
        )
      )
  )
);
