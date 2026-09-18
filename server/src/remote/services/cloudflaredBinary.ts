import { cloudflaredPath, isCloudflaredAvailable } from '@camera.ui/cloudflared';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

export function cloudflaredBinaryPath(): string {
  return cloudflaredPath();
}

export function isCloudflaredInstalled(): boolean {
  return isCloudflaredAvailable();
}

export async function removeDownloadedCloudflared(dir: string): Promise<void> {
  await Promise.all([rm(join(dir, 'cloudflared'), { force: true }).catch(() => {}), rm(join(dir, 'cloudflared.exe'), { force: true }).catch(() => {})]);
}
