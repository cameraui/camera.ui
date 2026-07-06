import { container } from 'tsyringe';

import type { Namespace, Server, Socket } from 'socket.io';
import type { ProxyServer } from '../../../rpc/index.js';
import type { StoredNotification } from '../../database/types.js';
import type { SocketNsp } from '../types.js';

export class NotificationsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/notifications';

  private proxyServer: ProxyServer;

  constructor(io: Server) {
    this.proxyServer = container.resolve<ProxyServer>('proxy');

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', (socket: Socket) => {
      const userId = this.userIdOf(socket);
      if (userId) socket.join(`user:${userId}`);

      socket.on('get-notifications', (_payload: unknown, callback?: (h: StoredNotification[]) => void) => this.getNotifications(socket, callback));
      socket.on('remove-notification', (tag: string) => this.removeNotification(socket, tag));
      socket.on('clear-notifications', () => this.clearNotifications(socket));
      socket.on('mark-all-seen', () => this.markAllSeen(socket));
      socket.on('mark-seen', (id: string) => this.markSeen(socket, id));
    });
  }

  private userIdOf(socket: Socket): string | undefined {
    return socket.data?.userId as string | undefined;
  }

  public clearNotifications(socket: Socket): void {
    const userId = this.userIdOf(socket);
    if (userId) this.proxyServer.notificationManager.clearHistory(userId);
  }

  public getNotifications(socket: Socket, callback?: (h: StoredNotification[]) => void): StoredNotification[] {
    const userId = this.userIdOf(socket);
    const history = userId ? this.proxyServer.notificationManager.getHistory(userId) : [];
    callback?.(history);
    return history;
  }

  public removeNotification(socket: Socket, tag?: string): void {
    const userId = this.userIdOf(socket);
    if (!userId || !tag) return;
    this.proxyServer.notificationManager.removeByTag(userId, tag);
  }

  public markAllSeen(socket: Socket): void {
    const userId = this.userIdOf(socket);
    if (userId) this.proxyServer.notificationManager.markAllSeen(userId);
  }

  public markSeen(socket: Socket, id?: string): void {
    const userId = this.userIdOf(socket);
    if (!userId || !id) return;
    this.proxyServer.notificationManager.markSeen(userId, id);
  }
}
