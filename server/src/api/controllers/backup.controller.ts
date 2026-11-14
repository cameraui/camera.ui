import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { pipeline, Transform } from 'node:stream';

import { inject } from '../../container.js';
import { RestoreError } from '../../services/config/restore.js';
import { attachmentHeader } from '../../utils/attachment.js';
import { BackupService } from '../services/backup.service.js';
import { MovePullService } from '../services/move-pull.service.js';
import { MoveService } from '../services/move.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DownloadManager } from '../../manager/downloadManager.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { BackupSchedulerService } from '../services/backupScheduler.service.js';
import type {
  AuthLoginRequest,
  BackupCreateRequest,
  BackupDownloadLink,
  BackupKeyBodyRequest,
  BackupKeyInfo,
  BackupRestoreRequest,
  BackupSchedulerPatchRequest,
  BackupStorage,
  ConfirmRestoreRequest,
  MoveCreateRequest,
  MovePeerRequest,
  MovePullRequest,
  RestorePluginRequest,
  RestoreUploadChunkRequest,
  RestoreUploadCreateRequest,
  RestoreUploadRequest,
  ScheduledBackupParamsRequest,
} from '../types/index.js';

const BACKUP_MIME_TYPE = 'application/gzip';

export class BackupController {
  private logger: LoggerService;
  private service: BackupService;
  private move: MoveService;
  private movePull: MovePullService;
  private scheduler: BackupSchedulerService;
  private downloadManager: DownloadManager;

  constructor(private app: FastifyInstance) {
    this.logger = inject('logger');
    this.scheduler = inject('backupScheduler');
    this.downloadManager = inject('proxy').downloadManager;
    this.service = new BackupService();
    this.move = new MoveService();
    this.movePull = new MovePullService();
  }

