import fp from 'fastify-plugin';

import { SocketService } from '../websocket/index.js';

import type { FastifyInstance, FastifyPluginAsync, HookHandlerDoneFunction } from 'fastify';
import type { Server, ServerOptions } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
  interface FastifyRequest {
    io: Server;
  }
}

export const SocketIoPlugin: FastifyPluginAsync<Partial<ServerOptions>> = fp(async (app: FastifyInstance, opts: Partial<ServerOptions>) => {
  const socketService = new SocketService(app, opts);

  app.decorate('io', socketService.io);
  app.decorateRequest('io', { getter: () => socketService.io });

  app.addHook('preClose', (done: HookHandlerDoneFunction) => {
    socketService.io.close();

    done();
  });
});
