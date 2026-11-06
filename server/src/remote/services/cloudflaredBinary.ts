import { cloudflaredPath, isCloudflaredAvailable } from '@camera.ui/cloudflared';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { Logger } from '@camera.ui/common';

export const EDGE_PROTOCOLS = ['auto', 'quic', 'http2'] as const;
const DEFAULT_EDGE_PROTOCOL = 'http2';

let reportedProtocol: string | undefined;

export function cloudflaredBinaryPath(): string {
  return cloudflaredPath();
}

export function isCloudflaredInstalled(): boolean {
  return isCloudflaredAvailable();
}

export async function removeDownloadedCloudflared(dir: string): Promise<void> {
  await Promise.all([rm(join(dir, 'cloudflared'), { force: true }).catch(() => {}), rm(join(dir, 'cloudflared.exe'), { force: true }).catch(() => {})]);
}

export function edgeProtocol(requested: string | undefined, logger: Logger): string {
  if (!requested) return DEFAULT_EDGE_PROTOCOL;

  const valid = (EDGE_PROTOCOLS as readonly string[]).includes(requested);
  if (reportedProtocol !== requested) {
    reportedProtocol = requested;
    if (valid) logger.log(`Cloudflare: connecting to the edge over ${requested} (cloudflaredProtocol)`);
    else logger.warn(`Cloudflare: cloudflaredProtocol ${requested} is not one of ${EDGE_PROTOCOLS.join(', ')}, using ${DEFAULT_EDGE_PROTOCOL}`);
  }

  return valid ? requested : DEFAULT_EDGE_PROTOCOL;
}