  public async download(req: FastifyRequest<AuthLoginRequest & BackupCreateRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const backup = await this.service.createBackup({ localStorage: req.body.localStorage, excludePaths: [this.scheduler.destinationRoot()], encrypt: true });
      const info = await stat(backup.backupFile).catch(async (error) => {
        await this.service.removeBackup(backup).catch(() => {});
        throw error;
      });

      const stream = createReadStream(backup.backupFile);
      // close also fires when the client aborts
      stream.once('close', () => {
        this.service.removeBackup(backup).catch((error) => this.logger.error(error));
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', attachmentHeader(backup.backupFileName));
      reply.header('Content-Length', info.size);

      return reply.send(stream);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async startJob(req: FastifyRequest<AuthLoginRequest & BackupCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const job = this.service.startJob({ localStorage: req.body.localStorage, excludePaths: [this.scheduler.destinationRoot()], encrypt: true }, (backup) =>
        this.serverDownload(backup),
      );
      return reply.code(202).send(job);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async getJob(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const job = this.service.currentJob();
    if (!job) {
      return reply.code(404).send({ statusCode: 404, message: 'No backup job' });
    }
    return reply.code(200).send(job);
  }

  public async getKey(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    return reply.code(200).send(this.service.keyInfo() satisfies BackupKeyInfo);
  }

  public async confirmKey(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    return reply.code(200).send((await this.service.confirmKey()) satisfies BackupKeyInfo);
  }

  public async downloadLink(req: FastifyRequest<AuthLoginRequest & BackupCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const backup = await this.service.createBackup({ localStorage: req.body.localStorage, excludePaths: [this.scheduler.destinationRoot()], encrypt: true });
      return reply.code(201).send(this.serverDownload(backup));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async restore(req: FastifyRequest<AuthLoginRequest & BackupRestoreRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      if (!req.isMultipart()) {
        throw new RestoreError('No multipart request!', 400);
      }

      const file = req.body.upload;
      if (!file) {
        throw new RestoreError('No file uploaded', 400);
      }

      const key = (req.body as { key?: { value?: unknown } }).key?.value;
      return reply.code(201).send(await this.service.stageUploadedFile(file, typeof key === 'string' ? key : undefined));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async createRestoreUpload(req: FastifyRequest<AuthLoginRequest & RestoreUploadCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(await this.service.createUpload(req.body.size, req.body.name));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async restoreUploadStatus(req: FastifyRequest<AuthLoginRequest & RestoreUploadRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.uploadStatus(req.params.id));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async appendRestoreUpload(req: FastifyRequest<AuthLoginRequest & RestoreUploadChunkRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const offset = Number(req.headers['upload-offset']);
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new RestoreError('The Upload-Offset header is missing.', 400);
      }
      if (!Buffer.isBuffer(req.body)) {
        throw new RestoreError('The part has no data.', 400);
      }

      return reply.code(200).send(await this.service.appendUpload(req.params.id, offset, req.body));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async completeRestoreUpload(req: FastifyRequest<AuthLoginRequest & RestoreUploadRequest & BackupKeyBodyRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(await this.service.completeUpload(req.params.id, req.body?.key));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async removeRestoreUpload(req: FastifyRequest<AuthLoginRequest & RestoreUploadRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.removeUpload(req.params.id);
      return reply.code(204).send();
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async restoreScheduledBackup(
    req: FastifyRequest<AuthLoginRequest & ScheduledBackupParamsRequest & BackupKeyBodyRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const filePath = await this.scheduler.resolveBackupFile(req.params.filename);
      if (!filePath) {
        throw new RestoreError('Backup not found', 404);
      }

      return reply.code(201).send(await this.service.stageArchive(filePath, req.body?.key));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async getRestore(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.overview());
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async restoreStatus(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const ticket = req.headers['x-restore-ticket'];
    const status = this.service.statusFor(typeof ticket === 'string' ? ticket : undefined);
    if (!status) {
      return reply.code(404).send({ statusCode: 404, message: 'No restore' });
    }
    return reply.code(200).send(status);
  }

  public async confirmRestore(req: FastifyRequest<AuthLoginRequest & ConfirmRestoreRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = this.service.confirmRestore(req.body?.mode);
      this.restartWhenReady(req.system);
      return reply.code(202).send(status);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async cancelRestore(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const status = await this.service.cancelRestore();
      if (status.kind === 'move') await this.movePull.release();
      return reply.code(200).send(status);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async undoRestore(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const started = await this.service.startUndo();
      this.restartWhenReady(req.system);
      return reply.code(202).send(started);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async retryRestorePlugin(req: FastifyRequest<AuthLoginRequest & RestorePluginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await inject('pluginManager').retryRestoredPlugin(req.body.name);
      return reply.code(200).send(this.service.overview().status);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async discardRestorePlugin(req: FastifyRequest<AuthLoginRequest & RestorePluginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(await this.service.discardPlugin(req.body.name));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async createMove(req: FastifyRequest<AuthLoginRequest & MoveCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(201).send(this.move.createOffer(req.body.hosts));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async moveStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const status = this.move.status();
    if (!status) {
      return reply.code(404).send({ statusCode: 404, message: 'No move' });
    }
    return reply.code(200).send(status);
  }

  public async movedAwayState(_req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    const state = inject('cameraui').movedAway ? this.move.status()?.state : undefined;
    if (!state) {
      return reply.code(404).send({ statusCode: 404, message: 'Not moved' });
    }
    return reply.code(200).send({ state });
  }

  public async cancelMove(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const restart = this.move.cancel();
      if (restart) this.restartWhenReady(req.system);
      return reply.code(200).send({ restart });
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePeerCheck(req: FastifyRequest<MovePeerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.move.peerStatus(req.body.secret));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePeerPrepare(req: FastifyRequest<MovePeerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { status, restart } = this.move.prepare(req.body.secret, req.ip.replace(/^::ffff:/, ''));
      if (restart) this.restartWhenReady(req.system);
      return reply.code(200).send(status);
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePeerArchive(req: FastifyRequest<MovePeerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const archive = this.move.openArchive(req.body.secret);
      let transferred = 0;
      const counter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          archive.progress((transferred += chunk.length));
          callback(null, chunk);
        },
      });
      reply.raw.once('close', () => archive.done(reply.raw.writableFinished || transferred === archive.size));

      reply.header('Content-Type', BACKUP_MIME_TYPE);
      reply.header('Content-Length', archive.size);
      return reply.send(pipeline(createReadStream(archive.path), counter, () => {}));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePeerReceived(req: FastifyRequest<MovePeerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.move.confirmReceived(req.body.secret));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePeerAbandon(req: FastifyRequest<MovePeerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      if (this.move.abandon(req.body.secret)) this.restartWhenReady(req.system);
      return reply.code(204).send();
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async startMovePull(req: FastifyRequest<AuthLoginRequest & MovePullRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(202).send(this.movePull.start(req.body.code, req.body.address));
    } catch (error) {
      return this.fail(reply, error);
    }
  }

  public async movePullStatus(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const status = this.movePull.status();
    if (!status) {
      return reply.code(404).send({ statusCode: 404, message: 'No move' });
    }
    return reply.code(200).send(status);
  }

  public async cancelMovePull(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.movePull.cancel();
      return reply.code(204).send();
    } catch (error) {
      return this.fail(reply, error);
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
        destination: this.scheduler.resolveDestination(settings),
        lastBackupAt: this.scheduler.lastBackupAt,
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
      reply.header('Content-Disposition', attachmentHeader(basename(filePath)));
      reply.header('Content-Length', info.size);

      return reply.send(createReadStream(filePath));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async scheduledBackupDownloadLink(req: FastifyRequest<AuthLoginRequest & ScheduledBackupParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const filePath = await this.scheduler.resolveBackupFile(req.params.filename);
      if (!filePath) {
        return reply.code(404).send({ statusCode: 404, message: 'Backup not found' });
      }

      const filename = basename(filePath);
      const link = this.downloadManager.createServerDownload({ filePath, filename, mimeType: BACKUP_MIME_TYPE });

      return reply.code(201).send({ url: link.url, filename, expiresAt: link.expiresAt } satisfies BackupDownloadLink);
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

  private serverDownload(backup: BackupStorage): BackupDownloadLink {
    const link = this.downloadManager.createServerDownload({
      filePath: backup.backupFile,
      filename: backup.backupFileName,
      mimeType: BACKUP_MIME_TYPE,
      release: () => this.service.removeBackup(backup),
    });
    return { url: link.url, filename: backup.backupFileName, expiresAt: link.expiresAt };
  }

  private restartWhenReady(system: FastifyRequest['system']): void {
    const cameraui = inject('cameraui');
    const restart = (): void => {
      if (cameraui.status === 'ready') system.close('restart');
      else setTimeout(restart, 1000);
    };
    setTimeout(restart, 500);
  }

  private fail(reply: FastifyReply, error: Error): FastifyReply {
    const statusCode = error instanceof RestoreError ? error.statusCode : 500;
    if (statusCode >= 500 && statusCode !== 507) {
      this.logger.error('Restore failed:', error);
    }
    const code = error instanceof RestoreError ? error.code : undefined;
    return reply.code(statusCode).send({ statusCode, message: error.message, ...(code && { code }) });
  }
}
