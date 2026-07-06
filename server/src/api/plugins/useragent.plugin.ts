import { useragent } from 'express-useragent';
import fp from 'fastify-plugin';

import type { AgentDetails } from 'express-useragent';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    useragent?: AgentDetails;
  }
}

export const UserAgentPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  app.addHook('onRequest', (req: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction) => {
    const source = req.headers['user-agent'];
    req.useragent = source ? useragent.parse(source) : undefined;
    done();
  });
});
