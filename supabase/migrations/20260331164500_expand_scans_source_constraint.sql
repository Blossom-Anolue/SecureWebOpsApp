ALTER TABLE public.scans
  DROP CONSTRAINT IF EXISTS scans_source_check;

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
