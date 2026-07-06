import { DownloadController } from '../controllers/download.controller.js';
import { downloadParamsSchema } from '../schemas/download.schema.js';

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const DownloadRoute: FastifyPluginAsync = async (app) => {
  const downloadController = new DownloadController();

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:token',
    handler: downloadController.download.bind(downloadController),
    schema: {
      tags: ['Download'],
      summary: 'Download a file by its signed token',
      params: downloadParamsSchema,
    },
  });
};
