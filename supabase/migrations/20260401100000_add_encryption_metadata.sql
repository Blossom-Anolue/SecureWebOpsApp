-- Add encryption metadata columns to files table for AES-256-GCM
-- The iv (initialization vector) and tag (authentication tag) are required for decryption

ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS iv BYTEA NOT NULL DEFAULT '\x00'::bytea,
ADD COLUMN IF NOT EXISTS tag BYTEA NOT NULL DEFAULT '\x00'::bytea;

-- Update existing rows to have dummy values (they won't be decryptable, but prevents null constraint)
UPDATE public.files SET iv = '\x00'::bytea WHERE iv IS NULL;
UPDATE public.files SET tag = '\x00'::bytea WHERE tag IS NULL;

-- Make them not null after updating
ALTER TABLE public.files
ALTER COLUMN iv SET NOT NULL,
ALTER COLUMN tag SET NOT NULL;