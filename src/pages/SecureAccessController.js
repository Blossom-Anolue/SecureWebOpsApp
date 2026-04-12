import { decryptPDF } from './decryptionServices.js';
import { logAction } from './auditService.js';
import { supabase } from './supabaseClient.js';

/**
 * SecureAccessController: Now with Role-Based Access Control (RBAC)
 * Handles retrieval, permission validation, decryption, and auditing.
 */
export async function retrieveAndDecryptFile(userId, fileId) {
    try {
        // 1. PRIVILEGE CHECK: Verify the user has 'DOWNLOAD' or 'ADMIN' rights
        // This prevents Privilege Escalation (e.g., a 'VIEW' user trying to download)
        const { data: permission, error: permError } = await supabase
            .from('file_permissions')
            .select('permission_level')
            .eq('file_id', fileId)
            .eq('user_id', userId)
            .single();

        if (permError || !permission || (permission.permission_level !== 'DOWNLOAD' && permission.permission_level !== 'ADMIN')) {
            // LOG UNAUTHORIZED ATTEMPT
            await logAction(userId, 'UNAUTHORIZED_ACCESS_ATTEMPT', 'BLOCKED', fileId, {
                reason: 'Insufficient permissions for decryption'
            });
            throw new Error("Access Denied: You do not have download privileges for this file.");
        }

        // 2. Fetch metadata from 'files' table
        const { data: fileMeta, error: dbError } = await supabase
            .from('files')
            .select('storage_path, file_name') // Removed iv, auth_tag as they are embedded in the encrypted blob
            .eq('id', fileId)
            .single();
        if (dbError || !fileMeta) throw new Error("File metadata not found.");

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
            accessLevel: permission.permission_level
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