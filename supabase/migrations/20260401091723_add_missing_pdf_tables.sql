-- Create missing tables for PDF encryption/decryption functionality
-- The code expects 'files' and 'file_permissions' tables but they weren't created in previous migrations

-- Files table for storing encrypted PDF metadata
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  key_label TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- File permissions table for sharing access control
CREATE TABLE IF NOT EXISTS public.file_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_level TEXT NOT NULL CHECK (permission_level IN ('VIEW', 'DOWNLOAD', 'ADMIN')),
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(file_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_user_created ON public.files(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_org_created ON public.files(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_permissions_file_user ON public.file_permissions(file_id, user_id);
CREATE INDEX IF NOT EXISTS idx_file_permissions_user ON public.file_permissions(user_id);

-- Row Level Security
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_permissions ENABLE ROW LEVEL SECURITY;

-- Files policies
CREATE POLICY "Users can view their own files"
ON public.files FOR SELECT
USING (
  user_id = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
  )
);

CREATE POLICY "Users can insert their own files"
ON public.files FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND (
    organization_id IS NULL
    OR public.is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Users can update their own files"
ON public.files FOR UPDATE
USING (
  user_id = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

CREATE POLICY "Users can delete their own files"
ON public.files FOR DELETE
USING (
  user_id = auth.uid()
  OR (
    organization_id IS NOT NULL
    AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
  )
);

-- File permissions policies
CREATE POLICY "Users can view permissions for files they can access"
ON public.file_permissions FOR SELECT
USING (
  user_id = auth.uid()
  OR file_id IN (
    SELECT id FROM public.files
    WHERE user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin', 'viewer']::app_role[])
    )
  )
);

CREATE POLICY "File owners can manage permissions"
ON public.file_permissions FOR ALL
USING (
  file_id IN (
    SELECT id FROM public.files
    WHERE user_id = auth.uid()
    OR (
      organization_id IS NOT NULL
      AND public.has_org_role(auth.uid(), organization_id, ARRAY['owner', 'admin']::app_role[])
    )
  )
);

-- Updated at trigger for files table
CREATE OR REPLACE FUNCTION update_files_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION update_files_updated_at();