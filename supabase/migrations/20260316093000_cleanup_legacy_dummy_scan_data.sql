-- Remove legacy pre-ZAP scan data so dashboards only reflect real OWASP ZAP results.
-- This migration is intentionally destructive for historical scan records created
-- before the March 16, 2026 OWASP ZAP rollout.

DO $$
DECLARE
  zap_cutover timestamptz := '2026-03-16T00:00:00Z'::timestamptz;
BEGIN
  -- Delete score history associated with scans created before the ZAP rollout.
  DELETE FROM public.security_scores ss
  USING public.scans s
  WHERE s.created_at < zap_cutover
    AND ss.user_id = s.user_id
    AND ss.recorded_at >= COALESCE(s.started_at, s.created_at)
    AND ss.recorded_at <= COALESCE(s.completed_at, s.created_at + interval '1 hour');

  -- Remove stored JSON result payloads for legacy scans.
  DELETE FROM public.scan_results sr
  USING public.scans s
  WHERE s.created_at < zap_cutover
    AND sr.scan_id = s.id;

  -- Remove normalized issues for legacy scans.
  DELETE FROM public.scan_issues si
  USING public.scans s
  WHERE s.created_at < zap_cutover
    AND si.scan_id = s.id;

  -- Remove the legacy scan rows themselves.
  DELETE FROM public.scans
  WHERE created_at < zap_cutover;
END $$;
