import { attachWorkerBridge } from '@camera.ui/transport';

import { createConnection } from './kernel.js';

import type { WorkerBridge } from '@camera.ui/transport';
import type { Connection, ConnectionOptions } from './types.js';

export const workerRegistry: Set<Worker> = new Set();

export const instanceOverride = shallowRef<string | null>(null);

let _connection: Connection | null = null;
let _workerBridge: WorkerBridge | null = null;
let _wakeUnsub: (() => void) | null = null;

export function bootConnectionInstance(options: ConnectionOptions): Connection {
  if (_connection) {
    throw new Error('bootConnectionInstance(): already booted — call detachConnectionInstance() first');
  }
  _connection = createConnection(options);
  const bridge = attachWorkerBridge({
    kernel: _connection.kernel,
    hosts: () => Array.from(workerRegistry),
    listenForResyncRequests: true,
  });
  _workerBridge = bridge;
  // On every connection wake (foreground / online / network-change) nudge all
  // registered workers to revalidate their own transport. The kernel only
  // heartbeats its own socket; this propagates the liveness check across the
  // worker boundary so a worker that went half-open on a 5G handoff recovers
  // without a user action. Generic — the worker decides what "revalidate" means.
  _wakeUnsub = _connection.onWake(() => {
    _connection?.journal.record('worker-bridge', `revalidate (${workerRegistry.size} workers)`);
    bridge.revalidateWorkers();
  });
  (globalThis as Record<string, unknown>).__cameraui_journal = _connection.journal;
  return _connection;
}

export async function detachConnectionInstance(): Promise<void> {
  if (!_connection) return;
  _wakeUnsub?.();
  _workerBridge?.detach();
  await _connection.detach();
  _wakeUnsub = null;
  _workerBridge = null;
  _connection = null;
  delete (globalThis as Record<string, unknown>).__cameraui_journal;
  workerRegistry.clear();
}

export function getConnection(): Connection {
  if (!_connection) {
    throw new Error('getConnection(): connection not booted — call bootConnectionInstance() first');
  }
  return _connection;
}

export function getWorkerBridge(): WorkerBridge {
  if (!_workerBridge) {
    throw new Error('getWorkerBridge(): connection not booted — call bootConnectionInstance() first');
  }
  return _workerBridge;
}

export function isConnectionBooted(): boolean {
  return _connection !== null;
}
