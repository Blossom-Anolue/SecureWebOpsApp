import crypto from 'crypto';
import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { encryptPDF } from '../services/encryptionServices.js';
import { retrieveAndDecryptFile } from '../services/SecureAccessController.js'; // Import the centralized decryption logic
import { decryptPDF } from '../services/decryptionServices.js';
import { logEvent } from '../services/auditService.js';
import rateLimit from 'express-rate-limit';

// --- EMAIL SERVICE CONFIGURATION ---
const EMAIL_FROM_ADDRESS = String(process.env.EMAIL_FROM_ADDRESS || 'no-reply@securewebops.com').trim();
const EMAIL_FROM_NAME = String(process.env.EMAIL_FROM_NAME || 'SecureWebOps').trim();

function hasValue(value) {
    return String(value || '').trim().length > 0;
}

function isPlaceholderEmailValue(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;

    return normalized.includes('your_')
        || normalized.includes('example.com')
        || normalized.includes('yourdomain.com')
        || normalized === 'changeme';
}

function getEnvValue(baseKey, suffix = '') {
    return String(process.env[`${baseKey}${suffix}`] || '').trim();
}

function parseBooleanEnv(baseKey, suffix = '', fallback = false) {
    const rawValue = getEnvValue(baseKey, suffix);
    if (!rawValue) return fallback;
    return rawValue === 'true';
}

