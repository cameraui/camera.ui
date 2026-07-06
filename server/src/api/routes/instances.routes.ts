import { InstancesController } from '../controllers/instances.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { createInstanceSchema, instanceParamsSchema, updateInstanceSchema } from '../schemas/instances.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const InstancesRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new InstancesController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.getAll.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'List all remote instances',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.create.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Register a new remote instance',
      body: createInstanceSchema,
    },
  });

  app.route({
    url: '/identity',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getIdentity.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Get the identity of the local instance',
    },
  });

  app.route({
    url: '/status',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getLocalStatus.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Get the status of the local instance',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.update.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Update a remote instance',
      params: instanceParamsSchema,
      body: updateInstanceSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/favorite',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.toggleFavorite.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Toggle the favorite flag for a remote instance',
      params: instanceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.remove.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Remove a remote instance',
      params: instanceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/login',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.loginToRemote.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Log in to a remote instance and obtain credentials',
      params: instanceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/status',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.getRemoteStatus.bind(controller),
    schema: {
      tags: ['Instances'],
      summary: 'Get the status of a remote instance',
      params: instanceParamsSchema,
    },
  });
};
