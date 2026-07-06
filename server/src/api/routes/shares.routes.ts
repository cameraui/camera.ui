import { SharesController } from '../controllers/shares.controller.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { createShareSchema, shareTokenParamsSchema, sharesListQuerySchema, shareViewQuerySchema } from '../schemas/shares.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const SharesRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const sharesController = new SharesController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: sharesController.create.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'Create a new camera share link',
      body: createShareSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: sharesController.list.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'List all active share links',
      querystring: sharesListQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:token',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: sharesController.revoke.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'Revoke a share link by token',
      params: shareTokenParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/v/:token',
    method: 'GET',
    handler: sharesController.validate.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'Validate a share token and obtain a stream access token',
      params: shareTokenParamsSchema,
      querystring: shareViewQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/r/:token',
    method: 'POST',
    handler: sharesController.refresh.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'Refresh an active share stream token',
      params: shareTokenParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/d/:token',
    method: 'POST',
    handler: sharesController.disconnect.bind(sharesController),
    schema: {
      tags: ['Shares'],
      summary: 'Notify the server that a share viewer disconnected',
      params: shareTokenParamsSchema,
    },
  });
};
