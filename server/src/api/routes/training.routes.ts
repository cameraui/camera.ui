import { TrainingController } from '../controllers/training.controller.js';
import { onlyAdminCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import {
  trainingCandidateListQuerySchema,
  trainingCandidateParamsSchema,
  trainingCandidatePatchSchema,
  trainingSettingsPatchSchema,
  trainingSubmissionParamsSchema,
  trainingSubmitSchema,
} from '../schemas/training.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const TrainingRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const controller = new TrainingController();

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/candidates',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.list.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'List training candidates',
      querystring: trainingCandidateListQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/candidates/:id/image',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.image.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'The candidate frame as JPEG',
      params: trainingCandidateParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/candidates/:id',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.update.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Update candidate boxes or status',
      params: trainingCandidateParamsSchema,
      body: trainingCandidatePatchSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/candidates/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.remove.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Delete a candidate and its frame',
      params: trainingCandidateParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/candidates/submit',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.submit.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Submit verified candidates to the community training pool',
      body: trainingSubmitSchema,
    },
  });

  app.route({
    url: '/submissions',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.submissions.bind(controller),
    schema: {
      tags: ['Training'],
      summary: "List this account's community pool contributions",
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/submissions/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.removeSubmission.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Delete one contribution from the community pool',
      params: trainingSubmissionParamsSchema,
    },
  });

  app.route({
    url: '/settings',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.settings.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Training candidate collection settings',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/settings',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: controller.updateSettings.bind(controller),
    schema: {
      tags: ['Training'],
      summary: 'Update training candidate collection settings',
      body: trainingSettingsPatchSchema,
    },
  });
};
