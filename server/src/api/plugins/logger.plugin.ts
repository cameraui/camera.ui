import fp from 'fastify-plugin';
import { container } from 'tsyringe';

import { paint } from '../../utils/colors.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { LoggerService } from '../../services/logger/index.js';
import type { Color } from '../../utils/colors.js';

declare module 'fastify' {
  interface FastifyReply {
    startTime: number;
  }
}

function getStatusColor(statusCode: number): Color {
  if (statusCode >= 500) return 'redBright';
  if (statusCode >= 400) return 'yellowBright';
  if (statusCode >= 300) return 'cyanBright';
  if (statusCode >= 200) return 'greenBright';
  return 'gray';
}

export const LoggerPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  const logger = container.resolve<LoggerService>('logger');

  app.addHook('onRequest', (_req, reply, done) => {
    reply.startTime = Date.now();
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    const color = getStatusColor(reply.statusCode);

    const method = paint('blue', req.method);
    const url = paint('gray', req.url);
    const status = paint(color, reply.statusCode.toString());
    const durationMs = paint('gray', `${Date.now() - reply.startTime}ms`);
    const contentLength = paint('gray', (reply.getHeader('content-length') ?? '').toString());

    logger.trace(`${method} ${url} ${status} ${durationMs} - ${contentLength}`);

    done();
  });
});
