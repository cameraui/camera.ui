import { BackupController } from '../controllers/backup.controller.js';
import { onlyAdminCanDoThisAction, onlySessionCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { downloadBackupSchema, patchBackupSchedulerSettingsSchema, scheduledBackupParamsSchema } from '../schemas/backup.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const BackupRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const backupController = new BackupController(app);

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/download',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.download.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Create and download a backup archive',
      body: downloadBackupSchema,
    },
  });

  app.route({
    url: '/restore',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction, onlySessionCanDoThisAction],
    handler: backupController.restore.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Restore a backup from an uploaded archive',
    },
  });

  app.route({
    url: '/scheduler',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.getScheduler.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Get backup scheduler settings and existing scheduled backups',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/scheduler',
    method: 'PATCH',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.patchScheduler.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Update backup scheduler settings',
      body: patchBackupSchedulerSettingsSchema,
    },
  });

  app.route({
    url: '/scheduler/run',
    method: 'POST',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.runScheduler.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Run a scheduled backup immediately',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/scheduler/backups/:filename',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.downloadScheduledBackup.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Download a scheduled backup archive',
      params: scheduledBackupParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/scheduler/backups/:filename',
    method: 'DELETE',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    handler: backupController.deleteScheduledBackup.bind(backupController),
    schema: {
      tags: ['Backup'],
      summary: 'Delete a scheduled backup archive',
      params: scheduledBackupParamsSchema,
    },
  });
};
