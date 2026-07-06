import { PluginsController } from '../controllers/plugins.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { pages } from '../middlewares/pagination.middleware.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import {
  installPluginSchema,
  pluginParamsSchema,
  pluginScopedParamsSchema,
  pluginVersionQuerySchema,
  removeStorageQuerySchema,
  searchQuerySchema,
} from '../schemas/plugins.schema.js';
import { patchStorageSchema, setStorageSchema, submitStorageSchema } from '../schemas/storage.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const PluginsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const pluginsController = new PluginsController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: pluginsController.list.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'List all installed plugins',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/extensions',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: pluginsController.listExtensions.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'List all plugin extensions',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/search',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: pluginsController.search.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Search the npm registry for camera.ui plugins',
      querystring: searchQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/progress',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: pluginsController.installProgress.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'List plugins currently being installed or updated',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.installOrUpdate.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Install or update a plugin',
      body: installPluginSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.uninstallAll.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Uninstall all plugins',
      querystring: removeStorageQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get a plugin by name',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get a scoped plugin by name',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/versions',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getVersionsByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get available versions for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/versions',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getVersionsByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get available versions for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/compat',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getEngineCompatByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Check engine compatibility for a plugin version',
      params: pluginParamsSchema,
      querystring: pluginVersionQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/compat',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getEngineCompatByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Check engine compatibility for a scoped plugin version',
      params: pluginScopedParamsSchema,
      querystring: pluginVersionQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/update',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginUpdateByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Check for an available update for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/update',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginUpdateByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Check for an available update for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/contract',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getContractByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the contract and camera assignments for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/contract',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getContractByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the contract and camera assignments for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.getConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the storage configuration for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.getConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the storage configuration for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.patchConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Partially update the storage configuration for a plugin',
      params: pluginParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.patchConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Partially update the storage configuration for a scoped plugin',
      params: pluginScopedParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.submitConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Submit a configuration value for a plugin',
      params: pluginParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.submitConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Submit a configuration value for a scoped plugin',
      params: pluginScopedParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.setConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Delete a configuration key for a plugin',
      params: pluginParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.setConfigByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Delete a configuration key for a scoped plugin',
      params: pluginScopedParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/logo',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginLogoByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the logo for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/logo',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginLogoByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the logo for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/readme',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getReadmeByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the README for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/readme',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getReadmeByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the README for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/changelog',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getChangelogByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the changelog for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/changelog',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getChangelogByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the changelog for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/interface',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginInterface.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the detection interface settings for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/interface',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: pluginsController.getPluginInterface.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Get the detection interface settings for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/start',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.startByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Start a plugin process',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/start',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.startByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Start a scoped plugin process',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/stop',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.stopByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Stop a plugin process',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/stop',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.stopByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Stop a scoped plugin process',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/restart',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.restartByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Restart a plugin process',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/restart',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.restartByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Restart a scoped plugin process',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/enable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.enableByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Enable a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/enable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.enableByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Enable a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/disable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.disableByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Disable a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/disable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.disableByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Disable a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/log/download',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.downloadLog.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Download the log file for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/log/download',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.downloadLog.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Download the log file for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname/log',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.clearLog.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Clear the log for a plugin',
      params: pluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname/log',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.clearLog.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Clear the log for a scoped plugin',
      params: pluginScopedParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:pluginname',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.uninstallByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Uninstall a plugin by name',
      params: pluginParamsSchema,
      querystring: removeStorageQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/@:scope/:pluginname',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: pluginsController.uninstallByName.bind(pluginsController),
    schema: {
      tags: ['Plugins'],
      summary: 'Uninstall a scoped plugin by name',
      params: pluginScopedParamsSchema,
      querystring: removeStorageQuerySchema,
    },
  });
};
