import { install } from 'cloudflared';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export function cloudflaredBinaryPath(dir: string): string {
  return join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
}

export async function ensureCloudflaredBinary(dir: string): Promise<string> {
  const binPath = cloudflaredBinaryPath(dir);
  if (existsSync(binPath)) return binPath;

  await mkdir(dir, { recursive: true });

  const legacyPath = join(dir, 'cloudflared');
  if (legacyPath !== binPath) {
    await rm(legacyPath, { force: true }).catch(() => {});
  }

  await install(binPath);
  return binPath;
}
