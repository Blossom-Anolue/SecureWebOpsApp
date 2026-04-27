import { decryptPDF } from './decryptionServices.js';
import { logAction } from './auditService.js';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * SecureAccessController: Now with Role-Based Access Control (RBAC)
 * Handles retrieval, permission validation, decryption, and auditing.
 */
export async function retrieveAndDecryptFile(userId, fileId) {
    try {
        // 1. Fetch metadata from 'files' table to verify ownership
        const { data: fileMeta, error: dbError } = await supabase
            .from('files')
            .select('storage_path, file_name, owner_id')
            .eq('id', fileId)
            .single();
            
        if (dbError || !fileMeta) throw new Error("File metadata not found.");

        const isOwner = fileMeta.owner_id === userId;
        let accessLevel = 'ADMIN';

        // 2. PRIVILEGE CHECK: If not owner, verify explicit share permissions
        if (!isOwner) {
            let { data: permission, error: permError } = await supabase
                .from('file_permissions')
                .select('permission_level, expires_at, revoked_at')
                .eq('file_id', fileId)
                .eq('user_id', userId)
                .single();

            if (permError && String(permError.message).includes('expires_at')) {
                ({ data: permission, error: permError } = await supabase
                    .from('file_permissions')
                    .select('permission_level')
                    .eq('file_id', fileId)
                    .eq('user_id', userId)
                    .single());
            }

            if (permError || !permission || !['VIEW', 'DOWNLOAD', 'DECRYPT', 'ADMIN'].includes(permission.permission_level)) {
                // LOG UNAUTHORIZED ATTEMPT
                await logAction(userId, 'UNAUTHORIZED_ACCESS_ATTEMPT', 'BLOCKED', fileId, {
                    reason: 'Insufficient permissions for decryption'
                });
                throw new Error("Access Denied: You do not have privileges to access this file.");
            }

            if (permission.revoked_at || (permission.expires_at && new Date(permission.expires_at).getTime() <= Date.now())) {
                await logAction(userId, 'UNAUTHORIZED_ACCESS_ATTEMPT', 'BLOCKED', fileId, {
                    reason: 'Access expired or revoked'
                });
                throw new Error("Access Denied: Your access to this file has expired or been revoked.");
            }
            
            accessLevel = permission.permission_level;
        }

        // 3. Download the encrypted blob
        const { data: blob, error: storageError } = await supabase.storage
            .from(process.env.PDF_STORAGE_BUCKET || 'pdfs')
            .download(fileMeta.storage_path);

        if (storageError) throw new Error("Could not download file from storage.");

        // 4. Decrypt (Using the IV and Tag from the database)
        const encryptedBuffer = Buffer.from(await blob.arrayBuffer());
        const decryptedBuffer = decryptPDF(encryptedBuffer, process.env.KMS_MASTER_SECRET); // Corrected call to decryptPDF

        // 5. LOG SUCCESS
        await logAction(userId, 'FILE_DECRYPT_SUCCESS', 'SUCCESS', fileId, {
            fileName: fileMeta.file_name,
            accessLevel: accessLevel
        });

        return {
            buffer: decryptedBuffer,
            fileName: fileMeta.file_name
        };
    } catch (error) {
        // 6. LOG FAILURE (Sensitive for Audit Trail)
        await logAction(userId, 'FILE_DECRYPT_FAILURE', 'FAILURE', fileId, {
            error: error.message
        });
        
        throw error;
    }
}