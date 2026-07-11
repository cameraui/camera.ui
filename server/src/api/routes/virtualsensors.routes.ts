import { VirtualSensorsController } from '../controllers/virtualsensors.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { createVirtualSensorSchema, patchVirtualSensorSchema, virtualSensorParamsSchema } from '../schemas/virtualsensors.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const VirtualSensorsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new VirtualSensorsController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.list.bind(controller),
    schema: {
      tags: ['Virtual Sensors'],
      summary: 'List all virtual sensors',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.getById.bind(controller),
    schema: {
      tags: ['Virtual Sensors'],
      summary: 'Get a virtual sensor by ID',
      params: virtualSensorParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.create.bind(controller),
    schema: {
      tags: ['Virtual Sensors'],
      summary: 'Create a new virtual sensor',
      body: createVirtualSensorSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.update.bind(controller),
    schema: {
      tags: ['Virtual Sensors'],
      summary: 'Update a virtual sensor',
      params: virtualSensorParamsSchema,
      body: patchVirtualSensorSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.delete.bind(controller),
    schema: {
      tags: ['Virtual Sensors'],
      summary: 'Delete a virtual sensor',
      params: virtualSensorParamsSchema,
    },
  });
};
