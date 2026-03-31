CREATE TABLE IF NOT EXISTS public.encrypted_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  original_file_name TEXT NOT NULL,
  encrypted_file_name TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  key_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_encrypted_pdfs_user_created
  ON public.encrypted_pdfs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_encrypted_pdfs_org_created
  ON public.encrypted_pdfs(organization_id, created_at DESC);

ALTER TABLE public.encrypted_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view permitted encrypted pdfs" ON public.encrypted_pdfs;
DROP POLICY IF EXISTS "Users can insert own encrypted pdfs" ON public.encrypted_pdfs;

CREATE POLICY "Users can view permitted encrypted pdfs"
ON public.encrypted_pdfs FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
  )
);

CREATE POLICY "Users can insert own encrypted pdfs"
ON public.encrypted_pdfs FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR public.is_org_member(auth.uid(), organization_id)
  )
);
