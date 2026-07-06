import { WorkersController } from '../controllers/workers.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  agentParamsSchema,
  assignCameraSchema,
  assignPluginSchema,
  pairWorkerSchema,
  patchWorkersConfigSchema,
  unassignCameraSchema,
  unassignPluginSchema,
} from '../schemas/workers.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const WorkersRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const workersController = new WorkersController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.getWorkers.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'List all registered remote workers',
    },
  });

  app.route({
    url: '/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.getConfig.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Get the master workers configuration',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.patchConfig.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Update the master workers configuration (enable/disable, address, port)',
      body: patchWorkersConfigSchema,
    },
  });

  app.route({
    url: '/pairings',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.createPairing.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Create a one-time pairing code for a new worker',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/pair',
    method: 'POST',
    handler: workersController.pair.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Exchange a pairing code for worker credentials',
      body: pairWorkerSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:agentId',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.removeWorker.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Remove a worker and revoke its credentials',
      params: agentParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/assign',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.assignCamera.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Assign a camera to a worker agent',
      body: assignCameraSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/unassign',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.unassignCamera.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Unassign a camera from its worker agent',
      body: unassignCameraSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/assign-plugin',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.assignPlugin.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Assign a plugin to a worker agent',
      body: assignPluginSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/unassign-plugin',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.unassignPlugin.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Unassign a plugin from its worker agent',
      body: unassignPluginSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:agentId/restart',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: workersController.restartWorker.bind(workersController),
    schema: {
      tags: ['Workers'],
      summary: 'Restart a specific worker agent',
      params: agentParamsSchema,
    },
  });
};
