-- Create enum types for SecureWebOps
CREATE TYPE public.scan_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE public.scan_type AS ENUM ('quick', 'full');
CREATE TYPE public.severity_level AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.phishing_risk_level AS ENUM ('high', 'medium', 'low');
CREATE TYPE public.phishing_check_type AS ENUM ('email', 'link');

-- Profiles table for business information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  industry TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Domains table for websites to monitor
CREATE TABLE public.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domains"
  ON public.domains FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domains"
  ON public.domains FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domains"
  ON public.domains FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own domains"
  ON public.domains FOR DELETE
  USING (auth.uid() = user_id);

-- Scans table for website security scans
CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain_id UUID REFERENCES public.domains(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  scan_type public.scan_type NOT NULL DEFAULT 'quick',
  status public.scan_status NOT NULL DEFAULT 'pending',
  score INTEGER CHECK (score >= 0 AND score <= 100),
  critical_count INTEGER DEFAULT 0,
  high_count INTEGER DEFAULT 0,
  medium_count INTEGER DEFAULT 0,
  low_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scans"
  ON public.scans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scans"
  ON public.scans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scans"
  ON public.scans FOR UPDATE
  USING (auth.uid() = user_id);

-- Scan issues found during scans
CREATE TABLE public.scan_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  severity public.severity_level NOT NULL,
  category TEXT NOT NULL,
  owasp_category TEXT,
  description TEXT NOT NULL,
  business_impact TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  technical_details TEXT,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.scan_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scan issues"
  ON public.scan_issues FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scan issues"
  ON public.scan_issues FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scan issues"
  ON public.scan_issues FOR UPDATE
  USING (auth.uid() = user_id);

-- Phishing checks table
CREATE TABLE public.phishing_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  check_type public.phishing_check_type NOT NULL,
  content TEXT NOT NULL,
  subject TEXT,
  sender_email TEXT,
  risk_level public.phishing_risk_level NOT NULL,
  verdict TEXT NOT NULL,
  checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.phishing_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own phishing checks"
  ON public.phishing_checks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phishing checks"
  ON public.phishing_checks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Red flags found in phishing checks
CREATE TABLE public.phishing_red_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id UUID REFERENCES public.phishing_checks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity public.severity_level NOT NULL
);

ALTER TABLE public.phishing_red_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own phishing red flags"
  ON public.phishing_red_flags FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own phishing red flags"
  ON public.phishing_red_flags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User notification settings
CREATE TABLE public.notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email_notifications BOOLEAN DEFAULT true,
  critical_alerts BOOLEAN DEFAULT true,
  weekly_summary BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification settings"
  ON public.notification_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification settings"
  ON public.notification_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification settings"
  ON public.notification_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Security score history for trend tracking
CREATE TABLE public.security_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.security_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own security scores"
  ON public.security_scores FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own security scores"
  ON public.security_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  
  INSERT INTO public.notification_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX idx_domains_user_id ON public.domains(user_id);
CREATE INDEX idx_scans_user_id ON public.scans(user_id);
CREATE INDEX idx_scans_domain_id ON public.scans(domain_id);
CREATE INDEX idx_scan_issues_scan_id ON public.scan_issues(scan_id);
CREATE INDEX idx_phishing_checks_user_id ON public.phishing_checks(user_id);
CREATE INDEX idx_security_scores_user_id ON public.security_scores(user_id);
CREATE INDEX idx_security_scores_recorded_at ON public.security_scores(recorded_at);