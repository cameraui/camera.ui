import { ApiRoute } from './api.routes.js';
import { AuthRoute } from './auth.routes.js';
import { AutomationsRoute } from './automations.routes.js';
import { BackupRoute } from './backup.routes.js';
import { CamerasRoute } from './cameras.routes.js';
import { ConfigRoute } from './config.routes.js';
import { DownloadRoute } from './download.routes.js';
import { FilesRoute } from './files.routes.js';
import { FrameWorkersRoute } from './frameWorkers.routes.js';
import { InstancesRoute } from './instances.routes.js';
import { NotificationsRoute } from './notifications.routes.js';
import { OAuthCallbackRoute } from './oauthCallback.routes.js';
import { PluginsRoute } from './plugins.routes.js';
import { RemoteRoute } from './remote.routes.js';
import { ServerRoute } from './server.routes.js';
import { SharesRoute } from './shares.routes.js';
import { TunnelRoute } from './tunnel.routes.js';
import { UsersRoute } from './users.routes.js';
import { WorkersRoute } from './workers.routes.js';

import type { FastifyInstance } from 'fastify';

const ASSET_EXT = /\.(?:js|mjs|css|map|json|wasm|webmanifest|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|xml|txt)$/i;

export class FastifyRoutes {
  private app: FastifyInstance;

  constructor(app: FastifyInstance<any, any, any, any>) {
    this.app = app;
  }

  public async register(): Promise<void> {
    await this.app.register(ApiRoute, { prefix: '/api' });
    await this.app.register(AuthRoute, { prefix: '/api/auth' });
    await this.app.register(BackupRoute, { prefix: '/api/backup' });
    await this.app.register(CamerasRoute, { prefix: '/api/cameras' });
    await this.app.register(ConfigRoute, { prefix: '/api/config' });
    await this.app.register(DownloadRoute, { prefix: '/api/download' });
    await this.app.register(FilesRoute, { prefix: '/api/files' });
    await this.app.register(FrameWorkersRoute, { prefix: '/api/frameworkers' });
    await this.app.register(PluginsRoute, { prefix: '/api/plugins' });
    await this.app.register(ServerRoute, { prefix: '/api/server' });
    await this.app.register(RemoteRoute, { prefix: '/api/remote' });
    await this.app.register(UsersRoute, { prefix: '/api/users' });
    await this.app.register(WorkersRoute, { prefix: '/api/workers' });
    await this.app.register(InstancesRoute, { prefix: '/api/instances' });
    await this.app.register(SharesRoute, { prefix: '/api/shares' });
    await this.app.register(AutomationsRoute, { prefix: '/api/automations' });
    await this.app.register(NotificationsRoute, { prefix: '/api/notifications' });
    await this.app.register(OAuthCallbackRoute, { prefix: '/oauth' });

    this.app.setNotFoundHandler((req, reply) => {
      const path = (req.url ?? '').split('?')[0];
      const isAsset = path.startsWith('/assets/') || ASSET_EXT.test(path);
      const isApi = path.startsWith('/api/') || path.startsWith('/oauth/') || path.startsWith('/tunnel/');

      if (req.method !== 'GET' || isApi || isAsset) {
        reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Route ${req.method}:${path} not found` });
        return;
      }

      reply.sendFile('index.html');
    });
  }

  public async registerInternal(): Promise<void> {
    await this.app.register(TunnelRoute, { prefix: '/tunnel' });
  }
}
