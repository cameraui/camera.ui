import { NotificationsController } from '../controllers/notifications.controller.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  deviceParamsSchema,
  notificationClearQuerySchema,
  notificationIdsSchema,
  notificationListQuerySchema,
  notificationMuteSchema,
  notificationSeenSchema,
  notificationSettingsSchema,
  notificationUnmuteQuerySchema,
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

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.clear.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Delete all notifications, or only what the bell shows',
      querystring: notificationClearQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/seen',
    method: 'POST',
    preValidation: [validJWTNeeded],
    handler: controller.markManySeen.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mark the given notifications as seen, without ids all or only what the bell shows',
      body: notificationSeenSchema.nullish(),
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

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/mute',
    method: 'PUT',
    preValidation: [validJWTNeeded],
    handler: controller.mute.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'Mute push and desktop alerts for the current user, or only those of one camera',
      body: notificationMuteSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/mute',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: controller.unmute.bind(controller),
    schema: {
      tags: ['Notifications'],
      summary: 'End the mute of the current user, or of one camera',
      querystring: notificationUnmuteQuerySchema,
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
