import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Server } from 'node:net';

const PROBE_TIMEOUT_MS = 2_000;

let held: Server | undefined;

export async function acquireInstanceLock(homePath: string): Promise<boolean> {
  const path = lockPath(homePath);
  try {
    if (await answers(path)) return false;

    if (process.platform !== 'win32') rmSync(path, { force: true });
    held = await listen(path);
    held.unref();
    process.once('exit', () => releaseInstanceLock(path));
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'EADDRINUSE';
  }
}

function releaseInstanceLock(path: string): void {
  held?.close();
  held = undefined;
  if (process.platform !== 'win32') rmSync(path, { force: true });
}

function lockPath(homePath: string): string {
  const key = createHash('sha256').update(homePath).digest('hex').slice(0, 16);
  if (process.platform === 'win32') return `\\\\.\\pipe\\camera.ui-${key}`;

  const base = join(tmpdir(), process.getuid ? `.camera.ui-${process.getuid()}` : '.camera.ui');
  mkdirSync(base, { recursive: true });
  return join(base, `${key}.lock`);
}

function answers(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(path);
    const done = (alive: boolean): void => {
      socket.destroy();
      resolve(alive);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

function listen(path: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', reject);
    server.listen(path, () => resolve(server));
  });
}
