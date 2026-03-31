-- Canonical scan finding storage for extension and backend integrations.
-- Scan scores are derived from findings, not from dashboard health history.

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS scan_score INTEGER;

UPDATE public.scans
SET scan_score = score
WHERE scan_score IS NULL AND score IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.scan_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  severity public.severity_level NOT NULL,
  finding_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  evidence TEXT,
  affected_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scan_findings_scan_id ON public.scan_findings(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_findings_severity ON public.scan_findings(severity);

ALTER TABLE public.scan_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scan findings" ON public.scan_findings;
DROP POLICY IF EXISTS "Users can insert own scan findings" ON public.scan_findings;
DROP POLICY IF EXISTS "Users can update own scan findings" ON public.scan_findings;

CREATE POLICY "Users can view permitted scan findings"
ON public.scan_findings FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_findings.scan_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.organization_id IS NOT NULL
          AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
        )
      )
  )
);

CREATE POLICY "Users can insert own scan findings"
ON public.scan_findings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_findings.scan_id
      AND s.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update own or managed scan findings"
ON public.scan_findings FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_findings.scan_id
      AND (
        s.user_id = auth.uid()
        OR (
          s.organization_id IS NOT NULL
          AND public.has_org_role(auth.uid(), s.organization_id, ARRAY['owner', 'admin']::app_role[])
        )
      )
  )
);
