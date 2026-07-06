import type { IPCMessage } from '../types.js';

export function sendIPCMessage(message: IPCMessage): void {
  process.send?.(message);
}
