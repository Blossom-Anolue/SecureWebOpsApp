import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; 
const TAG_LENGTH = 16;
const SALT = 'securewebops_salt_2026';

export function encryptPDF(buffer, secretKey) {
    if (!secretKey) throw new Error("Secret key is missing. Set KMS_MASTER_SECRET.");

    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(secretKey, SALT, 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Package as IV + TAG + DATA
    return Buffer.concat([iv, tag, encrypted]);
}