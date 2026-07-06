import { NotificationsController } from '../controllers/notifications.controller.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { deviceParamsSchema, notificationSettingsSchema, registerDeviceSchema, updateDeviceSchema } from '../schemas/notifications.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const NotificationsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new NotificationsController(app);

  app.route({
    url: '/settings',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getSettings.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Get the notification settings for the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/settings',
    method: 'PUT',
    preValidation: [validJWTNeeded],
    handler: controller.setSettings.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Replace the notification settings for the current user',
      body: notificationSettingsSchema,
    },
  });

  app.route({
    url: '/devices',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listDevices.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'List the registered push devices for the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/devices',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.registerDevice.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Register a push device',
      body: registerDeviceSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/devices/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.revokeDevice.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Revoke a registered push device',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/devices/:id',
    method: 'PATCH',
    preValidation: [validJWTNeeded],
    handler: controller.updateDevice.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Update a registered push device',
      params: deviceParamsSchema,
      body: updateDeviceSchema,
    },
  });

  app.route({
    url: '/sources',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.listSources.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'List the available notification sources',
    },
  });

  app.route({
    url: '/history',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.getHistory.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Get the notification history',
    },
  });

  app.route({
    url: '/history',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.clearHistory.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Clear the notification history',
    },
  });
};
