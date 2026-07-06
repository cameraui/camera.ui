import { CamerasController } from '../controllers/cameras.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { pages } from '../middlewares/pagination.middleware.js';
import {
  cameraParamsSchema,
  cameraSourceParamsSchema,
  createCameraSchema,
  detectionLineSchema,
  detectionZoneSchema,
  extensionTypeQuerySchema,
  patchCameraSchema,
  cameraPluginParamsSchema,
  previewCameraSchema,
  probeQuerySchema,
  scopedPluginParamsSchema,
  scopedSensorParamsSchema,
  sensorParamsSchema,
  snapshotQuerySchema,
  streamParamsSchema,
} from '../schemas/cameras.schema.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import { patchStorageSchema, setStorageSchema, submitStorageSchema } from '../schemas/storage.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const CamerasRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const camerasController = new CamerasController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: camerasController.list.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'List all cameras',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.insert.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Create a new camera',
      body: createCameraSchema,
    },
  });

  app.route({
    url: '/rooms',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.listRooms.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'List all camera rooms',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/streams/:cameraid/:sourcename',
    method: 'GET',
    handler: camerasController.getStreamUrl.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the custom stream URL for a camera source',
      params: streamParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/preview',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.preview.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Capture a preview snapshot from a stream URL',
      body: previewCameraSchema,
    },
  });

  app.route({
    url: '/',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.removeAll.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Delete all cameras',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.getByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get a camera by name or ID',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/probe/:sourcename',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.probeSourceByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Probe a camera source for stream information',
      params: cameraSourceParamsSchema,
      querystring: probeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/info/:sourcename',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.streamSourceInfoByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get stream info for a camera source',
      params: cameraSourceParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/snapshot',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.getSnapshotByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the latest snapshot for a camera',
      params: cameraParamsSchema,
      querystring: snapshotQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/extensions',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: camerasController.getExtensionsByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'List the assigned plugin extensions for a camera',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update a camera by name',
      params: cameraParamsSchema,
      body: patchCameraSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/log/download',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.downloadLog.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Download the log file for a camera',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/log',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.clearLog.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Clear the log for a camera',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/zones',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getZones.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the detection zones for a camera',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/zones',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchZones.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the detection zones for a camera',
      params: cameraParamsSchema,
      body: detectionZoneSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/lines',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getLines.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the detection lines for a camera',
      params: cameraParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/lines',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchLines.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the detection lines for a camera',
      params: cameraParamsSchema,
      body: detectionLineSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the plugin extension config for a camera',
      params: cameraPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the scoped plugin extension config for a camera',
      params: scopedPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the plugin extension config for a camera',
      params: cameraPluginParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the scoped plugin extension config for a camera',
      params: scopedPluginParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.submitExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Submit a plugin extension config action for a camera',
      params: cameraPluginParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.submitExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Submit a scoped plugin extension config action for a camera',
      params: scopedPluginParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.setExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Reset a plugin extension config key for a camera',
      params: cameraPluginParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.setExtensionConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Reset a scoped plugin extension config key for a camera',
      params: scopedPluginParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/sensor/:sensorId/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the sensor config for a camera plugin',
      params: sensorParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/sensor/:sensorId/config',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.getSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Get the scoped sensor config for a camera plugin',
      params: scopedSensorParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/sensor/:sensorId/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the sensor config for a camera plugin',
      params: sensorParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/sensor/:sensorId/config',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.patchSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Update the scoped sensor config for a camera plugin',
      params: scopedSensorParamsSchema,
      body: patchStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/sensor/:sensorId/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.submitSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Submit a sensor config action for a camera plugin',
      params: sensorParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/sensor/:sensorId/config',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.submitSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Submit a scoped sensor config action for a camera plugin',
      params: scopedSensorParamsSchema,
      body: submitStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/sensor/:sensorId/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.setSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Reset a sensor config key for a camera plugin',
      params: sensorParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/@:scope/:pluginname/sensor/:sensorId/config',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.setSensorConfigByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Reset a scoped sensor config key for a camera plugin',
      params: scopedSensorParamsSchema,
      body: setStorageSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/activate',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.activateExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Activate a plugin extension for a camera',
      params: cameraPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/activate',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.activateExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Activate a scoped plugin extension for a camera',
      params: scopedPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/deactivate',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.deactivateExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Deactivate a plugin extension for a camera',
      params: cameraPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/deactivate',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.deactivateExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Deactivate a scoped plugin extension for a camera',
      params: scopedPluginParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/enable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.enableExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Enable a plugin extension assignment for a camera',
      params: cameraPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/enable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.enableExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Enable a scoped plugin extension assignment for a camera',
      params: scopedPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname/disable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.disableExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Disable a plugin extension assignment for a camera',
      params: cameraPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname/disable',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.disableExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Disable a scoped plugin extension assignment for a camera',
      params: scopedPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.addExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Add a plugin extension to a camera',
      params: cameraPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.addExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Add a scoped plugin extension to a camera',
      params: scopedPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:pluginname',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.removeExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Remove a plugin extension from a camera',
      params: cameraPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname/:scope/:pluginname',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.removeExtensionByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Remove a scoped plugin extension from a camera',
      params: scopedPluginParamsSchema,
      querystring: extensionTypeQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:cameraname',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: camerasController.removeByName.bind(camerasController),
    schema: {
      tags: ['Cameras'],
      summary: 'Delete a camera by name',
      params: cameraParamsSchema,
    },
  });
};
