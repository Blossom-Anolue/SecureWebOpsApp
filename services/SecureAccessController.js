import { decryptPDF } from './decryptionServices.js';
import { logEvent } from './auditService.js';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const PDF_HARDENED_SCHEMA = false;

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

function isShareActive(permissionEntry) {
    if (!permissionEntry) return false;
    if (permissionEntry.revoked_at) return false;
    if (permissionEntry.expires_at && new Date(permissionEntry.expires_at).getTime() <= Date.now()) return false;
    return true;
}

function computeEncryptedBlobSha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * SecureAccessController: Role-Based Access Control (RBAC)
 * Handles retrieval, permission validation, decryption, and auditing.
 */
export async function retrieveAndDecryptFile(userId, fileId) {
    try {
        // 1. Fetch file metadata
        let { data: fileMeta, error: dbError } = await supabase
            .from('encrypted_pdfs')
            .select(PDF_HARDENED_SCHEMA
                ? 'storage_bucket, storage_path, original_file_name, mime_type, user_id, encrypted_sha256'
                : 'storage_bucket, storage_path, original_file_name, mime_type, user_id')
            .eq('id', fileId)
            .maybeSingle();

        if (PDF_HARDENED_SCHEMA && dbError && isMissingColumnError(dbError, ['encrypted_sha256'])) {
            ({ data: fileMeta, error: dbError } = await supabase
                .from('encrypted_pdfs')
                .select('storage_bucket, storage_path, original_file_name, mime_type, user_id')
                .eq('id', fileId)
                .maybeSingle());
        }

        if (dbError) {
            throw new Error(`Failed to load file metadata: ${dbError.message}`);
        }

        if (!fileMeta) {
            await logEvent({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                status: 'BLOCKED',
                user: userId,
                fileId: fileId,
                details: `File not found or access denied for file: ${fileId}`
            });
            throw new Error("File not found.");
        }

        // 2. PRIVILEGE CHECK: Verify the user is the owner OR has shared permissions
        let isAuthorized = false;
        let accessLevel = 'NONE';
        let permissionEntry = null;

        if (fileMeta.user_id === userId) {
            isAuthorized = true;
            accessLevel = 'ADMIN';
        } else {
            let { data: perm, error: permError } = await supabase
                .from('file_permissions')
                .select(PDF_HARDENED_SCHEMA
                    ? 'permission_level, expires_at, revoked_at, access_count'
                    : 'permission_level')
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .maybeSingle();

            if (PDF_HARDENED_SCHEMA && permError && isMissingColumnError(permError, ['expires_at', 'revoked_at', 'access_count'])) {
                ({ data: perm, error: permError } = await supabase
                    .from('file_permissions')
                    .select('permission_level')
                    .eq('file_id', fileId)
                    .eq('user_id', userId)
                    .maybeSingle());
            }

            if (permError) {
                throw new Error(`Failed to load file permissions: ${permError.message}`);
            }

            permissionEntry = perm;

            if (isShareActive(permissionEntry) && (permissionEntry.permission_level === 'DOWNLOAD' || permissionEntry.permission_level === 'ADMIN')) {
                isAuthorized = true;
                accessLevel = permissionEntry.permission_level;
            }
        }

        if (!isAuthorized) {
            await logEvent({
                action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
                status: 'BLOCKED',
                user: userId,
                fileId: fileId,
                details: `Insufficient permissions for decryption of file: ${fileId}`
            });
            throw new Error("Access Denied: You do not have download privileges for this file.");
        }

        // 3. Download the encrypted blob from storage
        const bucketName = fileMeta.storage_bucket || process.env.PDF_STORAGE_BUCKET || 'pdfs';
        const { data: blob, error: storageError } = await supabase.storage
            .from(bucketName)
            .download(fileMeta.storage_path);

        if (storageError) {
            throw new Error(`Could not download file from storage: ${storageError.message}`);
        }

        // 4. Decrypt
        const masterSecret = process.env.KMS_MASTER_SECRET;
        if (!masterSecret) {
            throw new Error('Server misconfiguration: KMS_MASTER_SECRET is missing.');
        }

        const encryptedBuffer = Buffer.from(await blob.arrayBuffer());
        if (PDF_HARDENED_SCHEMA && fileMeta.encrypted_sha256) {
            const actualHash = computeEncryptedBlobSha256(encryptedBuffer);
            if (actualHash !== fileMeta.encrypted_sha256) {
                throw new Error('Encrypted file integrity verification failed.');
            }
        }
        const decryptedBuffer = decryptPDF(encryptedBuffer, masterSecret);

        if (PDF_HARDENED_SCHEMA && accessLevel !== 'ADMIN' && permissionEntry && Object.prototype.hasOwnProperty.call(permissionEntry, 'access_count')) {
            const accessUpdate = {
                access_count: (permissionEntry.access_count || 0) + 1,
                last_accessed_at: new Date().toISOString()
            };

            if (!permissionEntry.access_count) {
                accessUpdate.first_accessed_at = accessUpdate.last_accessed_at;
            }

            const { error: accessUpdateError } = await supabase
                .from('file_permissions')
                .update(accessUpdate)
                .eq('file_id', fileId)
                .eq('user_id', userId);

            if (accessUpdateError && !isMissingColumnError(accessUpdateError, ['access_count', 'first_accessed_at', 'last_accessed_at'])) {
                throw new Error(`Failed to update file access audit metadata: ${accessUpdateError.message}`);
            }
        }

        // 5. LOG SUCCESS
        await logEvent({
            action: 'FILE_DECRYPT_SUCCESS',
            status: 'SUCCESS',
            user: userId,
            fileId: fileId,
            fileName: fileMeta.original_file_name,
            details: `Access Level: ${accessLevel}`
        });

        return {
            buffer: decryptedBuffer,
            fileName: fileMeta.original_file_name,
            mimeType: fileMeta.mime_type || 'application/pdf'
        };
    } catch (error) {
        await logEvent({
            action: 'FILE_DECRYPT_FAILURE',
            status: 'FAILURE',
            user: userId,
            fileId: fileId,
            details: error.message
        });
        throw error;
    }
}
