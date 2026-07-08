import { copyFile, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { StoreCorruptError, decodeEnvelope, encodeEnvelope } from './envelope.js';

import type { Logger } from '@camera.ui/common';

// Windows AV scanners / the search indexer transiently hold the rename target
// open; EPERM/EACCES there is retryable within a small budget (~0.5s total).
const RENAME_RETRY_DELAYS_MS = [10, 25, 60, 150, 300];

async function renameWithRetry(tmpPath: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmpPath, path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES');
      if (!retryable || attempt >= RENAME_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await delay(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export async function writeStoreFile(path: string, payload: Record<string, any>): Promise<void> {
  const buf = encodeEnvelope(payload);
  const tmpPath = `${path}.tmp-${process.pid}`;

  try {
    const handle = await open(tmpPath, 'w');
    try {
      await handle.writeFile(buf);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await renameWithRetry(tmpPath, path);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

export async function readStoreFile(path: string): Promise<Record<string, any> | undefined> {
  let buf: Buffer;
  try {
    buf = await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }

  try {
    const payload = decodeEnvelope(buf);
    return payload;
  } catch (error) {
    if (!(error instanceof StoreCorruptError)) {
      throw error;
    }
  }

  // A corrupt store must never silently become an empty one — that would
  // wipe the plugin's persisted state. Recover from the backup generation or
  // fail the open loudly.
  const bakPath = `${path}.bak`;
  let bakBuf: Buffer | undefined;
  try {
    bakBuf = await readFile(bakPath);
  } catch {
    bakBuf = undefined;
  }

  if (bakBuf) {
    const payload = decodeEnvelope(bakBuf);
    await writeStoreFile(path, payload);
    return payload;
  }

  throw new StoreCorruptError(`${path} unreadable and no usable backup`);
}

export async function backupStoreFile(path: string, log?: Logger): Promise<void> {
  // Copy to a temp sibling first — a crash mid-copy must never leave a
  // truncated .bak, it may be the only recovery generation.
  const tmpPath = `${path}.bak.tmp-${process.pid}`;
  try {
    await copyFile(path, tmpPath);
    await renameWithRetry(tmpPath, `${path}.bak`);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      log?.warn(`store: backup for ${path} failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

export async function removeOrphanedTmpFiles(path: string): Promise<void> {
  const dir = dirname(path);
  const prefix = basename(path);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }

  for (const name of names) {
    if (name.startsWith(prefix) && name.includes('.tmp-')) {
      await unlink(join(dir, name)).catch(() => {});
    }
  }
}
