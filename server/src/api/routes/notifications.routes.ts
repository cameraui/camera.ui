import { NotificationsController } from '../controllers/notifications.controller.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  deviceParamsSchema,
  notificationIdsSchema,
  notificationListQuerySchema,
  notificationSettingsSchema,
  registerDeviceSchema,
  updateDeviceSchema,
} from '../schemas/notifications.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const NotificationsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new NotificationsController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.list.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'List notifications, newest first',
      querystring: notificationListQuerySchema,
    },
  });

  app.route({
    url: '/',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.clearHistory.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Delete all notifications',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/seen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markManySeen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark the given notifications as seen, or all without ids',
      body: notificationIdsSchema.partial().nullish(),
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/delete',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.removeMany.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Delete the given notifications',
      body: notificationIdsSchema,
    },
  });

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

  app.route({
    url: '/history/seen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markManySeen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark all notifications as seen',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/history/:id/seen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markSeen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark a notification as seen',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/history/:id/image',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.historyImage.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Get the stored image of a notification',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/history/:id/video',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.historyVideo.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Get the stored clip of a notification',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: controller.get.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Get one notification',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.remove.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Delete a notification',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/seen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markSeen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark a notification as seen',
      params: deviceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:id/unseen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markUnseen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark a notification as unseen',
      params: deviceParamsSchema,
    },
  });
};
