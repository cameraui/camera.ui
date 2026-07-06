import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, 'camera.ui.instances', 32);
}

export function encryptPassword(password: string, secret: string): { encrypted: string; iv: string } {
  const key = deriveKey(secret);
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function decryptPassword(encrypted: string, iv: string, secret: string): string {
  const key = deriveKey(secret);
  const buf = Buffer.from(encrypted, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(authTag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}
