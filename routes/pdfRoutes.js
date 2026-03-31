import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { encryptPDF } from '../services/encryptionServices.js';
import { logEvent } from '../services/auditService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const STORAGE_BUCKET = process.env.PDF_STORAGE_BUCKET || 'pdfs';

async function ensureBucketExists(bucketName) {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  const exists = buckets?.some((bucket) => bucket.name === bucketName);
  if (exists) return;

  const { error: createError } = await supabase.storage.createBucket(bucketName, { public: false });
  if (createError) throw createError;
}

async function authenticateBearerToken(req) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Missing Authorization: Bearer <token>' } };
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    return { error: { status: 401, message: 'Bearer token is empty' } };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: { status: 401, message: 'Invalid or expired bearer token' } };
  }

  return { user: data.user };
}

function sanitizeFileName(fileName) {
  const base = path.basename(fileName || 'document.pdf');
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function buildStoragePath(userId, originalFileName) {
  const safeName = sanitizeFileName(originalFileName);
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex');
  return `users/${userId}/${timestamp}_${randomSuffix}_${safeName}.enc`;
}

async function resolveOrganizationId(req, userId) {
  const requestedOrganizationId = req.body?.organizationId ?? req.query?.organizationId ?? null;
  if (!requestedOrganizationId) return null;

  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('organization_id', requestedOrganizationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify organization membership: ${error.message}`);
  }

  if (!data) {
    throw new Error('You do not have access to store encrypted files for that organization.');
  }

  return requestedOrganizationId;
}

router.post('/upload', upload.single('pdf'), async (req, res) => {
  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return res.status(authResult.error.status).json({ error: authResult.error.message });
  }

  const user = authResult.user;
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const originalFileName = req.file?.originalname || 'unknown_file.pdf';

  try {
    if (!req.file) {
      await logEvent({
        action: 'ENCRYPTION_FAILURE',
        fileName: 'none',
        userId: user.id,
        status: 'FAILED',
        ip,
        details: 'No file uploaded',
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const secretKey = process.env.KMS_MASTER_SECRET?.trim();
    if (!secretKey) {
      await logEvent({
        action: 'ENCRYPTION_FAILURE',
        fileName: originalFileName,
        userId: user.id,
        status: 'FAILED',
        ip,
        details: 'Missing KMS_MASTER_SECRET',
      });
      return res.status(500).json({ error: 'Server encryption secret is not configured.' });
    }

    const organizationId = await resolveOrganizationId(req, user.id);

    await logEvent({
      action: 'UPLOAD_ATTEMPT',
      fileName: originalFileName,
      userId: user.id,
      organizationId,
      status: 'PENDING',
      ip,
    });

    const fileBuffer = req.file.buffer;
    const keyLabel = process.env.KMS_KEY_LABEL || 'kms-master-v1';
    const encryptedAt = new Date().toISOString();
    const encryptedData = encryptPDF(fileBuffer, secretKey);
    const storagePath = buildStoragePath(user.id, originalFileName);
    const encryptedFileName = storagePath.split('/').pop();

    await ensureBucketExists(STORAGE_BUCKET);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, encryptedData, {
        contentType: 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: record, error: recordError } = await supabase
      .from('encrypted_pdfs')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        original_file_name: sanitizeFileName(originalFileName),
        encrypted_file_name: encryptedFileName,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        file_size_bytes: req.file.size,
        mime_type: req.file.mimetype,
        key_label: keyLabel,
      })
      .select('*')
      .single();

    if (recordError) throw recordError;

    await logEvent({
      action: 'ENCRYPTION_SUCCESS',
      fileName: encryptedFileName,
      userId: user.id,
      organizationId,
      status: 'SUCCESS',
      ip,
      details: `Original size: ${fileBuffer.length} bytes`,
    });

    return res.status(200).json({
      success: true,
      message: 'Securely encrypted and stored.',
      id: record.id,
      bucket: STORAGE_BUCKET,
      path: storagePath,
      originalFileName: record.original_file_name,
      encryptedFileName: record.encrypted_file_name,
      encryptedAt: record.created_at,
      keyLabel: record.key_label,
      organizationId: record.organization_id,
    });
  } catch (error) {
    console.error('Critical PDF encryption error:', error);
    await logEvent({
      action: 'ENCRYPTION_FAILURE',
      fileName: originalFileName,
      userId: user.id,
      status: 'FAILED',
      ip,
      details: error instanceof Error ? error.message : 'Unknown encryption failure',
    });

    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Security processing failed',
    });
  }
});

router.get('/recent', async (req, res) => {
  const authResult = await authenticateBearerToken(req);
  if (authResult.error) {
    return res.status(authResult.error.status).json({ error: authResult.error.message });
  }

  try {
    const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 10;
    const organizationId = await resolveOrganizationId(req, authResult.user.id);

    let query = supabase
      .from('encrypted_pdfs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', authResult.user.id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const files = (data || []).map((item) => ({
      id: item.id,
      name: item.encrypted_file_name,
      originalFileName: item.original_file_name,
      path: item.storage_path,
      createdAt: item.created_at,
      size: item.file_size_bytes,
      mimeType: item.mime_type,
      keyLabel: item.key_label,
      organizationId: item.organization_id,
    }));

    return res.status(200).json({
      bucket: STORAGE_BUCKET,
      files,
    });
  } catch (error) {
    console.error('Failed to load recent encrypted files:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to load recent encrypted files',
    });
  }
});

export default router;