function parsePortEnv(baseKey, suffix = '', fallback = 587) {
    const rawValue = getEnvValue(baseKey, suffix);
    const parsedValue = Number.parseInt(rawValue || String(fallback), 10);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function buildEmailTransportConfig(configSuffix = '', label = 'primary') {
    const service = getEnvValue('EMAIL_SMTP_SERVICE', configSuffix);
    const host = getEnvValue('EMAIL_SMTP_HOST', configSuffix);
    const user = getEnvValue('EMAIL_SMTP_USER', configSuffix);
    const pass = getEnvValue('EMAIL_SMTP_PASSWORD', configSuffix);
    const port = parsePortEnv('EMAIL_SMTP_PORT', configSuffix, 587);
    const secure = parseBooleanEnv('EMAIL_SMTP_SECURE', configSuffix, false);
    const requireTls = parseBooleanEnv('EMAIL_SMTP_REQUIRE_TLS', configSuffix, false);

    if ((!service && !host) || isPlaceholderEmailValue(user) || isPlaceholderEmailValue(pass)) {
        return null;
    }

    const transportConfig = {
        port,
        secure,
        // Enable connection pooling to keep SMTP connections alive
        pool: true,
        maxConnections: 5,
        maxMessages: 100
    };

    if (service) {
        transportConfig.service = service;
    } else {
        transportConfig.host = host;
    }

    if (requireTls) {
        transportConfig.requireTLS = true;
    }

    if (user && pass) {
        transportConfig.auth = { user, pass };
    }

    return {
        label,
        config: transportConfig
    };
}

function collectEmailTransportConfigs() {
    const configs = [];
    const primaryConfig = buildEmailTransportConfig('', 'primary');
    if (primaryConfig) {
        configs.push(primaryConfig);
    }

    for (let index = 2; index <= 5; index += 1) {
        const suffix = `_${index}`;
        const providerLabel = getEnvValue('EMAIL_PROVIDER_NAME', suffix) || `provider_${index}`;
        const providerConfig = buildEmailTransportConfig(suffix, providerLabel);
        if (providerConfig) {
            configs.push(providerConfig);
        }
    }

    return configs;
}

function formatFromAddress() {
    return EMAIL_FROM_NAME ? `"${EMAIL_FROM_NAME}" <${EMAIL_FROM_ADDRESS}>` : EMAIL_FROM_ADDRESS;
}

async function sendShareNotificationEmail({ recipientEmail, recipientName, fileName, sharerName, permissionLevel, fileId }) {
    if (!emailTransporters.length) {
        return { delivered: false, reason: 'email_disabled' };
    }

    if (!recipientEmail || !fileName) {
        return { delivered: false, reason: 'missing_recipient_or_file' };
    }

    const accessLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/vault?fileId=${fileId}`;

    let lastError = null;
    for (const emailTransport of emailTransporters) {
        try {
            await emailTransport.transporter.sendMail({
                from: formatFromAddress(),
                to: recipientEmail,
                replyTo: process.env.EMAIL_REPLY_TO || undefined,
                subject: `File Shared: ${fileName} on SecureWebOps`,
                html: `<p>Hello ${recipientName || 'there'},</p><p>${sharerName} has shared a file with you on SecureWebOps:</p><p><strong>File Name:</strong> ${fileName}</p><p><strong>Access Level:</strong> ${permissionLevel}</p><p>You can access it here: <a href="${accessLink}">${accessLink}</a></p><p>Please log in to SecureWebOps to view or download the file.</p><p>Thank you,<br/>The SecureWebOps Team</p>`,
                text: `Hello ${recipientName || 'there'},

${sharerName} has shared a file with you on SecureWebOps.

File Name: ${fileName}
Access Level: ${permissionLevel}
Access Link: ${accessLink}

Please log in to SecureWebOps to view or download the file.

Thank you,
The SecureWebOps Team`,
            });

            return { delivered: true, provider: emailTransport.label };
        } catch (error) {
            lastError = error;
            console.error(`Email send failed via ${emailTransport.label}:`, error.message || error);
        }
    }

    if (lastError) {
        throw lastError;
    }

    return { delivered: false, reason: 'email_disabled' };
}

const emailTransporters = collectEmailTransportConfigs().map(({ label, config }) => ({
    label,
    description: config.service || config.host || label,
    transporter: nodemailer.createTransport(config)
}));

if (emailTransporters.length) {
    for (const emailTransport of emailTransporters) {
        emailTransport.transporter.verify((error) => {
            if (error) {
                console.error(`Email transporter configuration error (${emailTransport.label}):`, error.message);
                if (error.responseCode === 535) {
                    console.error("Hint: 535 Authentication failed means your SMTP username or password is incorrect.");
                    console.error("Hint: If using Gmail, use an App Password instead of your normal password.");
                }
            } else {
                console.log(`Email transporter ready to send messages via ${emailTransport.description}.`);
            }
        });
    }
} else {
    console.warn("[WARN] Email notifications are disabled. Configure EMAIL_SMTP_SERVICE or EMAIL_SMTP_HOST with valid credentials.");
    console.warn("[WARN] You can also configure fallback providers with EMAIL_SMTP_HOST_2 / EMAIL_SMTP_SERVICE_2 and matching credentials.");
}

if (!process.env.FRONTEND_URL) {
    console.warn("FRONTEND_URL environment variable is not set. Share links in emails will be incomplete.");
}

const router = express.Router();

// Strict rate limiter for password/auth routes (3 attempts per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 3,
    message: { error: "Too many decryption attempts from this IP. Please try again after 15 minutes." },
    standardHeaders: true,
    legacyHeaders: false,
});

const upload = multer({ storage: multer.memoryStorage() });
const PERMISSION_LEVELS = new Set(['VIEW', 'DOWNLOAD', 'DECRYPT', 'ADMIN']);

function sanitizeStorageSegment(value) {
    const normalized = String(value || 'document.pdf')
        .normalize('NFKC')
        .replace(/[/\\]/g, '_')
        .replace(/[^\w.\- ]+/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[\._]+|[\._]+$/g, '') // SECURITY: Block hidden files and leading dots/underscores
        .substring(0, 200); // SECURITY: Prevent extremely long buffer-overflow filenames

    return normalized || 'document.pdf';
}

function jsonError(res, status, code, message) {
    return res.status(status).json({ error: { code, message } });
}

function isMissingColumnError(error, columnNames = []) {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const combined = `${message} ${details} ${hint}`;

    if (!combined) return false;

    return columnNames.some((columnName) => combined.includes(String(columnName).toLowerCase()))
        || error?.code === 'PGRST204'
        || error?.code === '42703';
}

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function parseShareExpiry(value) {
    if (value == null || value === '') return null;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        const error = new Error('Invalid share expiration timestamp.');
        error.status = 400;
        throw error;
    }

    const now = Date.now();
    const maxLifetimeMs = Math.max(1, MAX_SHARE_LIFETIME_DAYS) * 24 * 60 * 60 * 1000;
    if (date.getTime() <= now) {
        const error = new Error('Share expiration must be in the future.');
        error.status = 400;
        throw error;
    }

    if (date.getTime() - now > maxLifetimeMs) {
        const error = new Error(`Share expiration cannot exceed ${MAX_SHARE_LIFETIME_DAYS} days.`);
        error.status = 400;
        throw error;
    }

    return date.toISOString();
}

function computeEncryptedBlobSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isShareActive(permissionEntry) {
    if (!permissionEntry) return false;
    if (permissionEntry.revoked_at) return false;
    if (permissionEntry.expires_at && new Date(permissionEntry.expires_at).getTime() <= Date.now()) return false;
    return true;
}

async function authenticateBearerToken(req) {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
        return { error: { status: 401, code: 'missing_authorization', message: 'Missing Authorization: Bearer <token>' } };
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
        return { error: { status: 401, code: 'invalid_authorization', message: 'Bearer token is empty' } };
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
        return { error: { status: 401, code: 'invalid_token', message: 'Invalid or expired bearer token' } };
    }

    return { user: data.user };
}

router.use(async (req, res, next) => {
    const authResult = await authenticateBearerToken(req);
    if (authResult.error) return jsonError(res, authResult.error.status, authResult.error.code, authResult.error.message);
    req.user = authResult.user;
    next();
});

// Initialize Supabase Connection
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase admin env vars. Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_KEY.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const STORAGE_BUCKET = process.env.PDF_STORAGE_BUCKET || 'pdfs';
const MASTER_SECRET = process.env.KMS_MASTER_SECRET;
const GCM_IV_LENGTH = 12;
const GCM_AUTH_TAG_LENGTH = 16;
const MAX_SHARE_LIFETIME_DAYS = Number.parseInt(process.env.PDF_SHARE_MAX_DAYS || '30', 10);
const PDF_HARDENED_SCHEMA = true;

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

function extractEmbeddedEncryptionMetadata(encryptedBuffer) {
    if (!encryptedBuffer || encryptedBuffer.length < GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH) {
        throw new Error('Encrypted file metadata is unavailable.');
    }

    return {
        iv: Buffer.from(encryptedBuffer.subarray(0, GCM_IV_LENGTH)).toString('hex'),
        auth_tag: Buffer.from(encryptedBuffer.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_AUTH_TAG_LENGTH)).toString('hex')
    };
}

async function getEncryptedBufferForRecord(record) {
    if (!record?.storage_path) {
        throw new Error('Storage path is missing for encrypted file metadata sync.');
    }

    const bucketName = record.storage_bucket || STORAGE_BUCKET;
    const { data: blob, error } = await supabase.storage
        .from(bucketName)
        .download(record.storage_path);

    if (error) {
        throw new Error(`Failed to download encrypted file metadata: ${error.message}`);
    }

    return Buffer.from(await blob.arrayBuffer());
}

async function syncLegacyFileRecord(record, encryptedBuffer = null) {
    const encryptionMetadata = extractEmbeddedEncryptionMetadata(
        encryptedBuffer || await getEncryptedBufferForRecord(record)
    );

    const legacyRecord = {
        id: record.id,
        file_name: record.original_file_name || record.file_name,
        storage_path: record.storage_path,
        owner_id: record.user_id,
        ...encryptionMetadata
    };

    const { error } = await supabase
        .from('files')
        .upsert([legacyRecord], { onConflict: 'id' });

    if (error) {
        throw new Error(`Failed to sync file metadata for sharing: ${error.message}`);
    }
}

async function fetchEncryptedPdfRecord(fileId) {
    const fullSelect = 'id, user_id, organization_id, original_file_name, encrypted_file_name, storage_bucket, storage_path, file_size_bytes, mime_type, key_label, encrypted_sha256, created_at';
    const legacySelect = 'id, user_id, organization_id, original_file_name, encrypted_file_name, storage_bucket, storage_path, file_size_bytes, mime_type, key_label, created_at';

    let { data, error } = await supabase
        .from('encrypted_pdfs')
        .select(PDF_HARDENED_SCHEMA ? fullSelect : legacySelect)
        .eq('id', fileId)
        .maybeSingle();

    if (PDF_HARDENED_SCHEMA && error && isMissingColumnError(error, ['encrypted_sha256'])) {
        ({ data, error } = await supabase
            .from('encrypted_pdfs')
            .select(legacySelect)
            .eq('id', fileId)
            .maybeSingle());
    }

    if (error) throw error;
    return data;
}

async function findAuthUserByEmail(email) {
    const normalizedEmail = normalizeEmail(email);

    try {
        const { data, error } = await supabase
            .schema('auth')
            .from('users')
            .select('id, email')
            .ilike('email', normalizedEmail)
            .maybeSingle();

        if (!error && data?.id) {
            return data;
        }

        if (error) {
            console.warn('Direct auth.users email lookup failed:', error.message);
        }
    } catch (error) {
        console.warn('Direct auth.users email lookup threw:', error.message);
    }

    let page = 1;
    const perPage = 1000;

    while (page <= 100) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;

        const match = data?.users?.find((user) => user.email?.toLowerCase() === normalizedEmail);
        if (match) return match;

        if (!data?.users || data.users.length < perPage) break;
        page += 1;
    }

    return null;
}

async function resolveShareRecipient(targetUserId, requester = null) {
    const recipient = String(targetUserId || '').trim();
    if (!recipient) {
        return { error: { status: 400, message: "Recipient Email or Username is required." } };
    }
    
    if (/[<>]/.test(recipient)) {
        return { error: { status: 400, message: "Invalid characters in recipient." } };
    }

    const requesterEmail = String(requester?.email || '').trim().toLowerCase();
    if (requesterEmail && recipient.toLowerCase() === requesterEmail) {
        return {
            userId: requester.id,
            profile: {
                email: requester.email || null,
                full_name: null
            }
        };
    }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient);
    if (isUUID) {
        const { data: profileData } = await supabase
            .from('profiles')
            .select('id, email, full_name, username')
            .eq('id', recipient)
            .maybeSingle();

        if (profileData) {
            return { userId: profileData.id, profile: profileData };
        }

        const { data, error } = await supabaseAdmin.auth.admin.getUserById(recipient);
        if (error || !data?.user) {
            return { error: { status: 404, message: "User not found with that ID." } };
        }

        return {
            userId: data.user.id,
            profile: {
                email: data.user.email || null,
                full_name: null,
                username: null
            }
        };
    }

    let { data: userProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, username')
        .ilike('email', recipient)
        .maybeSingle();

    if (!userProfile && !profileErr) {
        ({ data: userProfile, error: profileErr } = await supabase
            .from('profiles')
            .select('id, email, full_name, username')
            .ilike('username', recipient)
            .maybeSingle());
    }

    if (profileErr) throw profileErr;

    if (!userProfile) {
        const authUser = await findAuthUserByEmail(recipient);
        if (!authUser) {
            return { error: { status: 404, message: "User not found with that email address or username. Make sure they have an account." } };
        }

        return {
            userId: authUser.id,
            profile: {
                email: authUser.email || null,
                full_name: null
            }
        };
    }

    return {
        userId: userProfile.id,
        profile: userProfile
    };
}

function formatAccessibleFile(record, permissionLevel, owned = false, sharedAt = null) {
    return {
        id: record.id,
        name: record.original_file_name || record.encrypted_file_name || 'Untitled Document',
        originalFileName: record.original_file_name,
        path: record.storage_path || '',
        createdAt: sharedAt || record.created_at || null,
        mimeType: record.mime_type || 'application/pdf',
        keyLabel: record.key_label || null,
        organizationId: record.organization_id || null,
        permissionLevel,
        owned
    };
}

async function fetchAccessiblePdfRecords(userId, limit = 50) {
    const { data: ownedFiles, error: ownedError } = await supabase
        .from('encrypted_pdfs')
        .select('id, user_id, organization_id, original_file_name, encrypted_file_name, storage_bucket, storage_path, file_size_bytes, mime_type, key_label, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (ownedError) throw ownedError;

    let { data: permissionRows, error: permissionError } = await supabase
        .from('file_permissions')
        .select(PDF_HARDENED_SCHEMA
            ? 'file_id, permission_level, created_at, expires_at, revoked_at'
            : 'file_id, permission_level, created_at, expires_at')
        .eq('user_id', userId);

    if (PDF_HARDENED_SCHEMA && permissionError && isMissingColumnError(permissionError, ['expires_at', 'revoked_at'])) {
        ({ data: permissionRows, error: permissionError } = await supabase
            .from('file_permissions')
            .select('file_id, permission_level, created_at, expires_at')
            .eq('user_id', userId));
    }

    if (permissionError && isMissingColumnError(permissionError, ['expires_at'])) {
        ({ data: permissionRows, error: permissionError } = await supabase
            .from('file_permissions')
            .select('file_id, permission_level, created_at')
            .eq('user_id', userId));
    }

    if (permissionError) throw permissionError;

    const ownedById = new Map((ownedFiles || []).map((file) => [file.id, file]));
    const sharedIds = (permissionRows || [])
        .filter((row) => isShareActive(row))
        .map((row) => row.file_id)
        .filter((fileId) => fileId && !ownedById.has(fileId));

    let sharedFiles = [];
    if (sharedIds.length > 0) {
        const { data, error } = await supabase
            .from('encrypted_pdfs')
            .select('id, user_id, organization_id, original_file_name, encrypted_file_name, storage_bucket, storage_path, file_size_bytes, mime_type, key_label, created_at')
            .in('id', sharedIds);

        if (error) throw error;
        sharedFiles = data || [];
    }

    const sharedDataByFileId = new Map(
        (permissionRows || []).map((row) => [row.file_id, { level: row.permission_level, sharedAt: row.created_at }])
    );

    return [
        ...(ownedFiles || []).map((file) => formatAccessibleFile(file, 'ADMIN', true)),
        ...sharedFiles.map((file) => {
            const shareData = sharedDataByFileId.get(file.id) || { level: 'VIEW', sharedAt: null };
            return formatAccessibleFile(file, shareData.level, false, shareData.sharedAt);
        })
    ]
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, limit);
}

// --- ACCESS CONTROL MIDDLEWARE ---
const checkPermission = (requiredLevel) => async (req, res, next) => {
    const userId = req.user?.id;
    if (!userId) {
        return res.status(401).json({ error: { code: 'unauthenticated', message: 'Authentication required.' } });
    }
    const { fileId } = req.params;

    try {
        let effectivePermissionLevel = 'NONE';

        // 1. Check for explicit permissions in file_permissions table
        let { data: permissionEntry, error: permissionError } = await supabase
            .from('file_permissions')
            .select(PDF_HARDENED_SCHEMA
                ? 'permission_level, expires_at, revoked_at'
                : 'permission_level, expires_at')
            .eq('file_id', fileId)
            .eq('user_id', userId)
            .maybeSingle();

        if (PDF_HARDENED_SCHEMA && permissionError && isMissingColumnError(permissionError, ['expires_at', 'revoked_at'])) {
            ({ data: permissionEntry, error: permissionError } = await supabase
                .from('file_permissions')
                .select('permission_level, expires_at')
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .maybeSingle());
        }

        if (permissionError && isMissingColumnError(permissionError, ['expires_at'])) {
            ({ data: permissionEntry, error: permissionError } = await supabase
                .from('file_permissions')
                .select('permission_level')
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .maybeSingle());
        }

        if (permissionError) throw permissionError;

        if (isShareActive(permissionEntry)) {
            effectivePermissionLevel = permissionEntry.permission_level;
        }

        // 2. Owner access must always override any lower shared permission
        const { data: ownerFile, error: ownerError } = await supabase
            .from('encrypted_pdfs')
            .select('user_id')
            .eq('id', fileId)
            .eq('user_id', userId)
            .maybeSingle();

        if (ownerError) throw ownerError;

        if (ownerFile) {
            effectivePermissionLevel = 'ADMIN';
        }

        const levels = { 'NONE': 0, 'VIEW': 1, 'DOWNLOAD': 2, 'DECRYPT': 3, 'ADMIN': 4 };
        if (levels[effectivePermissionLevel] < levels[requiredLevel]) {
            await logEvent({ 
                action: 'UNAUTHORIZED_ACCESS', 
                user: userId, 
                status: 'BLOCKED', 
                ip: req.ip,
                fileId: fileId,
                details: `Attempted access level: ${requiredLevel}, Effective level: ${effectivePermissionLevel}`
            });
            return res.status(403).json({ error: "Access Denied: Insufficient privileges." });
        }

        next();
    } catch (err) {
        console.error("Permission check failed:", err);
        res.status(500).json({ error: "Permission check failed." }); // Generic error to avoid leaking info
    }
};

// --- UPLOAD & ENCRYPT ---
router.post('/upload', upload.single('pdf'), async (req, res) => {
    console.log('--- PDF UPLOAD START ---');
    console.log('Request received for file:', req.file?.originalname);
    // Capture metadata for the Audit Log
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const fileName = req.file?.originalname || 'unknown_file';
    const safeStorageFileName = sanitizeStorageSegment(fileName);
    const userId = req.user?.id;

    if (!userId) {
        console.log('No user ID');
        return res.status(401).json({ error: "Unauthorized: user not authenticated." });
    }

    if (!req.file) {
        console.log('No file provided');
        return res.status(400).json({ error: "No file provided." });
    }

    if (/[<>]/.test(fileName)) {
        return res.status(400).json({ error: "Security Policy: File name contains invalid characters (< or >)." });
    }

    const mimeType = req.file.mimetype || 'application/octet-stream';
    const isPdf = fileName.toLowerCase().endsWith('.pdf'); // STRICT SECURITY: Trust only the extension, not the spoofable MIME
    if (!isPdf) {
        return res.status(400).json({ error: "Security Policy: Only files ending in .pdf are permitted." });
    }

    console.log('Starting encryption');
    try {
        // 1. COMPLIANCE: Log the initial attempt
        await logEvent({ action: 'UPLOAD_ATTEMPT', fileName, status: 'PENDING', ip });

        const fileBuffer = req.file.buffer;
        const secretKey = MASTER_SECRET;
        const keyLabel = process.env.KMS_KEY_LABEL || 'kms-master-v1';
        const encryptedAt = new Date().toISOString();

        if (!secretKey) {
            console.error('Upload Error: KMS_MASTER_SECRET is missing.');
            return res.status(500).json({ error: 'Server misconfiguration: encryption key not set.' });
        }

        // 2. Run the Encryption Logic (AES-256-GCM)
        let encryptedData;
        try {
            encryptedData = encryptPDF(fileBuffer, secretKey);
            console.log('Encryption successful, size:', encryptedData.length);
        } catch (cryptoError) {
            console.error('Encryption failed:', cryptoError.message);
            return res.status(500).json({ error: 'Failed to encrypt file. Please check server KMS configuration.' });
        }

        // 3. Upload the encrypted blob to Supabase Storage
        const cloudFileName = `secure_${Date.now()}_${safeStorageFileName}.enc`;
        console.log('Ensuring bucket exists');
        await ensureBucketExists(STORAGE_BUCKET);
        
        console.log('Inserting file record');
        const insertPayload = { 
            original_file_name: fileName,
            encrypted_file_name: cloudFileName,
            storage_path: cloudFileName,
            storage_bucket: STORAGE_BUCKET,
            user_id: userId,
            mime_type: 'application/pdf',
            key_label: keyLabel,
            file_size_bytes: encryptedData.length
        };

        let { data: fileRecord, error: fileErr } = await supabase
            .from('encrypted_pdfs')
            .insert([PDF_HARDENED_SCHEMA
                ? { ...insertPayload, encrypted_sha256: computeEncryptedBlobSha256(encryptedData) }
                : insertPayload
            ]).select().single();

        if (PDF_HARDENED_SCHEMA && fileErr && isMissingColumnError(fileErr, ['encrypted_sha256'])) {
            ({ data: fileRecord, error: fileErr } = await supabase
                .from('encrypted_pdfs')
                .insert([insertPayload]).select().single());
        }

        if (fileErr) {
            console.error('DB insert error:', fileErr);
            throw fileErr;
        }
        console.log('File record inserted, ID:', fileRecord.id);

        try {
            await syncLegacyFileRecord(fileRecord, encryptedData);
        } catch (syncError) {
            await supabase.from('encrypted_pdfs').delete().eq('id', fileRecord.id);
            throw syncError;
        }

        console.log('Uploading to storage');
        
        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(cloudFileName, encryptedData, {
                contentType: 'application/octet-stream',
                upsert: false
            });

        if (error) {
            console.error('Storage upload error:', error);
            await Promise.allSettled([
                supabase.from('file_permissions').delete().eq('file_id', fileRecord.id),
                supabase.from('files').delete().eq('id', fileRecord.id),
                supabase.from('encrypted_pdfs').delete().eq('id', fileRecord.id)
            ]);
            throw error;
        }
        console.log('Storage upload successful');

        // 4. COMPLIANCE: Log the final success
        await logEvent({ 
            action: 'FILE_ENCRYPTED_STORED', 
            fileName: fileName, 
            fileId: fileRecord.id, 
            user: userId, 
            status: 'SUCCESS', 
            ip,
            details: `Original size: ${fileBuffer.length} bytes` 
        });
        
        console.log('--- PDF UPLOAD END ---');
        console.log('Upload completed successfully');
        res.status(200).json({
            success: true,
            message: "Securely Encrypted, Logged, and Stored in Cloud.",
            path: data.path,
            fileId: fileRecord.id,
            bucket: STORAGE_BUCKET,
            originalFileName: fileName,
            encryptedFileName: cloudFileName,
            encryptedAt,
            keyLabel
        });
    } catch (error) {
        console.error("--- PDF UPLOAD ERROR ---");
        console.error("Upload Error:", error.message);
        res.status(500).json({ error: "Failed to encrypt or store file." });
    }
});

// --- DOWNLOAD & DECRYPT ---
router.post('/download/:fileId', authLimiter, checkPermission('VIEW'), async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: "Password is required for decryption." });
    }

    if (/[<>'"]/.test(password)) {
        return res.status(400).json({ error: "Security Policy: Password contains invalid characters." });
    }

    try {
        // 1. Verify password using a temporary isolated client to prevent polluting the global server session
        const tempAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false, autoRefreshToken: false }
        });
        
        const { error: signInError } = await tempAuthClient.auth.signInWithPassword({
            email: userEmail,
            password: password,
        });

        if (signInError) {
            await logEvent({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                status: 'BLOCKED',
                user: userId,
                fileId: fileId,
                ip: req.ip,
                details: 'Blocked decryption attempt due to incorrect password.'
            });
            return res.status(401).json({ error: "Invalid password. Decryption denied." });
        }

        // Use the centralized secure access controller for retrieval and decryption
        const { buffer: decryptedBuffer, fileName, mimeType } = await retrieveAndDecryptFile(userId, fileId); 

        let safeName = sanitizeStorageSegment(fileName);
        if (!safeName.toLowerCase().endsWith('.pdf')) safeName += '.pdf';

        res.setHeader('Content-Type', mimeType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.send(decryptedBuffer);
    } catch (error) {
        console.error("Critical Security Error:", error);
        const message = String(error.message || '');
        const normalizedMessage = message.toLowerCase();
        const status = normalizedMessage.includes('access denied')
            ? 403
            : normalizedMessage.includes('not found')
              ? 404
              : 500;
        res.status(status).json({ error: message || "Decryption failed." });
    }
});

// --- DOWNLOAD RAW ENCRYPTED ---
router.get('/raw/:fileId', checkPermission('DOWNLOAD'), async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user?.id;

    try {
        const file = await fetchEncryptedPdfRecord(fileId);
        if (!file) {
            return res.status(404).json({ error: "File not found." });
        }

        const bucketName = file.storage_bucket || STORAGE_BUCKET;
        const { data: blob, error } = await supabase.storage
            .from(bucketName)
            .download(file.storage_path);

        if (error) {
            throw new Error(`Failed to download encrypted file from storage: ${error.message}`);
        }

        const buffer = Buffer.from(await blob.arrayBuffer());

        try {
            await logEvent({ 
                action: 'FILE_DOWNLOAD_RAW', 
                user: userId, 
                status: 'SUCCESS', 
                fileId: fileId,
                fileName: file.original_file_name || file.encrypted_file_name || 'encrypted_file',
                ip: req.ip,
                details: 'Downloaded raw encrypted file'
            });
        } catch (logErr) {
            console.warn("[AUDIT LOG WARNING] Could not log FILE_DOWNLOAD_RAW (likely DB enum constraint):", logErr.message);
            await logEvent({ 
                action: 'FILE_DECRYPT_SUCCESS', 
                user: userId, 
                status: 'SUCCESS', 
                fileId: fileId,
                fileName: file.original_file_name || file.encrypted_file_name || 'encrypted_file',
                ip: req.ip,
                details: '[RAW] Downloaded raw encrypted file directly'
            }).catch(() => {});
        }

        const baseName = String(file.original_file_name || file.encrypted_file_name || 'document').replace(/\.enc$/i, '').replace(/\.pdf$/i, '');
        let safeName = sanitizeStorageSegment(baseName + '_encrypted.enc');
        if (!safeName.toLowerCase().endsWith('.enc')) safeName += '.enc';

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.send(buffer);
    } catch (error) {
        console.error("Raw Download Error:", error);
        res.status(500).json({ error: "Failed to download raw file." });
    }
});

// --- SHARE ACCESS ---
router.post('/share/:fileId', checkPermission('ADMIN'), async (req, res) => {
    const { targetUserId, level, expiresAt } = req.body; 
    const { fileId } = req.params;
    const adminId = req.user.id;

    try {
        const normalizedLevel = String(level || 'DOWNLOAD').trim().toUpperCase();
        if (!PERMISSION_LEVELS.has(normalizedLevel)) {
            return res.status(400).json({ error: "Invalid permission level. Use VIEW, DOWNLOAD, or ADMIN." });
        }
        const shareExpiresAt = parseShareExpiry(expiresAt);

        const fileRecord = await fetchEncryptedPdfRecord(fileId);
        if (!fileRecord) {
            return res.status(404).json({ error: "File not found." });
        }

        await syncLegacyFileRecord(fileRecord);

        const recipient = await resolveShareRecipient(targetUserId, req.user);
        if (recipient.error) {
            return res.status(recipient.error.status).json({ error: recipient.error.message });
        }

        if (recipient.userId === adminId) {
            await logEvent({
                action: 'ACCESS_GRANTED',
                user: adminId,
                status: 'SUCCESS',
                fileId,
                ip: req.ip,
                details: `Owner access confirmed for ${adminId}; no share record required.`
            });

            return res.json({ message: "You already have owner access to this file." });
        }

        const sharePayload = {
            file_id: fileId, 
            user_id: recipient.userId, 
            permission_level: normalizedLevel,
            granted_by: adminId,
            expires_at: shareExpiresAt
        };

        let { error } = await supabase
            .from('file_permissions')
            .upsert([PDF_HARDENED_SCHEMA
                ? {
                    ...sharePayload,
                    revoked_at: null,
                    revoked_by: null,
                    revoke_reason: null
                }
                : sharePayload
            ], { onConflict: 'file_id,user_id' });

        if (PDF_HARDENED_SCHEMA && error && isMissingColumnError(error, ['revoked_at', 'revoked_by', 'revoke_reason'])) {
            ({ error } = await supabase
                .from('file_permissions')
                .upsert([sharePayload], { onConflict: 'file_id,user_id' }));
        }

        if (error && isMissingColumnError(error, ['expires_at'])) {
            const { expires_at, ...basicPayload } = sharePayload;
            ({ error } = await supabase
                .from('file_permissions')
                .upsert([basicPayload], { onConflict: 'file_id,user_id' }));
        }

        if (error) throw error;

        const recipientDisplay = recipient.profile?.username || recipient.profile?.email || recipient.profile?.full_name || recipient.userId;
        const recipientInfo = recipientDisplay === recipient.userId ? recipient.userId : `${recipientDisplay} (ID: ${recipient.userId})`;

        // Log the access grant event
        await logEvent({ 
            action: 'ACCESS_GRANTED', 
            user: adminId, 
            status: 'SUCCESS', 
            fileId: fileId,
            ip: req.ip,
            details: `Granted ${normalizedLevel} to ${recipientInfo}${shareExpiresAt ? ` until ${shareExpiresAt}` : ''}` 
        });

        // --- EMAIL NOTIFICATION LOGIC ---
        // Fetch file name for email
        const { data: fileData, error: fileFetchError } = await supabase
            .from('encrypted_pdfs')
            .select('original_file_name')
            .eq('id', fileId)
            .single();

        if (fileFetchError) {
            console.error('Error fetching file data for share email:', fileFetchError);
            // Continue without email if file data is missing
        }

        // Fetch recipient email and name
        const recipientProfile = recipient.profile;

        // Fetch sharer name
        const { data: sharerProfile, error: sharerError } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', adminId)
            .single();

        const sharerName = sharerProfile?.full_name || 'A user';

        // Send email notification if recipient email and file name are available
        if (recipientProfile?.email && fileData?.original_file_name) {
            sendShareNotificationEmail({
                recipientEmail: recipientProfile.email,
                recipientName: recipientProfile.full_name || null,
                fileName: fileData.original_file_name,
                sharerName,
                permissionLevel: normalizedLevel,
                fileId
            }).then((result) => {
                if (result.delivered) {
                    console.log(`Shared email sent to ${recipientProfile.email} for file ${fileId} via ${result.provider || 'configured provider'}`);
                } else {
                    console.log(`Email notification skipped (${result.reason}) for ${recipientProfile.email} on file ${fileId}`);
                }
            }).catch((emailError) => {
                console.error('Error sending share email:', emailError.message || emailError);
            });
        }
        
        res.json({ message: "Access updated successfully." });
    } catch (error) {
        console.error("SHARE ERROR:", error);
        const status = Number.isInteger(error?.status) ? error.status : 500;
        res.status(status).json({ error: status >= 500 ? "Sharing failed." : error.message });
    }
});

router.post('/share/:fileId/revoke', checkPermission('ADMIN'), async (req, res) => {
    const { fileId } = req.params;
    const adminId = req.user?.id;
    const { targetUserId, reason } = req.body || {};

    try {
        const recipient = await resolveShareRecipient(targetUserId, req.user);
        if (recipient.error) {
            return res.status(recipient.error.status).json({ error: recipient.error.message });
        }

        const revokeReason = String(reason || 'Revoked by file owner').trim().slice(0, 250) || 'Revoked by file owner';

        if (/[<>]/.test(revokeReason)) {
            return res.status(400).json({ error: "Invalid characters in revoke reason." });
        }

        let data;
        let error;
        if (PDF_HARDENED_SCHEMA) {
            ({ data, error } = await supabase
                .from('file_permissions')
                .update({
                    revoked_at: new Date().toISOString(),
                    revoked_by: adminId,
                    revoke_reason: revokeReason
                })
                .eq('file_id', fileId)
                .eq('user_id', recipient.userId)
                .is('revoked_at', null)
                .select('id')
                .maybeSingle());

            if (error && isMissingColumnError(error, ['revoked_at', 'revoked_by', 'revoke_reason'])) {
                ({ data, error } = await supabase
                    .from('file_permissions')
                    .delete()
                    .eq('file_id', fileId)
                    .eq('user_id', recipient.userId)
                    .select('id')
                    .maybeSingle());
            }
        } else {
            ({ data, error } = await supabase
                .from('file_permissions')
                .delete()
                .eq('file_id', fileId)
                .eq('user_id', recipient.userId)
                .select('id')
                .maybeSingle());
        }

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ error: "Active share not found for that user." });
        }

        const recipientDisplay = recipient.profile?.username || recipient.profile?.email || recipient.profile?.full_name || recipient.userId;
        const recipientInfo = recipientDisplay === recipient.userId ? recipient.userId : `${recipientDisplay} (ID: ${recipient.userId})`;

        await logEvent({
            action: 'ACCESS_REVOKED',
            user: adminId,
            status: 'SUCCESS',
            fileId,
            ip: req.ip,
            details: `Revoked access for ${recipientInfo}: ${revokeReason}`
        });

        res.json({ message: 'Access revoked successfully.' });
    } catch (error) {
        console.error('SHARE REVOKE ERROR:', error);
        res.status(500).json({ error: 'Failed to revoke access.' });
    }
});

// --- REMOVE SELF FROM SHARED FILE ---
router.delete('/share/:fileId/remove', async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user?.id;

    try {
        let data;
        let error;
        if (PDF_HARDENED_SCHEMA) {
            ({ data, error } = await supabase
                .from('file_permissions')
                .update({
                    revoked_at: new Date().toISOString(),
                    revoked_by: userId,
                    revoke_reason: 'Self-revoked by user'
                })
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .is('revoked_at', null)
                .select('id')
                .maybeSingle());

            if (error && isMissingColumnError(error, ['revoked_at', 'revoked_by', 'revoke_reason'])) {
                ({ data, error } = await supabase
                    .from('file_permissions')
                    .delete()
                    .eq('file_id', fileId)
                    .eq('user_id', userId)
                    .select('id')
                    .maybeSingle());
            }
        } else {
            ({ data, error } = await supabase
                .from('file_permissions')
                .delete()
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .select('id')
                .maybeSingle());
        }

        if (error) throw error;
        if (!data) {
            return res.status(404).json({ error: "Active share not found." });
        }

        res.json({ message: 'File removed from your vault successfully.' });
    } catch (error) {
        console.error('REMOVE SHARED ERROR:', error);
        res.status(500).json({ error: 'Failed to remove shared file.' });
    }
});

// --- GET RECENT (Fallback for components that might still poll it) ---
router.get('/recent', async (req, res) => {
    try {
        const requestedLimit = Number.parseInt(String(req.query.limit || '10'), 10);
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 50) : 10;

        await ensureBucketExists(STORAGE_BUCKET);
        const { data, error: storageErr } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list('', {
                limit,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (storageErr) throw storageErr;

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

// --- GET ACCESSIBLE FILES ---
router.get('/files', async (req, res) => {
    try {
        const userId = req.user?.id;
        const requestedLimit = Number.parseInt(String(req.query.limit || '50'), 10);
        const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;

        const files = await fetchAccessiblePdfRecords(userId, limit);

        res.status(200).json({
            bucket: STORAGE_BUCKET,
            files
        });
    } catch (error) {
        console.error('Failed to load accessible encrypted files:', error);
        res.status(500).json({ error: 'Failed to load encrypted files' });
    }
});

// --- DELETE ---
router.delete('/:fileId', checkPermission('ADMIN'), async (req, res) => {
    const { fileId } = req.params;
    const userId = req.user?.id;

    try {
        const file = await fetchEncryptedPdfRecord(fileId);
        if (!file) {
            return res.status(404).json({ error: "File not found or you lack permissions." });
        }

        try {
            await syncLegacyFileRecord(file);
        } catch (syncError) {
            console.warn(`[SECURITY] Failed to sync legacy metadata before delete for ${fileId}: ${syncError.message}`);
        }

        const cleanupErrors = [];
        const bucketName = file.storage_bucket || STORAGE_BUCKET;

        if (file.storage_path) {
            const { error: storageErr } = await supabase.storage
                .from(bucketName)
                .remove([file.storage_path]);

            if (storageErr && !/not[\s_-]*found/i.test(storageErr.message || '')) {
                cleanupErrors.push(`storage: ${storageErr.message}`);
                console.error(`[SECURITY] Storage deletion failed for ${file.storage_path}: ${storageErr.message}`);
            }
        }

        const permissionDelete = await supabase.from('file_permissions').delete().eq('file_id', fileId);
        if (permissionDelete.error) {
            cleanupErrors.push(`permissions: ${permissionDelete.error.message}`);
        }

        const legacyDelete = await supabase.from('files').delete().eq('id', fileId);
        if (legacyDelete.error) {
            cleanupErrors.push(`files: ${legacyDelete.error.message}`);
        }

        const pdfDelete = await supabase
            .from('encrypted_pdfs')
            .delete()
            .eq('id', fileId);
        if (pdfDelete.error) {
            cleanupErrors.push(`encrypted_pdfs: ${pdfDelete.error.message}`);
        }

        if (pdfDelete.error) {
            throw new Error(`Database cleanup failed during file purge. ${cleanupErrors.join(' | ')}`.trim());
        }

        await logEvent({ 
            action: 'FILE_PURGED', 
            user: userId, 
            status: 'SUCCESS', 
            fileId: fileId,
            fileName: file.original_file_name,
            ip: req.ip,
            details: cleanupErrors.length
                ? `File purged with non-blocking cleanup warnings: ${cleanupErrors.join(' | ')}`
                : 'File record and storage object purged by admin.'
        });

        res.json({
            success: true,
            message: cleanupErrors.length
                ? "File purged successfully with cleanup warnings."
                : "File purged successfully.",
            warnings: cleanupErrors
        });
    } catch (err) {
        console.error("Purge Error:", err.message);
        res.status(500).json({ error: "Delete failed.", details: err.message });
    }
});

// --- SECURE EXTERNAL UPLOAD & DECRYPT RECOVERY ---
router.post('/decrypt-external', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No encrypted file provided." });
        }

        if (/[<>]/.test(req.file.originalname)) {
            return res.status(400).json({ error: "Security Policy: File name contains invalid characters (< or >)." });
        }

        const userId = req.user.id;
        const uploadedBuffer = req.file.buffer;

        // Determine if user is a Global System Admin (can recover orphan/deleted files)
        const userEmail = req.user.email?.toLowerCase();
        const adminEmails = String(process.env.SYSTEM_ADMIN_EMAILS || '')
            .toLowerCase()
            .split(',')
            .map(e => e.trim())
            .filter(e => e);
        const isSystemAdmin = req.user.app_metadata?.role === 'admin' || req.user.app_metadata?.role === 'superadmin' || adminEmails.includes(userEmail);

        // 1. Hash the uploaded file to cryptographically identify it in the database
        const fileHash = computeEncryptedBlobSha256(uploadedBuffer);

        let { data: fileRecord, error: dbError } = await supabase
            .from('encrypted_pdfs')
            .select('id, user_id, organization_id, original_file_name')
            .eq('encrypted_sha256', fileHash)
            .maybeSingle();

        // 1.5 Auto-Heal Old Files: If hash lookup fails (old file), try matching the filename
        if (!fileRecord) {
            const possibleOriginalName = req.file.originalname.replace(/_encrypted\.pdf$/i, '.pdf').replace(/\.enc$/i, '.pdf');
            const { data: legacyRecord } = await supabase
                .from('encrypted_pdfs')
                .select('id, user_id, organization_id, original_file_name')
                .eq('original_file_name', possibleOriginalName)
                .eq('user_id', userId)
                .maybeSingle();

            if (legacyRecord) {
                fileRecord = legacyRecord;
                // Heal the database by saving the hash for future strict lookups
                const { error: healError } = await supabase.from('encrypted_pdfs').update({ encrypted_sha256: fileHash }).eq('id', fileRecord.id);
                if (healError) console.warn("[RECOVERY] Auto-heal failed:", healError.message);
            }
        }

        // 2. Validate Access (Personal vs Company)
        let isAuthorized = false;

        if (fileRecord) {
            // Condition A: Personal File (User is the direct owner)
            if (fileRecord.user_id === userId) {
                isAuthorized = true;
            } 
            // Condition B: Company File (User is an admin/owner of the organization)
            else if (fileRecord.organization_id) {
                const { data: orgMember } = await supabase
                    .from('organization_members')
                    .select('role')
                    .eq('organization_id', fileRecord.organization_id)
                    .eq('user_id', userId)
                    .maybeSingle();

                if (orgMember && (orgMember.role === 'owner' || orgMember.role === 'admin')) {
                    isAuthorized = true;
                }
            }
        }

        // Fallback: If no database record is found (e.g., file was deleted) or user isn't the owner, allow System Admins to recover it.
        if (!isAuthorized && isSystemAdmin) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            console.error(`[RECOVERY DENIED] User: ${userEmail} | FileHash: ${fileHash} | isSystemAdmin: ${isSystemAdmin} | FileRecordFound: ${!!fileRecord}`);
            await logEvent({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                status: 'BLOCKED',
                user: userId,
                fileId: fileRecord?.id || 'UNKNOWN_ORPHAN_FILE',
                details: 'Blocked attempt to decrypt raw file upload. Missing RBAC or System Admin privileges.'
            });
            return res.status(403).json({ error: "Access Denied: Unrecognized file or you do not have permission to recover it." });
        }

        // 3. Authorized! Decrypt the file
        const decryptedBuffer = decryptPDF(uploadedBuffer, MASTER_SECRET);
        const originalName = fileRecord?.original_file_name || req.file.originalname.replace(/\.enc$/i, '').replace(/_encrypted\.pdf$/i, '.pdf');
        
        let safeName = sanitizeStorageSegment(`recovered_${originalName}`);
        if (!safeName.toLowerCase().endsWith('.pdf')) safeName += '.pdf';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.send(decryptedBuffer);

    } catch (error) {
        console.error("Secure Recovery Error:", error.message);
        res.status(500).json({ error: "Decryption failed. The file may be tampered with." });
    }
});

export default router;
