import { closeSync, existsSync, fchmodSync, fchownSync, fstatSync, fsyncSync, openSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import type { Stats } from 'node:fs';

const RENAME_RETRY_DELAYS_MS = [10, 25, 60, 150, 300];

export async function renameWithRetry(tmpPath: string, path: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(tmpPath, path);
      return;
    } catch (error) {
      if (!retryable(error) || attempt >= RENAME_RETRY_DELAYS_MS.length) {
        throw error;
      }
      await delay(RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function renameSyncWithRetry(tmpPath: string, path: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmpPath, path);
      return;
    } catch (error) {
      if (!retryable(error) || attempt >= RENAME_RETRY_DELAYS_MS.length) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

export function writeFileAtomicSync(path: string, data: string | Uint8Array): void {
  const target = existsSync(path) ? realpathSync(path) : path;
  const replaced = statSync(target, { throwIfNoEntry: false });
  const tmpPath = `${target}.tmp-${process.pid}`;

  try {
    const fd = openSync(tmpPath, 'w');
    try {
      if (replaced) keepAccess(fd, replaced);
      writeFileSync(fd, data);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSyncWithRetry(tmpPath, target);
  } catch (error) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // not there
    }
    throw error;
  }
}

function keepAccess(fd: number, replaced: Stats): void {
  fchmodSync(fd, replaced.mode);

  const created = fstatSync(fd);
  if (created.uid === replaced.uid && created.gid === replaced.gid) return;
  try {
    fchownSync(fd, replaced.uid, replaced.gid);
  } catch {
    // only root can hand a file to another owner
  }
}

function retryable(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES');
}
