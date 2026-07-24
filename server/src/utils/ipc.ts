import type { IPCMessage } from '../types.js';

const REPORT_TIMEOUT_MS = 1000;

export class FatalBootError extends Error {}

export function sendIPCMessage(message: IPCMessage): void {
  process.send?.(message);
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
