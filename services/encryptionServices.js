import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; 

export function encryptPDF(buffer, secretKey) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Package as IV + TAG + DATA
    return Buffer.concat([iv, tag, encrypted]);
}