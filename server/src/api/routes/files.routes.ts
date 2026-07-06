import { FilesController } from '../controllers/files.controller.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { filesParamsSchema } from '../schemas/files.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const FilesRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const filesController = new FilesController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    method: 'GET',
    url: '/:file',
    preValidation: [validJWTNeeded],
    handler: filesController.serve.bind(filesController),
    schema: {
      tags: ['Files'],
      summary: 'Serve a user-uploaded file by filename',
      params: filesParamsSchema,
    },
  });
};
