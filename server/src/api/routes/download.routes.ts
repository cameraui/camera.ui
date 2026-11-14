import { DownloadController } from '../controllers/download.controller.js';
import { downloadParamsSchema } from '../schemas/download.schema.js';

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const DownloadRoute: FastifyPluginAsync = async (app) => {
  const downloadController = new DownloadController();

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:token',
    exposeHeadRoute: false,
    handler: downloadController.download.bind(downloadController),
    schema: {
      tags: ['Download'],
      summary: 'Download a file by its signed token',
      params: downloadParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'HEAD',
    url: '/:token',
    handler: downloadController.check.bind(downloadController),
    schema: {
      tags: ['Download'],
      summary: 'Check that a download token is still valid without downloading the file',
      params: downloadParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:token',
    handler: downloadController.cancel.bind(downloadController),
    schema: {
      tags: ['Download'],
      summary: 'End the transfers that run for a download token',
      params: downloadParamsSchema,
    },
  });
};
