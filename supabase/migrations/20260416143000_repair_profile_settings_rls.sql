-- Repair RLS and missing rows for profiles + notification settings.
-- This is safe to run repeatedly.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view own notification settings" ON public.notification_settings;
DROP POLICY IF EXISTS "Users can update own notification settings" ON public.notification_settings;
DROP POLICY IF EXISTS "Users can insert own notification settings" ON public.notification_settings;

CREATE POLICY "Users can view own notification settings"
  ON public.notification_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
  ON public.notification_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings"
  ON public.notification_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

INSERT INTO public.profiles (id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notification_settings (user_id)
SELECT u.id
FROM auth.users u
LEFT JOIN public.notification_settings ns ON ns.user_id = u.id
WHERE ns.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
