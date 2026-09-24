import { IS_ELECTRON } from '@camera.ui/common/utils';

import type { AppUpdateAvailableMessage, CLIMessage, IPCMessage } from '../types.js';

const REPORT_TIMEOUT_MS = 1000;
const UPDATE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 30 * 60 * 1000;

export interface AppUpdateState {
  version: string;
  appVersion?: string;
  remoteInstall: boolean;
}

let appUpdate: AppUpdateState | null = null;

export class FatalBootError extends Error {}

export function initAppUpdateListener(): void {
  if (!IS_ELECTRON) return;
  process.on('message', (message: AppUpdateAvailableMessage) => {
    if (message?.type !== 'APP_UPDATE_AVAILABLE' || !message.version) return;
    appUpdate = { version: message.version, appVersion: message.appVersion, remoteInstall: message.remoteInstall === true };
  });
}

export function appUpdateState(): AppUpdateState | null {
  return appUpdate;
}

export function sendIPCMessage(message: IPCMessage): void {
  process.send?.(message);
}

export function requestAppUpdateCheck(): void {
  if (!IS_ELECTRON) return;
  sendIPCMessage({ type: 'CHECK_APP_UPDATE' });
}

export function announceUpdateChannel(beta: boolean): void {
  if (!IS_ELECTRON) return;
  sendIPCMessage({ type: 'SET_UPDATE_CHANNEL', channel: beta ? 'beta' : 'latest' });
}

export function canRequestServerUpdate(): boolean {
  if (!process.send) return false;
  return !IS_ELECTRON || appUpdate?.remoteInstall === true;
}

export async function requestServerUpdate(version?: string): Promise<AsyncGenerator<string, void, unknown>> {
  if (IS_ELECTRON && appUpdate?.remoteInstall !== true) {
    throw new Error('Server updates are managed by the desktop app');
  }

  if (!process.send) {
    throw new Error('Cannot update server: No CLI process found');
  }

  sendIPCMessage({
    type: 'UPDATE_SERVER',
    version: version,
  });

  return streamUpdateOutput();
}

// eslint-disable-next-line @stylistic/generator-star-spacing
async function* streamUpdateOutput(): AsyncGenerator<string, void, unknown> {
  let resolver: ((value: { done: boolean; value?: string }) => void) | null = null;
  let rejector: ((error: Error) => void) | null = null;

  const messageQueue: { done: boolean; value?: string }[] = [];
  let updateFailed = false;
  let updateError: Error | null = null;

  const totalTimer = setTimeout(() => fail(new Error(`Update timeout after ${UPDATE_TIMEOUT_MS / 60_000} minutes`)), UPDATE_TIMEOUT_MS);
  let idleTimer = setTimeout(failStalled, UPDATE_IDLE_TIMEOUT_MS);

  const handler = (message: CLIMessage): void => {
    switch (message.type) {
      case 'UPDATE_OUTPUT':
      case 'UPDATE_ERROR': {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(failStalled, UPDATE_IDLE_TIMEOUT_MS);
        const result = { done: false, value: message.data };
        if (resolver) {
          resolver(result);
          resolver = null;
        } else {
          messageQueue.push(result);
        }
        break;
      }
      case 'UPDATE_FAILED': {
        fail(new Error(message.error ?? 'Update failed'));
        break;
      }
      case 'UPDATE_COMPLETE': {
        const result = { done: true };
        if (resolver) {
          resolver(result);
          resolver = null;
        } else {
          messageQueue.push(result);
        }
        process.removeListener('message', handler);
        stopTimers();
        break;
      }
    }
  };

  function fail(error: Error): void {
    updateFailed = true;
    updateError = error;
    rejector?.(error);
    process.removeListener('message', handler);
    stopTimers();
  }

  function failStalled(): void {
    fail(new Error(`Update stalled, no output for ${UPDATE_IDLE_TIMEOUT_MS / 60_000} minutes`));
  }

  function stopTimers(): void {
    clearTimeout(totalTimer);
    clearTimeout(idleTimer);
  }

  process.on('message', handler);

  try {
    while (true) {
      if (updateFailed) {
        throw updateError!;
      }

      if (messageQueue.length > 0) {
        const next = messageQueue.shift()!;
        if (next.done) {
          return;
        }
        if (next.value) {
          yield next.value;
        }
      } else {
        const next = await new Promise<{ done: boolean; value?: string }>((resolve, reject) => {
          resolver = resolve;
          rejector = reject;
        });

        if (next.done) {
          return;
        }
        if (next.value) {
          yield next.value;
        }
      }
    }
  } finally {
    process.removeListener('message', handler);
    stopTimers();
  }
}

export async function reportStartError(error: unknown): Promise<void> {
  const send = process.send?.bind(process);
  if (!send) return;

  const message: IPCMessage = {
    type: 'START_ERROR',
    error: describeStartError(error),
    fatal: error instanceof FatalBootError,
  };

  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timeout);
      resolve();
    };

    const timeout = setTimeout(done, REPORT_TIMEOUT_MS);
    send(message, done);
  });
}

function describeStartError(error: unknown): string {
  if (error instanceof FatalBootError) return error.message;
  if (!(error instanceof Error)) return String(error);

  const frames = (error.stack ?? '')
    .split('\n')
    .slice(1, 4)
    .map((line) => line.trim())
    .join('\n');

  return frames ? `${error.message}\n${frames}` : error.message;
}
