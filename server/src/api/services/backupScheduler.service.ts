import { ensureDir, move, pathExists, remove } from 'fs-extra/esm';
import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { container } from 'tsyringe';

import { BackupService } from './backup.service.js';

import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBBackupSchedulerLastRun, DBBackupSchedulerSettings } from '../database/types.js';

export interface ScheduledBackupEntry {
  filename: string;
  size: number;
  timestamp: number;
}

const BACKUP_FILE_PATTERN = /^camera\.ui-backup-\d+\.tar\.gz$/;
const MAX_TIMER_CHUNK_MS = 12 * 60 * 60 * 1000;

export class BackupSchedulerService {
  private logger: LoggerService;
  private configService: ConfigService;
  private dbs: Database;
  private backupService: BackupService;

  private timer?: NodeJS.Timeout;
  private running = false;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.dbs = container.resolve<Database>('dbs');
    this.backupService = new BackupService();

    container.registerInstance('backupScheduler', this);
  }

  public get defaultDestination(): string {
    return join(this.configService.STORAGE_PATH, 'backups');
  }

  public getSettings(): DBBackupSchedulerSettings {
    const stored = this.dbs.settingsDB.get('settings')?.backupScheduler;
    return {
      enabled: stored?.enabled ?? false,
      interval: stored?.interval ?? 'daily',
      time: stored?.time ?? '03:00',
      weekday: stored?.weekday ?? 0,
      dayOfMonth: stored?.dayOfMonth ?? 1,
      retention: stored?.retention ?? 7,
      destinationPath: stored?.destinationPath ?? '',
      lastRun: stored?.lastRun,
    };
  }

  public async updateSettings(patch: Partial<DBBackupSchedulerSettings>): Promise<DBBackupSchedulerSettings> {
    if (patch.destinationPath && !isAbsolute(patch.destinationPath)) {
      throw new Error('Destination path must be absolute');
    }

    const merged: DBBackupSchedulerSettings = { ...this.getSettings(), ...patch };
    await this.persist(merged);
    this.arm();
    return merged;
  }

  public resolveDestination(settings = this.getSettings()): string {
    return settings.destinationPath ? resolve(settings.destinationPath) : this.defaultDestination;
  }

  public async listBackups(): Promise<ScheduledBackupEntry[]> {
    const destination = this.resolveDestination();
    if (!(await pathExists(destination))) return [];

    const entries: ScheduledBackupEntry[] = [];
    for (const file of await readdir(destination)) {
      if (!BACKUP_FILE_PATTERN.test(file)) continue;
      try {
        const info = await stat(join(destination, file));
        if (!info.isFile()) continue;
        entries.push({ filename: file, size: info.size, timestamp: info.mtimeMs });
      } catch {
        // ignore files disappearing mid-scan
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  public async resolveBackupFile(filename: string): Promise<string | null> {
    const name = basename(filename);
    if (!BACKUP_FILE_PATTERN.test(name)) return null;

    const filePath = join(this.resolveDestination(), name);
    return (await pathExists(filePath)) ? filePath : null;
  }

  public async deleteBackup(filename: string): Promise<boolean> {
    const filePath = await this.resolveBackupFile(filename);
    if (!filePath) return false;

    await remove(filePath);
    this.logger.log(`Scheduled backup deleted: ${basename(filePath)}`);
    return true;
  }

  public async runNow(): Promise<DBBackupSchedulerLastRun> {
    return this.run();
  }

  public start(): void {
    this.arm();
  }

  public stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private arm(): void {
    clearTimeout(this.timer);
    this.timer = undefined;

    const settings = this.getSettings();
    if (!settings.enabled) return;

    const next = this.computeNextRun(settings, new Date());
    const delay = next.getTime() - Date.now();
    this.logger.debug(`Next scheduled backup: ${next.toISOString()}`);

    this.timer = setTimeout(
      () => {
        if (Date.now() < next.getTime() - 1000) {
          this.arm();
          return;
        }
        void this.run()
          .catch(() => {
            // run() persists its own error state
          })
          .finally(() => this.arm());
      },
      Math.max(1000, Math.min(delay, MAX_TIMER_CHUNK_MS)),
    );
  }

  private computeNextRun(settings: DBBackupSchedulerSettings, from: Date): Date {
    const [hour, minute] = settings.time.split(':').map(Number);
    const next = new Date(from);
    next.setHours(hour, minute, 0, 0);

    if (settings.interval === 'daily') {
      if (next <= from) next.setDate(next.getDate() + 1);
    } else if (settings.interval === 'weekly') {
      next.setDate(next.getDate() + ((settings.weekday - next.getDay() + 7) % 7));
      if (next <= from) next.setDate(next.getDate() + 7);
    } else {
      next.setDate(settings.dayOfMonth);
      if (next <= from) next.setMonth(next.getMonth() + 1, settings.dayOfMonth);
    }

    return next;
  }

  private async run(): Promise<DBBackupSchedulerLastRun> {
    if (this.running) {
      throw new Error('A scheduled backup is already running');
    }

    this.running = true;
    const t0 = Date.now();
    const settings = this.getSettings();
    const destination = this.resolveDestination(settings);

    try {
      this.logger.log('Running scheduled backup...');
      await ensureDir(destination);

      // The destination may live inside the storage path — exclude it so the
      // backup can't recursively include earlier archives.
      const backup = await this.backupService.createBackup({}, [destination]);
      const targetFile = join(destination, backup.backupFileName);

      try {
        await move(backup.backupFile, targetFile, { overwrite: true });
      } finally {
        await this.backupService.removeBackup(backup);
      }

      await this.prune(destination, settings.retention);

      const lastRun: DBBackupSchedulerLastRun = {
        timestamp: Date.now(),
        status: 'success',
        filename: backup.backupFileName,
        durationMs: Date.now() - t0,
      };
      await this.persistLastRun(lastRun);
      this.logger.log(`Scheduled backup finished: ${backup.backupFileName} (${Math.round((Date.now() - t0) / 1000)}s)`);
      return lastRun;
    } catch (error: any) {
      const lastRun: DBBackupSchedulerLastRun = {
        timestamp: Date.now(),
        status: 'error',
        message: error.message,
        durationMs: Date.now() - t0,
      };
      await this.persistLastRun(lastRun);
      this.logger.error('Scheduled backup failed:', error);
      return lastRun;
    } finally {
      this.running = false;
    }
  }

  private async prune(destination: string, retention: number): Promise<void> {
    const backups = await this.listBackups();
    for (const backup of backups.slice(retention)) {
      try {
        await remove(join(destination, backup.filename));
        this.logger.debug(`Pruned old scheduled backup: ${backup.filename}`);
      } catch (error) {
        this.logger.warn(`Failed to prune scheduled backup ${backup.filename}:`, error);
      }
    }
  }

  private async persistLastRun(lastRun: DBBackupSchedulerLastRun): Promise<void> {
    await this.persist({ ...this.getSettings(), lastRun });
  }

  private async persist(settings: DBBackupSchedulerSettings): Promise<void> {
    const record = this.dbs.settingsDB.get('settings') ?? { version: '' };
    await this.dbs.settingsDB.put('settings', { ...record, backupScheduler: settings });
  }
}
