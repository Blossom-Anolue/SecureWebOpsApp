import express from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { encryptPDF } from '../services/encryptionServices.js';
import { logEvent } from '../services/auditService.js'; // Melinda's Compliance Service

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
}

const supabase = createClient(
    supabaseUrl,
    supabaseServiceKey
);
const STORAGE_BUCKET = process.env.PDF_STORAGE_BUCKET || 'pdfs';

async function ensureBucketExists(bucketName) {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) throw listError;

    const exists = buckets?.some((bucket) => bucket.name === bucketName);
    if (exists) return;

    const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: false
    });
    if (createError) throw createError;
}

router.post('/upload', upload.single('pdf'), async (req, res) => {
    // Capture metadata for the Audit Log
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const fileName = req.file?.originalname || 'unknown_file';

    try {
        if (!req.file) {
            await logEvent({ action: 'UPLOAD_FAILURE', fileName: 'none', status: 'FAILED', ip, details: 'No file provided' });
            return res.status(400).json({ error: "No file uploaded" });
        }

        // 1. COMPLIANCE: Log the initial attempt
        await logEvent({ action: 'UPLOAD_ATTEMPT', fileName, status: 'PENDING', ip });

        const fileBuffer = req.file.buffer;
        const secretKey = process.env.KMS_MASTER_SECRET;
        const keyLabel = process.env.KMS_KEY_LABEL || 'kms-master-v1';
        const encryptedAt = new Date().toISOString();

        // 2. Run the Encryption Logic (AES-256-GCM)
        const encryptedData = encryptPDF(fileBuffer, secretKey);
        
        // 3. Upload the encrypted blob to Supabase Storage
        const cloudFileName = `secure_${Date.now()}_${fileName}.enc`;
        await ensureBucketExists(STORAGE_BUCKET);

        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(cloudFileName, encryptedData, {
                contentType: 'application/octet-stream',
                upsert: true
            });

        if (error) throw error;

        // 4. COMPLIANCE: Log the final success
        await logEvent({ 
            action: 'ENCRYPTION_SUCCESS', 
            fileName: cloudFileName, 
            status: 'SUCCESS', 
            ip,
            details: `Original size: ${fileBuffer.length} bytes`
        });

        res.status(200).json({
            success: true,
            message: "Securely Encrypted, Logged, and Stored in Cloud.",
            path: data.path,
            bucket: STORAGE_BUCKET,
            originalFileName: fileName,
            encryptedFileName: cloudFileName,
            encryptedAt,
            keyLabel
        });

    } catch (error) {
        // 5. COMPLIANCE: Log the failure for security monitoring
        console.error("Critical Security Error:", error);
        await logEvent({ 
            action: 'ENCRYPTION_FAILURE', 
            fileName, 
            status: 'FAILED', 
            ip, 
            details: error.message 
        });

        res.status(500).json({ error: "Security processing failed" });
    }
});

router.get('/recent', async (req, res) => {
    try {
        const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10);
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 10;

        await ensureBucketExists(STORAGE_BUCKET);

        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list('', {
                limit,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) throw error;

        const files = (data || [])
            .filter((item) => item.name && !item.name.endsWith('/'))
            .map((item) => ({
                name: item.name,
                path: item.name,
                createdAt: item.created_at || item.updated_at || null,
                size: item.metadata?.size ?? null,
                mimeType: item.metadata?.mimetype ?? null
            }));

        res.status(200).json({
            bucket: STORAGE_BUCKET,
            files
        });
    } catch (error) {
        console.error('Failed to load recent encrypted files:', error);
        res.status(500).json({ error: 'Failed to load recent encrypted files' });
    }
});

export default router;
