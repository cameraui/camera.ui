import { Severity } from '@camera.ui/sdk';
import { ensureDir, move, pathExists, remove } from 'fs-extra/esm';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';

import { inject, provide, tryInject } from '../../container.js';
import { t } from '../../i18n/index.js';
import { SystemNotificationTypeId } from '../../manager/types.js';
import { backupKeyId, parseBackupKey, readArchiveLayout } from '../../services/config/backup-archive.js';
import { BACKUP_IGNORE_FILE, removeExpiredRestoreData } from '../../services/config/restore.js';
import { BackupService } from './backup.service.js';

import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBBackupSchedulerLastRun, DBBackupSchedulerSettings } from '../database/types.js';

export interface ScheduledBackupEntry {
  filename: string;
  size: number;
  timestamp: number;
  encrypted: boolean;
  ownKey?: boolean;
  version?: string;
}

const BACKUP_FILE_PATTERN = /^camera\.ui-backup-\d+\.(tar\.gz|cuibackup)$/;
const MAX_TIMER_CHUNK_MS = 12 * 60 * 60 * 1000;
const RESTORE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const CATCH_UP_DELAY_MS = 2 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_DAYS = { daily: 1, weekly: 7, monthly: 31 } as const;

export class BackupSchedulerService {
  private logger: LoggerService;
  private configService: ConfigService;
  private dbs: Database;
  private backupService: BackupService;

  private timer?: NodeJS.Timeout;
  private catchUpTimer?: NodeJS.Timeout;
  private restoreCleanupTimer?: NodeJS.Timeout;
  private running = false;

  constructor() {
    provide('backupScheduler', this);

    this.logger = inject('logger');
    this.configService = inject('configService');
    this.dbs = inject('dbs');
    this.backupService = new BackupService();
  }

  public get defaultDestination(): string {
    return this.configService.DEFAULT_BACKUPS_PATH;
  }

  public get lastBackupAt(): number | undefined {
    return this.dbs.settingsDB.get('settings')?.lastBackupAt;
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
    if (merged.destinationPath) await this.markDestination(this.destinationRoot(merged));
    await this.persist(merged);
    this.arm();
    return merged;
  }

  public destinationRoot(settings = this.getSettings()): string {
    return settings.destinationPath ? resolve(settings.destinationPath) : this.defaultDestination;
  }

  public resolveDestination(settings = this.getSettings()): string {
    const root = this.destinationRoot(settings);
    const instanceId = this.dbs.settingsDB.get('settings')?.instanceId;
    return settings.destinationPath && instanceId ? join(root, instanceId) : root;
  }

  public async listBackups(): Promise<ScheduledBackupEntry[]> {
    return this.scan(this.searchFolders());
  }

  public async resolveBackupFile(filename: string): Promise<string | null> {
    const name = basename(filename);
    if (!BACKUP_FILE_PATTERN.test(name)) return null;

    for (const folder of this.searchFolders()) {
      const filePath = join(folder, name);
      if (await pathExists(filePath)) return filePath;
    }
    return null;
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
    this.backupService.removeStaleBackupFolders().catch(() => {});
    this.arm();
    this.catchUp();

    clearInterval(this.restoreCleanupTimer);
    this.restoreCleanupTimer = setInterval(() => this.removeExpiredRestoreData(), RESTORE_CLEANUP_INTERVAL_MS);
    this.restoreCleanupTimer.unref();
  }

