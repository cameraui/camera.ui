import { copy, pathExists, readJson, remove, writeJson } from 'fs-extra/esm';
import { lstat, mkdtemp, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { c, x } from 'tar';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { ROOT_KEY_FILENAME } from '../utils/constants.js';
import { moveFiles } from '../utils/moveFiles.js';
import { PluginsService } from './plugins.service.js';

import type { MultipartFile } from '@fastify/multipart';
import type { LoggerService } from '../../services/logger/index.js';
import type { BackupInfo, BackupStorage, PluginBackupInfo, UiLocalStorage } from '../types/index.js';

export class BackupService {
  private static activeOperation: 'backup' | 'restore' | null = null;

  private logger: LoggerService;
  private configService: ConfigService;
  private pluginsService: PluginsService;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');

    this.pluginsService = new PluginsService();
  }

  public async createBackup(localStorage: Partial<UiLocalStorage> = {}, extraExcludePaths: string[] = []): Promise<BackupStorage> {
    this.acquireLock('backup');

    try {
      return await this.runCreateBackup(localStorage, extraExcludePaths);
    } finally {
      BackupService.activeOperation = null;
    }
  }

  public async restoreBackup(file: MultipartFile): Promise<any> {
    this.acquireLock('restore');

    try {
      return await this.runRestoreBackup(file);
    } finally {
      BackupService.activeOperation = null;
    }
  }

  public async removeBackup(backup: BackupStorage): Promise<void> {
    await remove(backup.backupDirectory);
  }

  private acquireLock(operation: 'backup' | 'restore'): void {
    if (BackupService.activeOperation) {
      throw new Error(`A ${BackupService.activeOperation} operation is already in progress. Please wait for it to finish and try again.`);
    }
    BackupService.activeOperation = operation;
  }

  private async runCreateBackup(localStorage: Partial<UiLocalStorage>, extraExcludePaths: string[]): Promise<BackupStorage> {
    const timestamp = Date.now();
    const backupDirectory = await mkdtemp(join(tmpdir(), 'camera.ui-backup-'));
    const backupFileName = `camera.ui-backup-${timestamp}.tar.gz`;
    const backupFile = join(backupDirectory, backupFileName);

    this.logger.log('Creating new backup...');

    const plugins = this.pluginsService.listPlugins();
    const pluginsInfo: PluginBackupInfo[] = plugins.map((plugin): PluginBackupInfo => ({
      id: plugin.id,
      name: plugin.pluginName,
      version: plugin.info.installedVersion ?? 'latest',
    }));

    const excludePaths = [
      this.configService.INTERFACE_CACHE_PATH,
      this.configService.LOGS_PATH,
      this.configService.LOG_FILE,
      this.configService.PIDS_FILE,
      this.configService.REPORTS_FILE,
      this.configService.BACKUP_INFO_FILE,
      this.configService.config.ssl.caFile,
      this.configService.config.ssl.certFile,
      this.configService.config.ssl.keyFile,
      join(this.configService.STORAGE_PATH, ROOT_KEY_FILENAME),
      ...extraExcludePaths,
    ].map((path) => resolve(path));

    const isExcluded = (filePath: string): boolean => {
      const normalized = resolve(filePath);
      return excludePaths.some((excluded) => normalized === excluded || normalized.startsWith(excluded + sep));
    };

    await copy(this.configService.STORAGE_PATH, join(backupDirectory, 'storage'), {
      filter: async (filePath: string) => {
        if (isExcluded(filePath)) {
          return false;
        }

        try {
          const stat = await lstat(filePath);
          if (stat.isDirectory()) {
            if (await pathExists(join(filePath, '.backupignore'))) {
              return false;
            }
            return true;
          }
          return stat.isFile();
        } catch {
          return false;
        }
      },
    });

    const info: BackupInfo = {
      timestamp,
      platform: platform(),
      node: process.version,
      version: ConfigService.VERSION,
      plugins: pluginsInfo,
      localStorage: localStorage,
    };

    await writeJson(join(backupDirectory, 'camera.ui.backup.json'), info);

    await c(
      {
        portable: true,
        gzip: true,
        file: backupFile,
        cwd: backupDirectory,
      },
      ['storage', 'camera.ui.backup.json'],
    );

    this.logger.log('Backup was successfully created');

    return {
      backupDirectory,
      backupFile,
      backupFileName,
    };
  }

  private async runRestoreBackup(file: MultipartFile): Promise<any> {
    const backupDirectory = await mkdtemp(join(tmpdir(), 'cameraui-restore-'));
    const backupFile = join(backupDirectory, 'upload.tar.gz');
    const fileBuffer = await file.toBuffer();

    await writeFile(backupFile, fileBuffer);

    await x({
      cwd: backupDirectory,
      file: backupFile,
    });

    const infoPath = join(backupDirectory, 'camera.ui.backup.json');
    const storagePath = join(backupDirectory, 'storage');

    if (!(await pathExists(infoPath)) || !(await pathExists(storagePath))) {
      await remove(backupDirectory);
      throw new Error('Uploaded file is not a valid camera.ui Backup Archive.');
    }

    this.logger.attention('Starting backup restore...');

    const infoFile: BackupInfo = await readJson(infoPath);

    this.logger.debug('Backup Archive Information:', infoFile);

    await moveFiles(storagePath, this.configService.STORAGE_PATH, {
      overwrite: true,
    });

    await moveFiles(infoPath, join(this.configService.STORAGE_PATH, 'camera.ui.backup.json'), {
      overwrite: true,
    });

    await writeFile(this.configService.RESTORE_RESET_IDENTITY_FILE, '');

    await remove(backupDirectory);

    this.logger.log('Backup was successfully restored');

    return infoFile.localStorage;
  }
}
