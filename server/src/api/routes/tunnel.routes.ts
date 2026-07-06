import { TunnelController } from '../controllers/tunnel.controller.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

export const TunnelRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const tunnelController = new TunnelController();

  app.route({
    url: '/check',
    method: 'GET',
    handler: tunnelController.check.bind(tunnelController),
    schema: {
      tags: ['Tunnel'],
      summary: 'Return internal and external network addresses for the tunnel',
    },
  });
};
