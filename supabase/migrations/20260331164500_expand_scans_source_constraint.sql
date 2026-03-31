ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_source_check;

UPDATE public.scans
SET source = 'node_api'
WHERE source IS NULL
   OR source NOT IN ('dashboard', 'node_api', 'browser_extension', 'scheduled_scan', 'manual');

ALTER TABLE public.scans
  ADD CONSTRAINT scans_source_check
  CHECK (
    source IN (
      'dashboard',
      'node_api',
      'browser_extension',
      'scheduled_scan',
      'manual'
    )
  );
