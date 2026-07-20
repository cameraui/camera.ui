import { AutomationsController } from '../controllers/automations.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  automationParamsSchema,
  automationStoreParamsSchema,
  automationStoreQuerySchema,
  createAutomationSchema,
  geofenceParamsSchema,
  importBlueprintSchema,
  locationBodySchema,
  patchAutomationSchema,
  webhookBodySchema,
  webhookParamsSchema,
} from '../schemas/automations.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const AutomationsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new AutomationsController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.list.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'List all automations',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/store',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.storeList.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Browse the community automations store',
      querystring: automationStoreQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/store/:id',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.storeItem.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Get a community automation blueprint from the store',
      params: automationStoreParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.getById.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Get an automation by ID',
      params: automationParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.create.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Create a new automation',
      body: createAutomationSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.update.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Update an existing automation',
      params: automationParamsSchema,
      body: patchAutomationSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.delete.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Delete an automation',
      params: automationParamsSchema,
    },
  });

  app.route({
    url: '/plugin-methods',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.pluginMethods.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'List available plugin action methods',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/import',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.importBlueprint.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Import an automation from a blueprint',
      body: importBlueprintSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/export',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.exportBlueprint.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Export an automation as a blueprint',
      params: automationParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/runs',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.listRuns.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'List recent runs of an automation with per-node trace',
      params: automationParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/trigger',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.trigger.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Manually trigger an automation',
      params: automationParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/webhook/:webhookId',
    method: 'POST',
    handler: controller.webhook.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Fire an automation via webhook',
      params: webhookParamsSchema,
      body: webhookBodySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/location/:geofenceId',
    method: 'POST',
    handler: controller.location.bind(controller),
    schema: {
      tags: ['Automations'],
      summary: 'Submit a geofence location event',
      params: geofenceParamsSchema,
      body: locationBodySchema,
    },
  });
};
