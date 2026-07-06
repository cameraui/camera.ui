import { API_EVENT } from '@camera.ui/sdk';
import { Server } from 'socket.io';
import { container } from 'tsyringe';

import { authorize, UnauthorizedError } from '../middlewares/socketAuth.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { UsersService } from '../services/users.service.js';
import { CamerasNamespace } from './nsp/cameras.js';
import { LogsNamespace } from './nsp/logs.js';
import { MainNamespace } from './nsp/main.js';
import { MetricsNamespace } from './nsp/metrics.js';
import { NotificationsNamespace } from './nsp/notifications.js';
import { PluginsNamespace } from './nsp/plugins.js';
import { ServerNamespace } from './nsp/server.js';
import { StatusNamespace } from './nsp/status.js';
import { WorkersNamespace } from './nsp/workers.js';

import type { FastifyInstance } from 'fastify';
import type { DisconnectReason, ServerOptions, Socket } from 'socket.io';
import type { CameraUiAPI } from '../../api.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { JwtTokenDecoded } from '../types/index.js';
import type { SocketNsp, SocketNspMap } from './types.js';

export class SocketService {
  public io: Server;

  public namespaces = new Map<SocketNsp, SocketNspMap>();
  public adminNsp: SocketNsp[] = ['/logs', '/status', '/metrics', '/plugins', '/server', '/cameras', '/workers'];

  private logger: LoggerService;
  private authService!: AuthService;
  private usersService!: UsersService;
  private configService: ConfigService;
  private api: CameraUiAPI;

  constructor(app: FastifyInstance, opts: Partial<ServerOptions>) {
    container.registerInstance('socketService', this);

    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.api = container.resolve<CameraUiAPI>('api');

    this.io = new Server(app.server, opts);

    this.registerNamespaces();

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.io.close();
    });
  }

  private async registerNamespaces(): Promise<void> {
    this.authService = new AuthService();
    this.usersService = new UsersService();

    this.namespaces.set('/camera.ui', new MainNamespace(this.io));
    this.namespaces.set('/server', new ServerNamespace(this.io));
    this.namespaces.set('/notifications', new NotificationsNamespace(this.io));
    this.namespaces.set('/metrics', new MetricsNamespace(this.io));
    this.namespaces.set('/logs', new LogsNamespace(this.io));
    this.namespaces.set('/status', new StatusNamespace(this.io));
    this.namespaces.set('/plugins', new PluginsNamespace(this.io));
    this.namespaces.set('/cameras', new CamerasNamespace(this.io));
    this.namespaces.set('/workers', new WorkersNamespace(this.io));

    for (const [nsp, contructor] of this.namespaces) {
      contructor.nsp
        .use(authorize({ secret: this.configService.SECRETS.jwtAccessKey }))
        .use(this.authorizeConnection(nsp))
        .on('connection', (socket: Socket) => {
          this.setupConnection(socket, nsp);
        });
    }
  }

  private authorizeConnection(nsp: SocketNsp) {
    return (socket: Socket, next: (error?: UnauthorizedError) => void): void => {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      const user = this.usersService.findByName(decodedToken?.username ?? '');

      if (!user) {
        return next(new UnauthorizedError('user_not_found', { message: 'User not found' }));
      }

      socket.data.userId = user._id;
      socket.data.userRole = user.role;

      if (this.adminNsp.includes(nsp) && user.role !== 'admin' && user.role !== 'master') {
        return next(new UnauthorizedError('insufficient_role', { message: `Not authorized to connect to ${nsp}` }));
      }

      const dbToken = this.authService.findByAccessToken(socket.encodedToken!);
      if (!dbToken) {
        return next(new UnauthorizedError('unauthenticated', { message: 'Unauthenticated' }));
      }

      return next();
    };
  }

  private setupConnection(socket: Socket, nsp: SocketNsp): void {
    const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
    const user = this.usersService.findByName(decodedToken?.username ?? '');
    const address = socket.conn.remoteAddress;
    const dbToken = this.authService.findByAccessToken(socket.encodedToken!);
    const device = dbToken?.device.name;

    this.logger.trace(`${user?.username} | ${address} | ${device} | authenticated and connected to ${nsp} | id: ${socket.id}`);

    socket.on('disconnect', (reason: DisconnectReason) => {
      this.logger.trace(`${user?.username} | ${address} | ${device} | disconnected from ${nsp} (${reason}) | id: ${socket.id}`);
    });
  }
}
