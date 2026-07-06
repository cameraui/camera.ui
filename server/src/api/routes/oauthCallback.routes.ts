import { OAuthCallbackController } from '../controllers/oauthCallback.controller.js';
import { oauthCallbackParamsSchema, oauthCallbackQuerySchema } from '../schemas/oauthCallback.schema.js';

import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const OAuthCallbackRoute: FastifyPluginAsync = async (app) => {
  const oauthCallbackController = new OAuthCallbackController();

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/callback/:pluginId',
    handler: oauthCallbackController.callback.bind(oauthCallbackController),
    schema: {
      tags: ['OAuth'],
      summary: 'OAuth Authorization-Code callback dispatcher — forwards code+state to the plugin',
      params: oauthCallbackParamsSchema,
      querystring: oauthCallbackQuerySchema,
    },
  });
};
