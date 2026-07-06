import ac from 'ansicolor';
import fp from 'fastify-plugin';
import { container } from 'tsyringe';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { LoggerService } from '../../services/logger/index.js';

declare module 'fastify' {
  interface FastifyReply {
    startTime: number;
  }
}

function getStatusColor(statusCode: number): 'lightRed' | 'lightYellow' | 'lightCyan' | 'lightGreen' | 'darkGray' {
  if (statusCode >= 500) return 'lightRed';
  if (statusCode >= 400) return 'lightYellow';
  if (statusCode >= 300) return 'lightCyan';
  if (statusCode >= 200) return 'lightGreen';
  return 'darkGray';
}

export const LoggerPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  const logger = container.resolve<LoggerService>('logger');

  app.addHook('onRequest', (_req, reply, done) => {
    reply.startTime = Date.now();
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    const color = getStatusColor(reply.statusCode);

    const method = ac.blue(req.method);
    const url = ac.darkGray(req.url);
    const status = ac[color](reply.statusCode);
    const durationMs = ac.darkGray(`${Date.now() - reply.startTime}ms`);
    const contentLength = ac.darkGray((reply.getHeader('content-length') ?? '').toString());

    logger.trace(`${method} ${url} ${status} ${durationMs} - ${contentLength}`);

    done();
  });
});