  public stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    clearTimeout(this.catchUpTimer);
    this.catchUpTimer = undefined;
    clearInterval(this.restoreCleanupTimer);
    this.restoreCleanupTimer = undefined;
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
        this.run()
          .catch(() => {
            // run() persists its own error state
          })
          .finally(() => this.arm());
      },
      Math.max(1000, Math.min(delay, MAX_TIMER_CHUNK_MS)),
    );
  }

  private searchFolders(): string[] {
    const destination = this.resolveDestination();
    const root = this.destinationRoot();
    return destination === root ? [root] : [destination, root];
  }

  private async scan(folders: string[]): Promise<ScheduledBackupEntry[]> {
    const ownKey = parseBackupKey(this.configService.SECRETS.backupKey);
    const ownKeyId = ownKey ? backupKeyId(ownKey) : undefined;

    const entries: ScheduledBackupEntry[] = [];
    for (const folder of folders) {
      for (const file of await readdir(folder).catch(() => [])) {
        if (!BACKUP_FILE_PATTERN.test(file) || entries.some((entry) => entry.filename === file)) continue;
        try {
          const path = join(folder, file);
          const info = await stat(path);
          if (!info.isFile()) continue;
          const { header } = await readArchiveLayout(path).catch(() => ({ header: null }));
          entries.push({
            filename: file,
            size: info.size,
            timestamp: header?.createdAt ?? info.mtimeMs,
            encrypted: !!header,
            ownKey: header ? header.keyId === ownKeyId : undefined,
            version: header?.version,
          });
        } catch {
          // ignore files disappearing mid-scan
        }
      }
    }

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }

  private catchUp(): void {
    const settings = this.getSettings();
    const due = settings.enabled && settings.lastRun ? this.lastDueRun(settings, new Date()) : undefined;
    if (!due || settings.lastRun!.timestamp >= due.getTime()) return;

    this.logger.log(`The scheduled backup of ${due.toLocaleString()} was missed, it runs in a few minutes`);
    clearTimeout(this.catchUpTimer);
    this.catchUpTimer = setTimeout(() => {
      this.run().catch(() => {});
    }, CATCH_UP_DELAY_MS);
    this.catchUpTimer.unref();
  }

  private lastDueRun(settings: DBBackupSchedulerSettings, now: Date): Date | undefined {
    let due: Date | undefined;
    for (
      let slot = this.computeNextRun(settings, new Date(now.getTime() - INTERVAL_DAYS[settings.interval] * DAY_MS));
      slot <= now;
      slot = this.computeNextRun(settings, slot)
    ) {
      due = slot;
    }
    return due;
  }

  private async prepareDestination(settings: DBBackupSchedulerSettings, destination: string): Promise<void> {
    if (settings.destinationPath) {
      const root = this.destinationRoot(settings);
      if (!(await pathExists(root))) {
        throw new Error(`The backup folder ${root} does not exist. Check that the drive is mounted.`);
      }
      const marked = await pathExists(join(root, BACKUP_IGNORE_FILE));
      if (!marked && (await readdir(root)).length === 0) {
        throw new Error(
          `The backup folder ${root} is empty and has no camera.ui marker. Check that the drive is mounted, or save the folder in the backup settings again.`,
        );
      }
      await this.markDestination(root);
    }

    await ensureDir(destination);
    // keeps the archives out of backups and in place when a restore is applied
    await writeFile(join(destination, BACKUP_IGNORE_FILE), '', { flag: 'a' });
  }

  private async markDestination(root: string): Promise<void> {
    try {
      await ensureDir(root);
      await writeFile(join(root, BACKUP_IGNORE_FILE), '', { flag: 'a' });
    } catch (error) {
      throw new Error(`The backup folder ${root} cannot be written: ${error.message}`, { cause: error });
    }
  }

  private notifyFailed(message: string): void {
    // without the proxy the backup page still shows the error
    tryInject('proxy')
      ?.notificationManager.notify({
        source: { kind: 'system', id: SystemNotificationTypeId.BackupFailed },
        notification: {
          title: t('backup.failed_title'),
          body: message,
          severity: Severity.Warn,
          tag: SystemNotificationTypeId.BackupFailed,
          deepLink: '/settings/backup',
          adminOnly: true,
        },
      })
      .catch(() => {});
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
      await this.prepareDestination(settings, destination);

      const backup = await this.backupService.createBackup({ excludePaths: [this.destinationRoot(settings)], encrypt: true, source: 'schedule' });
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
      this.notifyFailed(error.message);
      return lastRun;
    } finally {
      this.running = false;
    }
  }

  private async prune(destination: string, retention: number): Promise<void> {
    const backups = await this.scan([destination]);
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
    await this.dbs.commit(this.dbs.settingsDB, 'settings', (current) => ({ ...(current ?? { version: '' }), backupScheduler: settings }));
  }

  private removeExpiredRestoreData(): void {
    try {
      removeExpiredRestoreData(this.configService.restorePaths);
    } catch (error) {
      this.logger.warn('Failed to remove expired restore data:', error);
    }
  }
}
