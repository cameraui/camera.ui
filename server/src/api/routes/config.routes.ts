import { load } from 'js-yaml';

import { ConfigController } from '../controllers/config.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { configQuerySchema, patchConfigSchema } from '../schemas/config.schema.js';
import { patchGo2RtcSchema } from '../schemas/go2rtc.schema.js';

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const ConfigRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const configController = new ConfigController(app);

  app.addContentTypeParser('text/yaml', { parseAs: 'string' }, async (_req: FastifyRequest, body: string) => {
    return body.trim() ? load(body) : undefined;
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.showConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Get the server configuration (YAML or JSON)',
      querystring: configQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/go2rtc',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.showGo2RtcConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Get the go2rtc configuration (YAML or JSON)',
      querystring: configQuerySchema,
    },
  });

  app.route({
    url: '/donwload',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.downloadConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Download the server configuration file',
    },
  });

  app.route({
    url: '/donwload/go2rtc',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.downloadGo2RtcConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Download the go2rtc configuration file',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.patchConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Apply a partial update to the server configuration',
      body: patchConfigSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/go2rtc',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: configController.patchGo2RtcConfig.bind(configController),
    schema: {
      tags: ['Config'],
      summary: 'Apply a partial update to the go2rtc configuration',
      body: patchGo2RtcSchema,
    },
  });
};
