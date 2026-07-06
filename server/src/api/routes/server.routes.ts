import { ServerController } from '../controllers/server.controller.js';
import { onlyAdminCanDoThisAction, onlyMasterCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { patchServerSchema, updateServerSchema } from '../schemas/server.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const ServerRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const serverController = new ServerController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.getServerInfo.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Get server info and network addresses',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.patchServerInfo.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Update server network address settings',
      body: patchServerSchema,
    },
  });

  app.route({
    url: '/version',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.checkVersion.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Check available server versions on npm',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/update',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.updateServer.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Install a specific server version',
      body: updateServerSchema,
    },
  });

  app.route({
    url: '/log/download',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.downloadLog.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Download the server log file',
    },
  });

  app.route({
    url: '/log',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.clearLog.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Clear the server log',
    },
  });

  app.route({
    url: '/cert',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.downloadCert.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Download the TLS CA certificate',
    },
  });

  app.route({
    url: '/restart',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.restart.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Restart the server process',
    },
  });

  app.route({
    url: '/reset',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyMasterCanDoThisAction],
    handler: serverController.reset.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Reset the server to factory defaults',
    },
  });

  app.route({
    url: '/restart/go2rtc',
    method: 'PUT',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.restartGo2rtc.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Restart the go2rtc process',
    },
  });

  app.route({
    url: '/go2rtc',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.go2rtcInfo.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Get go2rtc connection info',
    },
  });

  app.route({
    url: '/nats',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: serverController.natsInfo.bind(serverController),
    schema: {
      tags: ['Server'],
      summary: 'Get NATS bus connection info',
    },
  });
};
