import * as zod from 'zod';

import { SensorsController } from '../controllers/sensors.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { bulkDeleteSensorsSchema, createVirtualSensorSchema, patchSensorSchema, sensorCommandSchema, sensorParamsSchema } from '../schemas/sensors.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const SensorsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new SensorsController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.list.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'List all sensors',
      querystring: zod.object({ camera: zod.string().min(1).optional() }),
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getById.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Get a sensor by ID',
      params: sensorParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.createVirtual.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Create a virtual sensor',
      body: createVirtualSensorSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.update.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Update a sensor (display name, camera assignments, export)',
      params: sensorParamsSchema,
      body: patchSensorSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.deleteBulk.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Delete multiple sensors at once',
      body: bulkDeleteSensorsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.delete.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Delete a sensor',
      params: sensorParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/history',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getHistory.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Get recent state changes of a sensor',
      params: sensorParamsSchema,
      querystring: zod.object({ limit: zod.coerce.number().int().min(1).max(500).optional() }),
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/command',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.command.bind(controller),
    schema: {
      tags: ['Sensors'],
      summary: 'Send a command to a sensor',
      params: sensorParamsSchema,
      body: sensorCommandSchema,
    },
  });
};
