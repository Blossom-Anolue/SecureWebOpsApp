CREATE TABLE IF NOT EXISTS public.browser_extension_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browser_extension_events_user_id
  ON public.browser_extension_events(user_id, created_at DESC);

ALTER TABLE public.browser_extension_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own browser extension events" ON public.browser_extension_events;
DROP POLICY IF EXISTS "Users can insert own browser extension events" ON public.browser_extension_events;

CREATE POLICY "Users can view own browser extension events"
ON public.browser_extension_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own browser extension events"
ON public.browser_extension_events FOR INSERT
WITH CHECK (auth.uid() = user_id);
