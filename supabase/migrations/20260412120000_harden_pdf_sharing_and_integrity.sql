ALTER TABLE public.encrypted_pdfs
  ADD COLUMN IF NOT EXISTS encrypted_sha256 TEXT;

ALTER TABLE public.file_permissions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT,
  ADD COLUMN IF NOT EXISTS first_accessed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_file_permissions_active_lookup
  ON public.file_permissions(file_id, user_id, revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_file_permissions_expires_at
  ON public.file_permissions(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_encrypted_pdfs_sha256
  ON public.encrypted_pdfs(encrypted_sha256)
  WHERE encrypted_sha256 IS NOT NULL;
