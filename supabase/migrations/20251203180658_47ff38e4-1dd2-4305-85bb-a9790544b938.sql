-- Create scan_schedules table
CREATE TABLE public.scan_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  domain_id UUID NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 28),
  scan_type TEXT NOT NULL DEFAULT 'quick' CHECK (scan_type IN ('quick', 'full')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, domain_id)
);

-- Enable RLS
ALTER TABLE public.scan_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own scan schedules"
ON public.scan_schedules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scan schedules"
ON public.scan_schedules FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scan schedules"
ON public.scan_schedules FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scan schedules"
ON public.scan_schedules FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_scan_schedules_updated_at
BEFORE UPDATE ON public.scan_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();