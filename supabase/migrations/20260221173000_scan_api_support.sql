-- Extend scan status enum for API lifecycle states.
ALTER TYPE public.scan_status ADD VALUE IF NOT EXISTS 'queued';
ALTER TYPE public.scan_status ADD VALUE IF NOT EXISTS 'canceled';

-- Update scans table to support extension-driven URL scans.
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS target_url TEXT,
  ADD COLUMN IF NOT EXISTS requested_by_user UUID,
  ADD COLUMN IF NOT EXISTS scan_error TEXT;

-- URL-driven scans may not have a dashboard domain record.
ALTER TABLE public.scans
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN domain_id DROP NOT NULL,
  ALTER COLUMN started_at DROP NOT NULL;

-- Ensure legacy rows have a target URL if missing.
UPDATE public.scans
SET target_url = CASE
  WHEN domain ILIKE 'http://%' OR domain ILIKE 'https://%' THEN domain
  ELSE 'https://' || domain
END
WHERE target_url IS NULL AND domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scans_status_created_at ON public.scans(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_target_url ON public.scans(target_url);

-- Store API-style scan output as structured JSON.
CREATE TABLE IF NOT EXISTS public.scan_results (
  scan_id UUID PRIMARY KEY REFERENCES public.scans(id) ON DELETE CASCADE,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan results"
ON public.scan_results FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_results.scan_id
      AND s.user_id = auth.uid()
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

CREATE POLICY "Users can update own scan results"
ON public.scan_results FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.scans s
    WHERE s.id = scan_results.scan_id
      AND s.user_id = auth.uid()
  )
);
