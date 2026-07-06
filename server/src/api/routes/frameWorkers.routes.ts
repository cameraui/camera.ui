import { FrameWorkersController } from '../controllers/frameWorkers.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { pages } from '../middlewares/pagination.middleware.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import { frameWorkerParamsSchema } from '../schemas/frameWorkers.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const FrameWorkersRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const frameWorkersController = new FrameWorkersController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: frameWorkersController.list.bind(frameWorkersController),
    schema: {
      tags: ['Frame Workers'],
      summary: 'List all frame workers with pagination',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:frameworkername/start',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: frameWorkersController.startByName.bind(frameWorkersController),
    schema: {
      tags: ['Frame Workers'],
      summary: 'Start a frame worker by name',
      params: frameWorkerParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:frameworkername/stop',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: frameWorkersController.stopByName.bind(frameWorkersController),
    schema: {
      tags: ['Frame Workers'],
      summary: 'Stop a frame worker by name',
      params: frameWorkerParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:frameworkername/restart',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: frameWorkersController.restartByName.bind(frameWorkersController),
    schema: {
      tags: ['Frame Workers'],
      summary: 'Restart a frame worker by name',
      params: frameWorkerParamsSchema,
    },
  });
};
