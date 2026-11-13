import { API_EVENT } from '@camera.ui/sdk';
import { Server } from 'socket.io';

import { inject, provide } from '../../container.js';
import { authorize, UnauthorizedError } from '../middlewares/socketAuth.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { updatesService } from '../services/updates.service.js';
import { UsersService } from '../services/users.service.js';
import { API_TOKEN_PREFIX } from '../types/index.js';
import { mustSetPassword } from '../utils/utils.js';
import { CamerasNamespace } from './nsp/cameras.js';
import { EventsNamespace } from './nsp/events.js';
import { LogsNamespace } from './nsp/logs.js';
import { MainNamespace } from './nsp/main.js';
import { MetricsNamespace } from './nsp/metrics.js';
import { NotificationsNamespace } from './nsp/notifications.js';
import { PluginsNamespace } from './nsp/plugins.js';
import { SensorsNamespace } from './nsp/sensors.js';
import { ServerNamespace } from './nsp/server.js';
import { StatusNamespace } from './nsp/status.js';
import { TrainingNamespace } from './nsp/training.js';
import { WorkersNamespace } from './nsp/workers.js';

import type { FastifyInstance } from 'fastify';
import type { DisconnectReason, Namespace, ServerOptions, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../api.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { JwtTokenDecoded } from '../types/index.js';
import type { SocketNsp, SocketNspMap } from './types.js';

const MAX_SOCKETS_PER_TOKEN = 64;

export class SocketService {
  public io: Server;

  public namespaces = new Map<SocketNsp, SocketNspMap>();
  public adminNsp: SocketNsp[] = ['/logs', '/status', '/metrics', '/plugins', '/server', '/cameras', '/sensors', '/workers', '/training'];

  private logger: LoggerService;
  private authService!: AuthService;
  private usersService!: UsersService;
  private configService: ConfigService;
  private api: CameraUiAPI;

  constructor(app: FastifyInstance, opts: Partial<ServerOptions>) {
    provide('socketService', this);

    this.logger = inject('logger');
    this.configService = inject('configService');
    this.api = inject('api');

    this.io = new Server(app.server, opts);

    this.registerNamespaces();

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.io.close();
    });
  }

  public disconnectTokens(tokenIds: string[]): void {
    const revoked = new Set(tokenIds);
    this.closeEngines((socket) => revoked.has(socket.data.tokenId));
  }

  public disconnectOrphans(userIds: string[]): void {
    const users = new Set(userIds);
    this.closeEngines((socket) => users.has(socket.data.userId) && !this.authService.findById(socket.data.tokenId ?? ''));
  }

  public dropAdminNamespaces(userId: string): void {
    for (const name of this.adminNsp) {
      const sockets = [...(this.namespaces.get(name)?.nsp.sockets.values() ?? [])];
      for (const socket of sockets) {
        if (socket.data.userId === userId) socket.disconnect();
      }
    }
  }

  private async registerNamespaces(): Promise<void> {
    this.authService = new AuthService();
    this.usersService = new UsersService();

    this.namespaces.set('/camera.ui', new MainNamespace(this.io));
    this.namespaces.set('/events', new EventsNamespace(this.io));
    this.namespaces.set('/server', new ServerNamespace(this.io));
    this.namespaces.set('/notifications', new NotificationsNamespace(this.io));
    this.namespaces.set('/metrics', new MetricsNamespace(this.io));
    this.namespaces.set('/logs', new LogsNamespace(this.io));
    this.namespaces.set('/status', new StatusNamespace(this.io));
    this.namespaces.set('/plugins', new PluginsNamespace(this.io));
    this.namespaces.set('/cameras', new CamerasNamespace(this.io));
    this.namespaces.set('/sensors', new SensorsNamespace(this.io));
    this.namespaces.set('/workers', new WorkersNamespace(this.io));
    this.namespaces.set('/training', new TrainingNamespace(this.io));

    updatesService().init();

    for (const [nsp, contructor] of this.namespaces) {
      contructor.nsp
        .use(
          authorize({
            secret: this.configService.SECRETS.jwtAccessKey,
            resolveOpaqueToken: (token) => this.resolveApiToken(token),
          }),
        )
        .use(this.authorizeConnection(nsp))
        .on('connection', (socket: Socket) => {
          this.setupConnection(socket, nsp);
        });
    }
  }

  private resolveApiToken(token: string): JwtTokenDecoded | undefined {
    if (!token.startsWith(API_TOKEN_PREFIX)) return undefined;

    const dbToken = this.authService.findByAccessToken(token);
    if (dbToken?.type !== 'api') return undefined;

    const user = this.usersService.findById(dbToken.user_id);
    if (!user) return undefined;

    return { _id: user._id, username: user.username, device_id: dbToken.device.id, exp: 0, iat: 0 };
  }

  private authorizeConnection(nsp: SocketNsp) {
    return (socket: Socket, next: (error?: UnauthorizedError) => void): void => {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      const user = this.usersService.findById(decodedToken?._id ?? '');

      if (!user) {
        return next(new UnauthorizedError('user_not_found', { message: 'User not found' }));
      }

      socket.data.userId = user._id;
      socket.data.userRole = user.role;

      if (this.adminNsp.includes(nsp) && user.role !== 'admin' && user.role !== 'master') {
        return next(new UnauthorizedError('insufficient_role', { message: `Not authorized to connect to ${nsp}` }));
      }

      const dbToken = this.authService.resolveAccessToken(socket.encodedToken!)?.token;
      if (dbToken?.user_id !== user._id || dbToken.stream_scope) {
        return next(new UnauthorizedError('unauthenticated', { message: 'Unauthenticated' }));
      }

      if (nsp !== '/camera.ui' && mustSetPassword(user, dbToken)) {
        return next(new UnauthorizedError('first_login', { message: 'Password change required before first use' }));
      }

      if (this.countTokenSockets(socket.nsp, dbToken.id) >= MAX_SOCKETS_PER_TOKEN) {
        return next(new UnauthorizedError('too_many_connections', { message: `Too many connections to ${nsp}` }));
      }

      socket.data.tokenId = dbToken.id;

      return next();
    };
  }

  private closeEngines(match: (socket: Socket) => boolean): void {
    const engines = new Set<Socket['conn']>();
    for (const { nsp } of this.namespaces.values()) {
      for (const socket of nsp.sockets.values()) {
        if (match(socket)) engines.add(socket.conn);
      }
    }
    for (const engine of engines) engine.close();
  }

  private countTokenSockets(nsp: Namespace, tokenId: string): number {
    let count = 0;
    for (const socket of nsp.sockets.values()) {
      if (socket.data.tokenId === tokenId) count++;
    }
    return count;
  }

  private setupConnection(socket: Socket, nsp: SocketNsp): void {
    const user = this.usersService.findById(socket.data.userId ?? '');
    const address = socket.conn.remoteAddress;
    const dbToken = this.authService.resolveAccessToken(socket.encodedToken!)?.token;
    const device = dbToken?.device.name;

    this.logger.trace(`${user?.username} | ${address} | ${device} | authenticated and connected to ${nsp} | id: ${socket.id}`);

    socket.on('disconnect', (reason: DisconnectReason) => {
      this.logger.trace(`${user?.username} | ${address} | ${device} | disconnected from ${nsp} (${reason}) | id: ${socket.id}`);
    });
  }
}
