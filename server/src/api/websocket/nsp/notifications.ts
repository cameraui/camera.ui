import type { Namespace, Server, Socket } from 'socket.io';
import type { SocketNsp } from '../types.js';

export class NotificationsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/notifications';

  constructor(io: Server) {
    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      const userId = socket.data?.userId as string | undefined;
      if (userId) socket.join(`user:${userId}`);
    });
  }
}
