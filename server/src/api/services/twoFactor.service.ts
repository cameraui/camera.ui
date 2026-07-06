import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { container } from 'tsyringe';

import type { ConfigService } from '../../services/config/index.js';

export class TwoFactorService {
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly APP_NAME = 'camera.ui';

  private verifyAttempts = new Map<string, { count: number; lastAttempt: Date }>();
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000;

  constructor() {
    const configService = container.resolve<ConfigService>('configService');
    this.ENCRYPTION_KEY = Buffer.from(configService.SECRETS.twoFactorKey, 'hex');
  }

  public generateSecret(): string {
    return generateSecret();
  }

  public async generateQRCode(username: string, secret: string): Promise<string> {
    const otpauth = generateURI({
      issuer: this.APP_NAME,
      label: username,
      secret,
    });
    return QRCode.toDataURL(otpauth);
  }

  public async verifyToken(token: string, secret: string): Promise<boolean> {
    const result = await verify({ token, secret });
    return result.valid;
  }

  public generateBackupCodes(count = 10): string[] {
    return Array.from({ length: count }, () => randomBytes(4).toString('hex').toUpperCase());
  }

  public hashBackupCode(code: string): string {
    return createHash('sha256').update(code.toUpperCase()).digest('hex');
  }

  public verifyBackupCode(code: string, hashedCodes: string[]): number {
    const hashedInput = this.hashBackupCode(code);
    return hashedCodes.findIndex((hashed) => hashed === hashedInput);
  }

  public encryptSecret(secret: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  public decryptSecret(encryptedSecret: string): string {
    const data = Buffer.from(encryptedSecret, 'base64');
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  }

  public checkRateLimit(userId: string): { allowed: boolean; remainingAttempts: number } {
    const attempts = this.verifyAttempts.get(userId);
    if (attempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt.getTime();
      if (timeSinceLastAttempt > TwoFactorService.LOCKOUT_DURATION_MS) {
        this.verifyAttempts.delete(userId);
        return { allowed: true, remainingAttempts: TwoFactorService.MAX_ATTEMPTS };
      }
      if (attempts.count >= TwoFactorService.MAX_ATTEMPTS) {
        return { allowed: false, remainingAttempts: 0 };
      }
      return { allowed: true, remainingAttempts: TwoFactorService.MAX_ATTEMPTS - attempts.count };
    }
    return { allowed: true, remainingAttempts: TwoFactorService.MAX_ATTEMPTS };
  }

  public recordVerifyAttempt(userId: string): void {
    const attempts = this.verifyAttempts.get(userId) ?? { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.verifyAttempts.set(userId, attempts);
  }

  public resetVerifyAttempts(userId: string): void {
    this.verifyAttempts.delete(userId);
  }
}
