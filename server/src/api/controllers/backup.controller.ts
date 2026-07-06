import { createReadStream, readFile } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { container } from 'tsyringe';

import { BackupService } from '../services/backup.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { LoggerService } from '../../services/logger/index.js';
import type { AuthLoginRequest, BackupCreateRequest, BackupRestoreRequest, BackupSchedulerPatchRequest, ScheduledBackupParamsRequest } from '../types/index.js';
import type { BackupSchedulerService } from '../services/backupScheduler.service.js';

export class BackupController {
  private logger: LoggerService;
  private service: BackupService;
  private scheduler: BackupSchedulerService;

  constructor(private app: FastifyInstance) {
    this.logger = container.resolve<LoggerService>('logger');
    this.scheduler = container.resolve<BackupSchedulerService>('backupScheduler');
    this.service = new BackupService();
  }

  public async download(req: FastifyRequest<AuthLoginRequest & BackupCreateRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const backup = await this.service.createBackup(req.body.localStorage);

      readFile(backup.backupFile, (error, fileBuffer) => {
        if (error) {
          this.logger.error(error);
        }

        this.service.removeBackup(backup);
        reply.send(error ?? fileBuffer);
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=${backup.backupFileName}`);

      return reply;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async restore(req: FastifyRequest<AuthLoginRequest & BackupRestoreRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      if (!req.isMultipart()) {
        throw new Error('No multipart request!');
      }

      const file = req.body.upload;
      if (!file) {
        return reply.code(400).send({
          statusCode: 400,
          message: 'No file uploaded',
        });
      }

      const localStorage = await this.service.restoreBackup(file);

      process.send?.('restored');

      return reply.code(201).send(localStorage);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getScheduler(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const settings = this.scheduler.getSettings();
      const backups = await this.scheduler.listBackups();

      return reply.code(200).send({
        settings,
        backups,
        defaultDestination: this.scheduler.defaultDestination,
      });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async patchScheduler(req: FastifyRequest<AuthLoginRequest & BackupSchedulerPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const settings = await this.scheduler.updateSettings(req.body);
      return reply.code(200).send(settings);
    } catch (error: any) {
      return reply.code(400).send({ statusCode: 400, message: error.message });
    }
  }

  public async runScheduler(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const lastRun = await this.scheduler.runNow();
      return reply.code(lastRun.status === 'success' ? 201 : 500).send(lastRun);
    } catch (error: any) {
      return reply.code(409).send({ statusCode: 409, message: error.message });
    }
  }

  public async downloadScheduledBackup(req: FastifyRequest<AuthLoginRequest & ScheduledBackupParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const filePath = await this.scheduler.resolveBackupFile(req.params.filename);
      if (!filePath) {
        return reply.code(404).send({ statusCode: 404, message: 'Backup not found' });
      }

      const info = await stat(filePath);
      reply.header('Content-Type', 'application/gzip');
      reply.header('Content-Disposition', `attachment; filename="${basename(filePath)}"`);
      reply.header('Content-Length', info.size);

      return reply.send(createReadStream(filePath));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async deleteScheduledBackup(req: FastifyRequest<AuthLoginRequest & ScheduledBackupParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const deleted = await this.scheduler.deleteBackup(req.params.filename);
      if (!deleted) {
        return reply.code(404).send({ statusCode: 404, message: 'Backup not found' });
      }
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }
}
