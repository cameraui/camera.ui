import { ApiController } from '../controllers/api.controller.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const ApiRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const apiController = new ApiController(app);

  app.route({
    url: '/',
    method: 'GET',
    handler: apiController.welcome.bind(apiController),
    schema: {
      tags: ['API'],
      summary: 'Return a welcome message and API version',
    },
  });

  app.route({
    url: '/health',
    method: 'GET',
    handler: apiController.health.bind(apiController),
    schema: {
      tags: ['API'],
      summary: 'Check the API health status',
    },
  });
};
