import { UsersController } from '../controllers/users.controller.js';
import { onlyAdminCanDoThisAction, onlySameUserOrAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { pages } from '../middlewares/pagination.middleware.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import {
  cameraShortcutByIdParamsSchema,
  cameraShortcutParamsSchema,
  createUserSchema,
  patchPreferencesCameraShortcutLayout,
  patchPreferencesCamviewViewsLayout,
  patchUserSchema,
  userPreferencesCameraShortcutLayout,
  userPreferencesCamviewViewsLayout,
  usernameParamsSchema,
  viewParamsSchema,
  viewsListParamsSchema,
} from '../schemas/users.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const UsersRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const usersController = new UsersController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    preSerialization: [pages],
    handler: usersController.list.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'List all users',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: usersController.insert.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Create a new user',
      body: createUserSchema,
    },
  });

  app.route({
    method: 'DELETE',
    url: '/',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: usersController.removeAll.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete all users',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:username',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.getByName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Get a user by username',
      params: usernameParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'PATCH',
    url: '/:username',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.patchByName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Partially update a user',
      params: usernameParamsSchema,
      body: patchUserSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:username',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: usersController.removeByName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete a user by username',
      params: usernameParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:username/preferences/cameras/:cameraname/shortcuts',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.getShortcutsByCameraName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'List all camera shortcuts for a user',
      params: cameraShortcutParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:username/preferences/cameras/:cameraname/shortcuts/:shortcutid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.getShortcutByCameraName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Get a single camera shortcut by id',
      params: cameraShortcutByIdParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:username/preferences/cameras/:cameraname/shortcuts/:shortcutid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.removeShortcutByCameraName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete a single camera shortcut by id',
      params: cameraShortcutByIdParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/:username/preferences/cameras/:cameraname/shortcuts',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.insertShortcut.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Add a shortcut to a camera',
      params: cameraShortcutParamsSchema,
      body: userPreferencesCameraShortcutLayout,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'PATCH',
    url: '/:username/preferences/cameras/:cameraname/shortcuts/:shortcutid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.patchShortcutByCameraName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Update a camera shortcut by id',
      params: cameraShortcutByIdParamsSchema,
      body: patchPreferencesCameraShortcutLayout,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:username/preferences/cameras/:cameraname/shortcuts',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.removeAllShortcutsByCameraName.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete all shortcuts for a camera',
      params: cameraShortcutParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:username/preferences/camview/views',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    preSerialization: [pages],
    handler: usersController.listViews.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'List all camview layout views for a user',
      params: viewsListParamsSchema,
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:username/preferences/camview/views',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    preSerialization: [pages],
    handler: usersController.removeAllViews.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete all camview layout views for a user',
      params: viewsListParamsSchema,
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:username/preferences/camview/views/:viewid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.getViewById.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Get a camview layout view by id',
      params: viewParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'POST',
    url: '/:username/preferences/camview/views',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.insertView.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Create a new camview layout view',
      params: viewsListParamsSchema,
      body: userPreferencesCamviewViewsLayout,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'PATCH',
    url: '/:username/preferences/camview/views/:viewid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    handler: usersController.patchViewById.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Update a camview layout view by id',
      params: viewParamsSchema,
      body: patchPreferencesCamviewViewsLayout,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'DELETE',
    url: '/:username/preferences/camview/views/:viewid',
    preValidation: [validJWTNeeded, onlySameUserOrAdminCanDoThisAction],
    preSerialization: [pages],
    handler: usersController.removeViewById.bind(usersController),
    schema: {
      tags: ['Users'],
      summary: 'Delete a camview layout view by id',
      params: viewParamsSchema,
      querystring: paginationQuerySchema,
    },
  });
};
