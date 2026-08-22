import { FloorPlanController } from '../controllers/floorplan.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { putFloorPlanSchema } from '../schemas/floorplan.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const FloorPlanRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const floorPlanController = new FloorPlanController();

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: floorPlanController.get.bind(floorPlanController),
    schema: {
      tags: ['Floor plan'],
      summary: 'The floor plan with its levels, rooms and camera placements',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: floorPlanController.replace.bind(floorPlanController),
    schema: {
      tags: ['Floor plan'],
      summary: 'Replace the floor plan',
      body: putFloorPlanSchema,
    },
  });
};
