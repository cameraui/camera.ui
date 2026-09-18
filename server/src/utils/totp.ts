import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20;
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const DEFAULT_WINDOW = 1;

export interface VerifyTotpOptions {
  window?: number;
  now?: number;
}

export interface TotpResult {
  valid: boolean;
  timeStep?: number;
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function totpToken(secret: string, timeStep: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(timeStep));

  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function currentTimeStep(now = Date.now()): number {
  return Math.floor(now / 1000 / PERIOD_SECONDS);
}

export function verifyTotp(token: string, secret: string, options: VerifyTotpOptions = {}): TotpResult {
  const { window = DEFAULT_WINDOW, now = Date.now() } = options;

  if (!new RegExp(`^\\d{${DIGITS}}$`).test(token)) {
    return { valid: false };
  }

  const current = currentTimeStep(now);
  const expected = Buffer.from(token);

  for (let step = current - window; step <= current + window; step++) {
    if (timingSafeEqual(Buffer.from(totpToken(secret, step)), expected)) {
      return { valid: true, timeStep: step };
    }
  }

  return { valid: false };
}

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let encoded = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      encoded += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    encoded += ALPHABET[(value << (5 - bits)) & 31];
  }

  return encoded;
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/\s+/g, '').replace(/=+$/, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of cleaned) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid Base32 string: Unknown letter "${char}". Allowed: ${ALPHABET}`);
    }

    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
