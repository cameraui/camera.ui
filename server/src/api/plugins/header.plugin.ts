import fp from 'fastify-plugin';

import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';

export const HeaderPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', (_req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) => {
    reply.headers({
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      Expires: '0',
      Pragma: 'no-cache',
      'Surrogate-Control': 'no-store',
    });
    done();
  });
});
