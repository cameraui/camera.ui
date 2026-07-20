import { MqttController } from '../controllers/mqtt.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { patchMqttSchema, testMqttSchema } from '../schemas/mqtt.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const MqttRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const mqttController = new MqttController(app);

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: mqttController.getMqttInfo.bind(mqttController),
    schema: {
      tags: ['MQTT'],
      summary: 'Get MQTT settings and connection status',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: mqttController.patchMqttInfo.bind(mqttController),
    schema: {
      tags: ['MQTT'],
      summary: 'Update MQTT settings',
      body: patchMqttSchema,
    },
  });

  app.route({
    url: '/status',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: mqttController.getMqttStatus.bind(mqttController),
    schema: {
      tags: ['MQTT'],
      summary: 'Get the current MQTT connection status',
    },
  });

  app.route({
    url: '/topics',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: mqttController.getMqttTopics.bind(mqttController),
    schema: {
      tags: ['MQTT'],
      summary: 'Get recently seen MQTT topics',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/test',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: mqttController.testMqttConnection.bind(mqttController),
    schema: {
      tags: ['MQTT'],
      summary: 'Test a broker connection with the given (unsaved) settings',
      body: testMqttSchema,
    },
  });
};
