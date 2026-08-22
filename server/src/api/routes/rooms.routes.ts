import { RoomsController } from '../controllers/rooms.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { createRoomSchema, roomParamsSchema } from '../schemas/rooms.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const RoomsRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const roomsController = new RoomsController();

  app.route({
    url: '/',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: roomsController.list.bind(roomsController),
    schema: {
      tags: ['Rooms'],
      summary: 'The rooms and levels of this home',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: roomsController.create.bind(roomsController),
    schema: {
      tags: ['Rooms'],
      summary: 'Create a room',
      body: createRoomSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/:roomid',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: roomsController.remove.bind(roomsController),
    schema: {
      tags: ['Rooms'],
      summary: 'Delete a room, its shape and its camera assignments',
      params: roomParamsSchema,
    },
  });
};
