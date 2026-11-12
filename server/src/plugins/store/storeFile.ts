import { mkdirSync } from 'node:fs';
import { copyFile, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { renameWithRetry, writeFileAtomicSync } from '../../utils/atomic-write.js';
import { StoreCorruptError, decodeEnvelope, encodeEnvelope } from './envelope.js';

import type { Logger } from '@camera.ui/common';

export async function writeStoreFile(path: string, payload: Record<string, any>): Promise<void> {
  const buf = encodeEnvelope(payload);
  const tmpPath = `${path}.tmp-${process.pid}`;

  try {
    // a restore or cleanup can remove the volume under a running plugin, recreate it
    const handle = await open(tmpPath, 'w').catch(async (error) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      await mkdir(dirname(path), { recursive: true });
      return open(tmpPath, 'w');
    });
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

export function writeStoreFileSync(path: string, payload: Record<string, any>): void {
  const buf = encodeEnvelope(payload);

  try {
    writeFileAtomicSync(path, buf);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileAtomicSync(path, buf);
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

  // a corrupt store must never become an empty one, recover from .bak or fail the open
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
  // copy via a temp file, a crash mid-copy must not truncate .bak, it may be the only good copy
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
