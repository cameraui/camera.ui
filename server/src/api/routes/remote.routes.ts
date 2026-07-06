import { RemoteController } from '../controllers/remote.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { cloudflareManagedConnectSchema, pairInitSchema, pairPollSchema, patchRemoteSchema, testRemoteSchema, updateServerNameSchema } from '../schemas/remote.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const RemoteRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const remoteController = new RemoteController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.getRemoteInfo.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Get remote access settings and status',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.patchRemoteInfo.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Update remote access settings',
      body: patchRemoteSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/pair/init',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.pairInit.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Initiate cloud server pairing',
      body: pairInitSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/pair/poll',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.pairPoll.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Poll for cloud server pairing completion',
      body: pairPollSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/name',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.updateServerName.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Update the cloud server display name',
      body: updateServerNameSchema,
    },
  });

  app.route({
    url: '/unregister',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.unregisterServer.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Unregister this server from the cloud',
    },
  });

  app.route({
    url: '/status',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.getRegistrationStatus.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Get cloud registration status',
    },
  });

  app.route({
    url: '/tunnel',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.getTunnelStatus.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Get the current tunnel connection status',
    },
  });

  app.route({
    url: '/connection-info',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: remoteController.getConnectionInfo.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Get connection info including internal and external addresses',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/test/:mode',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.testRemoteMode.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Test a remote access mode (cloudflare or customDomain)',
      params: testRemoteSchema,
    },
  });

  app.route({
    url: '/cloudflare/managed/status',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.cloudflareManagedStatus.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Get the Cloudflare managed tunnel status',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/cloudflare/managed/connect',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.cloudflareManagedConnect.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Connect a Cloudflare managed tunnel for a hostname',
      body: cloudflareManagedConnectSchema,
    },
  });

  app.route({
    url: '/cloudflare/managed/cancel',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.cloudflareManagedCancel.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Cancel a pending Cloudflare managed tunnel connection',
    },
  });

  app.route({
    url: '/cloudflare/managed/disconnect',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.cloudflareManagedDisconnect.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Disconnect the active Cloudflare managed tunnel',
    },
  });

  app.route({
    url: '/cloudflare/managed/logout',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: remoteController.cloudflareManagedLogout.bind(remoteController),
    schema: {
      tags: ['Remote'],
      summary: 'Log out of Cloudflare and remove stored credentials',
    },
  });
};
