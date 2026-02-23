-- Create activity_logs table for audit trail
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_activity_logs_org_created ON public.activity_logs(organization_id, created_at DESC);
CREATE INDEX idx_activity_logs_user ON public.activity_logs(user_id, created_at DESC);
CREATE INDEX idx_activity_logs_action ON public.activity_logs(action);

-- Enable RLS
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies - users can view logs for their orgs or their own personal logs
CREATE POLICY "Users can view org activity logs"
ON public.activity_logs FOR SELECT
USING (
  user_id = auth.uid() 
  OR (organization_id IS NOT NULL AND public.is_org_member(auth.uid(), organization_id))
);

-- Only allow inserts through authenticated users for their own actions
CREATE POLICY "Users can insert own activity logs"
ON public.activity_logs FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- No updates or deletes allowed (immutable audit trail)
-- This is intentional for compliance