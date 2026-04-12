import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = 'securewebops_salt_2026'; 

/**
 * Decrypts a buffer using AES-256-GCM
 * Input: Buffer containing [IV][TAG][DATA]
 */
export function decryptPDF(encryptedBuffer, secretKey) {
    try {
        if (!secretKey) throw new Error("Secret key is missing.");
        if (encryptedBuffer.length < IV_LENGTH + TAG_LENGTH) {
            throw new Error("Invalid encrypted data: buffer too small.");
        }

        const iv = encryptedBuffer.subarray(0, IV_LENGTH);
        const tag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
        const encryptedData = encryptedBuffer.subarray(IV_LENGTH + TAG_LENGTH);

        const key = crypto.scryptSync(secretKey, SALT, 32);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final()
        ]);

        return decrypted;
    } catch (error) {
        console.error("[SECURITY] Decryption failed:", error.message);
        throw new Error("Integrity check failed: File tampered with or invalid key.");
    }
}