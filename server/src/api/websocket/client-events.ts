import { inject } from '../../container.js';

import type { Socket } from 'socket.io';

export function onClientEvent<Args extends unknown[]>(socket: Socket, event: string, handler: (...args: Args) => unknown): void {
  socket.on(event, async (...args: Args) => {
    try {
      await handler(...args);
    } catch (error) {
      inject('logger').warn(`${socket.nsp.name}: "${event}" failed:`, error instanceof Error ? error.message : error);
    }
  });
}
