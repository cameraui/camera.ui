import { IS_DEV, IS_ELECTRON } from '@camera.ui/common/utils';
import { ensureDir, move, pathExists, readJson, remove, writeJson } from 'fs-extra/esm';
import { fork } from 'node:child_process';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { appendFile, lstat, mkdtemp, open, readdir, stat, statfs, utimes, writeFile } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { c, x } from 'tar';

import { inject, tryInject } from '../../container.js';
import {
  BackupArchiveError,
  backupKeyId,
  createArchiveDecryptor,
  createArchiveEncryptor,
  encodeArchiveHeader,
  ENCRYPTED_BACKUP_EXTENSION,
  newArchiveHeader,
  parseBackupKey,
  readArchiveLayout,
} from '../../services/config/backup-archive.js';
import { ConfigService } from '../../services/config/index.js';
import { alignStagedPlatformValues } from '../../services/config/platform-values.js';
import { describeRestoredPlugins } from '../../services/config/restore-plugins.js';
import { browseCameraUi } from '../../services/mdns/browse.js';
import {
  assertRestorableVersion,
  BACKUP_IGNORE_FILE,
  dropsIngressAccount,
  isIngressAccount,
  isRestoreFinished,
  readRestoreJournal,
  readRestorePrevious,
  RESTORE_STATUS_TTL_MS,
  RESTORE_UPLOAD_CHUNK_SIZE,
  RestoreError,
  restoreStatus,
  updateRestoreJournal,
  writeRestoreJournal,
} from '../../services/config/restore.js';
import { restoreSummaryPath } from '../../utils/path.js';
import { PluginsService } from './plugins.service.js';

import type { MultipartFile } from '@fastify/multipart';
import type { Stats } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import type { RestoreArchiveFacts } from '../../services/config/restore-summary.js';
import type { LoggerService } from '../../services/logger/index.js';
import type {
  BackupDownloadLink,
  BackupExcludedFolder,
  BackupInfo,
  BackupJob,
  BackupJobPhase,
  BackupJobSource,
  BackupKeyInfo,
  BackupStorage,
  MovePeer,
  PluginBackupInfo,
  RestoreJournal,
  RestoreKind,
  RestoreMode,
  RestoreNotice,
  RestoreOverview,
  RestoreStarted,
  RestoreStatus,
  RestoreSummary,
  RestoreUpload,
  UiLocalStorage,
} from '../types/index.js';

export type UploadedBackupFile = MultipartFile & { filepath?: string };

const TEMP_FOLDER_PREFIX = 'camera.ui-backup-';
const TEMP_FOLDER_SUFFIX = /^[A-Za-z0-9]{6}$/;
const STALE_TEMP_FOLDER_MS = 60 * 60 * 1000;
const PACKING_RESERVE_BYTES = 512 * 1024 * 1024;
const PACKING_ATTEMPTS = 3;
const SUMMARY_TIMEOUT_MS = 60_000;
const SOURCE_BROWSE_MS = 2000;
const JOB_EMIT_INTERVAL_MS = 500;
const IGNORED_MEASURE_MS = 3000;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0');
const SQLITE_SIDE_FILES = ['-wal', '-shm', '-journal'];
const SQLITE_BUSY_TIMEOUT_MS = 5000;

export interface BackupOptions {
  localStorage?: Partial<UiLocalStorage>;
  excludePaths?: string[];
  encrypt?: boolean;
  source?: BackupJobSource;
}

type BackupProgress = (phase: BackupJobPhase, done: number, total: number) => void;

interface BackupContents {
  files: Map<string, number>;
  sqlite: string[];
  ignored: string[];
  skipped?: Set<string>;
}

interface PackTarget {
  file: string;
  infoFile: string;
  include: (path: string, stats: Stats) => boolean;
  contents: BackupContents;
  snapshots: Map<string, string>;
  size: number;
  timestamp: number;
  key: Buffer | null;
}

interface UploadMeta {
  size: number;
  name: string;
  createdAt: number;
}

export class BackupService {
  private static activeOperation: 'backup' | 'restore' | null = null;
  private static uploadsInFlight = new Set<string>();
  private static job: BackupJob | null = null;
  private static jobEmittedAt = 0;

  private logger: LoggerService;
  private configService: ConfigService;
  private pluginsService: PluginsService;

  constructor() {
    this.logger = inject('logger');
    this.configService = inject('configService');

    this.pluginsService = new PluginsService();
  }

  public async createBackup(options: BackupOptions = {}): Promise<BackupStorage> {
    this.acquireLock('backup');
    return this.track(options);
  }

  public startJob(options: BackupOptions, deliver: (backup: BackupStorage) => BackupDownloadLink): BackupJob {
    this.acquireLock('backup');
    this.track(options, deliver).catch(() => {});
    return BackupService.job!;
  }

  public currentJob(): BackupJob | null {
    return BackupService.job;
  }

  public keyInfo(): BackupKeyInfo {
    const settings = inject('dbs').settingsDB.get('settings');
    return { key: this.configService.SECRETS.backupKey, confirmedAt: settings?.backupKeyConfirmedAt };
  }

  public async confirmKey(): Promise<BackupKeyInfo> {
    const dbs = inject('dbs');
    const confirmedAt = Date.now();
    await dbs.commit(dbs.settingsDB, 'settings', (current) => current && { ...current, backupKeyConfirmedAt: confirmedAt });
    return { key: this.configService.SECRETS.backupKey, confirmedAt };
  }

  public async stageUploadedFile(file: UploadedBackupFile, key?: string): Promise<RestoreStarted> {
    const directory = await mkdtemp(join(tmpdir(), 'cameraui-restore-'));
    const archive = join(directory, 'upload.tar.gz');

    try {
      if (file.filepath) {
        await move(file.filepath, archive, { overwrite: true });
      } else {
        await writeFile(archive, await file.toBuffer());
      }
      return await this.stage(archive, 'upload', undefined, key);
    } finally {
      await remove(directory).catch(() => {});
      if (file.filepath) await remove(dirname(file.filepath)).catch(() => {});
    }
  }

  public async stageArchive(archive: string, key?: string): Promise<RestoreStarted> {
    return this.stage(archive, 'archive', undefined, key);
  }

  public async stageMove(archive: string, peer: MovePeer): Promise<RestoreStarted> {
    return this.stage(archive, 'move', peer);
  }

  public async createUpload(size: number, name: string): Promise<RestoreUpload> {
    const id = randomBytes(16).toString('hex');
    await ensureDir(this.configService.RESTORE_UPLOADS_PATH);
    await writeJson(this.uploadMetaPath(id), { size, name, createdAt: Date.now() } satisfies UploadMeta);
    await writeFile(this.uploadPartPath(id), '');
    return { id, size, received: 0, chunkSize: RESTORE_UPLOAD_CHUNK_SIZE };
  }

  public async uploadStatus(id: string): Promise<RestoreUpload> {
    const meta = await this.readUploadMeta(id);
    const { size: received } = await stat(this.uploadPartPath(id));
    return { id, size: meta.size, received, chunkSize: RESTORE_UPLOAD_CHUNK_SIZE };
  }

  public async appendUpload(id: string, offset: number, chunk: Buffer): Promise<RestoreUpload> {
    if (BackupService.uploadsInFlight.has(id)) {
      throw new RestoreError('This upload is already receiving a part.', 409);
    }
    BackupService.uploadsInFlight.add(id);

    try {
      const upload = await this.uploadStatus(id);
      if (offset !== upload.received) {
        throw new RestoreError(`The upload continues at byte ${upload.received}.`, 409);
      }
      if (upload.received + chunk.length > upload.size) {
        throw new RestoreError('The part goes beyond the announced size.', 413);
      }

      await appendFile(this.uploadPartPath(id), chunk);
      // both upload files expire by mtime
      const now = new Date();
      await utimes(this.uploadMetaPath(id), now, now);
      return { ...upload, received: upload.received + chunk.length };
    } finally {
      BackupService.uploadsInFlight.delete(id);
    }
  }

  public async completeUpload(id: string, key?: string): Promise<RestoreStarted> {
    const upload = await this.uploadStatus(id);
    if (upload.received !== upload.size) {
      throw new RestoreError(`The upload is not complete, ${upload.received} of ${upload.size} bytes arrived.`, 409);
    }

    try {
      const started = await this.stage(this.uploadPartPath(id), 'upload', undefined, key);
      await this.removeUpload(id);
      return started;
    } catch (error) {
      // the page asks for the key and retries the same upload
      if (!(error instanceof RestoreError && error.code)) await this.removeUpload(id);
      throw error;
    }
  }

  public async removeUpload(id: string): Promise<void> {
    await remove(this.uploadPartPath(id));
    await remove(this.uploadMetaPath(id));
  }

  public overview(): RestoreOverview {
    const journal = readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE);
    return {
      status: journal ? restoreStatus(journal) : null,
      previous: readRestorePrevious(this.configService.restorePaths),
    };
  }

  public statusFor(ticket: string | undefined): RestoreStatus | RestoreNotice | null {
    const journal = readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE);
    if (!journal) return null;
    if (isRestoreFinished(journal) && Date.now() - (journal.finishedAt ?? journal.updatedAt) > RESTORE_STATUS_TTL_MS) return null;

    if (ticket && this.ticketMatches(journal, ticket)) {
      return restoreStatus(journal);
    }

    const { id, kind, state, updatedAt, finishedAt } = journal;
    return { id, kind, state, updatedAt, finishedAt };
  }

  public confirmRestore(mode?: RestoreMode): RestoreStatus {
    this.acquireLock('restore');

    try {
      this.assertRestoreWaiting();
      const updated = updateRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, (current) => {
        current.state = 'confirmed';
        current.mode = mode ?? current.summary?.suggestedMode ?? 'copy';
        // from here the old server must stay stopped
        delete current.movePeer;
      });
      this.logger.log(`Restore confirmed as a ${updated!.mode}, restarting to apply it`);
      return restoreStatus(updated!);
    } finally {
      BackupService.activeOperation = null;
    }
  }

  public async cancelRestore(): Promise<RestoreStatus> {
    this.acquireLock('restore');

    try {
      this.assertRestoreWaiting();
      await remove(this.configService.RESTORE_STAGING_PATH);
      const updated = updateRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, (current) => {
        current.state = 'cancelled';
        current.finishedAt = Date.now();
      });
      this.logger.log('Restore cancelled');
      return restoreStatus(updated!);
    } finally {
      BackupService.activeOperation = null;
    }
  }

  public async startUndo(): Promise<RestoreStarted> {
    this.acquireLock('restore');

    try {
      this.assertNoRestoreRunning();

      const previous = readRestorePrevious(this.configService.restorePaths);
      if (!previous) {
        throw new RestoreError('There is no earlier state to go back to.', 409);
      }

      const facts = await this.readArchiveFacts(this.configService.RESTORE_PREVIOUS_PATH);
      const summary = { ...this.summarize({ version: ConfigService.VERSION, platform: platform(), timestamp: previous.createdAt }, facts), cloud: facts?.cloud ?? false };

      const { ticket, journal } = this.newJournal('undo', summary, []);
      journal.state = 'confirmed';
      writeRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, journal);

      this.logger.log('Undo of the last restore confirmed, restarting to apply it');
      return { ticket, status: restoreStatus(journal), localStorage: {} };
    } finally {
      BackupService.activeOperation = null;
    }
  }

  public async discardPlugin(name: string): Promise<RestoreStatus> {
    const journal = readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE);
    const plugin = journal?.plugins.find((entry) => entry.name === name);
    if (!journal || !plugin || plugin.state === 'installed') {
      throw new RestoreError(`${name} is not waiting to be installed.`, 409);
    }

    const info: BackupInfo | null = await readJson(this.configService.BACKUP_INFO_FILE).catch(() => null);
    if (info) {
      const installed = new Set(journal.plugins.filter((entry) => entry.state === 'installed').map((entry) => entry.name));
      info.plugins = info.plugins.filter((entry) => entry.name !== name);
      if (info.plugins.every((entry) => installed.has(entry.name))) await remove(this.configService.BACKUP_INFO_FILE);
      else await writeJson(this.configService.BACKUP_INFO_FILE, info);
    }

    const updated = updateRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, (current) => {
      for (const entry of current.plugins) {
        if (entry.name === name) entry.state = 'discarded';
      }
      if (current.state === 'done-with-problems' && !current.plugins.some((entry) => entry.state === 'failed' || entry.state === 'pending')) {
        current.state = 'done';
      }
    });

    this.logger.log(`Plugin ${name} from the backup is no longer installed on start`);
    return restoreStatus(updated!);
  }

  public async removeBackup(backup: BackupStorage): Promise<void> {
    await remove(backup.backupDirectory);
  }

  public async removeStaleBackupFolders(): Promise<void> {
    const root = this.configService.BACKUP_PACKING_PATH;
    const cutoff = Date.now() - STALE_TEMP_FOLDER_MS;
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);

    for (const entry of entries) {
      const suffix = entry.name.slice(TEMP_FOLDER_PREFIX.length);
      if (!entry.isDirectory() || !entry.name.startsWith(TEMP_FOLDER_PREFIX) || !TEMP_FOLDER_SUFFIX.test(suffix)) continue;

      const folder = join(root, entry.name);
      if ((await this.lastChange(folder)) > cutoff) continue;

      try {
        await remove(folder);
        this.logger.debug(`Removed leftover backup folder ${folder}`);
      } catch (error) {
        this.logger.warn(`Failed to remove leftover backup folder ${folder}`, error);
      }
    }
  }

  private async track(options: BackupOptions, deliver?: (backup: BackupStorage) => BackupDownloadLink): Promise<BackupStorage> {
    const job: BackupJob = { id: randomUUID(), source: options.source ?? 'manual', state: 'running', phase: 'snapshot', done: 0, total: 0, startedAt: Date.now() };
    BackupService.job = job;
    this.emitJob(true);

    try {
      const backup = await this.runCreateBackup(options, (phase, done, total) => {
        Object.assign(job, { phase, done, total });
        this.emitJob();
      });
      job.size = (await stat(backup.backupFile)).size;
      job.download = deliver?.(backup);
      job.state = 'done';
      if (job.source !== 'move') await this.recordBackup(job.startedAt);
      return backup;
    } catch (error) {
      job.state = 'failed';
      job.error = error.message;
      throw error;
    } finally {
      job.finishedAt = Date.now();
      BackupService.activeOperation = null;
      this.emitJob(true);
    }
  }

  private async recordBackup(at: number): Promise<void> {
    const dbs = tryInject('dbs');
    if (!dbs) return;
    await dbs.commit(dbs.settingsDB, 'settings', (current) => current && { ...current, lastBackupAt: at }).catch(() => {});
  }

  private emitJob(force = false): void {
    const now = Date.now();
    if (!force && now - BackupService.jobEmittedAt < JOB_EMIT_INTERVAL_MS) return;
    BackupService.jobEmittedAt = now;
    const socketService = tryInject('socketService');
    if (socketService && BackupService.job) {
      // the link opens the archive without a session, keep it out of the broadcast
      const { download: _download, ...job } = BackupService.job;
      socketService.io.of('/server').emit('backup-job', job);
    }
  }

  private acquireLock(operation: 'backup' | 'restore'): void {
    if (BackupService.activeOperation) {
      throw new RestoreError(`A ${BackupService.activeOperation} operation is already in progress. Please wait for it to finish and try again.`, 409);
    }
    BackupService.activeOperation = operation;
  }

  private async runCreateBackup(options: BackupOptions, progress: BackupProgress): Promise<BackupStorage> {
    const timestamp = Date.now();
    const key = options.encrypt ? parseBackupKey(this.configService.SECRETS.backupKey) : null;
    if (options.encrypt && !key) throw new Error('The backup key of this server is missing.');

    await ensureDir(this.configService.BACKUP_PACKING_PATH);
    const backupDirectory = await mkdtemp(join(this.configService.BACKUP_PACKING_PATH, TEMP_FOLDER_PREFIX));
    const backupFileName = `camera.ui-backup-${timestamp}${key ? ENCRYPTED_BACKUP_EXTENSION : '.tar.gz'}`;
    const backupFile = join(backupDirectory, backupFileName);

    this.logger.log('Creating new backup...');

    try {
      const plugins = this.pluginsService.listPlugins();
      const pluginsInfo: PluginBackupInfo[] = plugins.map((plugin): PluginBackupInfo => ({
        id: plugin.id,
        name: plugin.pluginName,
        version: plugin.info.installedVersion ?? 'latest',
        ...(plugin.info.local && { local: true }),
      }));

      const excludePaths = [...this.configService.BACKUP_EXCLUDED_PATHS, this.configService.BACKUP_INFO_FILE, ...(options.excludePaths ?? [])].map((path) =>
        resolve(path),
      );
      const excluded = (path: string): boolean => excludePaths.some((entry) => path === entry || path.startsWith(entry + sep));
      const include = (path: string, stats: Stats): boolean => {
        if (excluded(path)) return false;
        if (stats.isDirectory()) return !existsSync(join(path, BACKUP_IGNORE_FILE));
        return stats.isFile();
      };

      const contents: BackupContents = { files: new Map(), sqlite: [], ignored: [] };
      await this.collect(resolve(this.configService.STORAGE_PATH), include, excluded, contents);
      const snapshots = await this.takeSnapshots(join(backupDirectory, 'snapshot'), contents, progress);
      const size = [...contents.files.values()].reduce((sum, bytes) => sum + bytes, 0);

      await this.assertPackingSpace(this.configService.BACKUP_PACKING_PATH, size);

      const info: BackupInfo = {
        timestamp,
        platform: platform(),
        node: process.version,
        version: ConfigService.VERSION,
        plugins: pluginsInfo,
        localStorage: options.localStorage ?? {},
        environment: this.configService.ENVIRONMENT_SETTINGS,
        ingress: !!this.configService.INGRESS_TRUST_IP,
        excluded: await this.measureIgnored(contents.ignored),
      };
      const infoFile = join(backupDirectory, 'camera.ui.backup.json');
      await writeJson(infoFile, info);

      await this.packBackup({ file: backupFile, infoFile, include, contents, snapshots, size, timestamp, key }, progress);
    } catch (error) {
      await remove(backupDirectory).catch(() => {});
      throw error;
    }

    this.logger.log('Backup was successfully created');

    return {
      backupDirectory,
      backupFile,
      backupFileName,
    };
  }

  private async packBackup(target: PackTarget, progress: BackupProgress): Promise<void> {
    const storage = resolve(this.configService.STORAGE_PATH);
    const names = await readdir(storage);
    const { file, infoFile, include, contents, snapshots, size, key } = target;
    const replaced = contents.skipped ?? new Set<string>();
    const snapshotPaths = new Map([...snapshots].map(([live, copy]) => [copy, relative(storage, live).split(sep).join('/')]));

    for (let attempt = 1; ; attempt++) {
      let done = 0;
      try {
        const pack = c(
          {
            portable: true,
            gzip: true,
            cwd: storage,
            prefix: 'storage',
            filter: (path, entry) => {
              if (path === infoFile || snapshotPaths.has(path)) return true;
              const absolute = resolve(storage, path);
              return !replaced.has(absolute) && include(absolute, entry as Stats);
            },
            onWriteEntry: (entry) => {
              done += contents.files.get(entry.absolute) ?? 0;
              progress('packing', done, size);
              if (entry.absolute === infoFile) {
                entry.prefix = undefined;
                entry.path = basename(infoFile);
              }
              const snapshot = snapshotPaths.get(entry.absolute);
              if (snapshot) {
                entry.prefix = undefined;
                entry.path = `storage/${snapshot}`;
              }
            },
          },
          [...names, infoFile, ...snapshotPaths.keys()],
        );

        if (key) {
          const header = newArchiveHeader(key, { createdAt: target.timestamp, version: ConfigService.VERSION, size });
          const headerBytes = encodeArchiveHeader(header);
          await writeFile(file, headerBytes);
          await pipeline(pack, createArchiveEncryptor(key, header, headerBytes), createWriteStream(file, { flags: 'a' }));
        } else {
          await pipeline(pack, createWriteStream(file));
        }
        return;
      } catch (error) {
        await remove(file).catch(() => {});
        if (error.code === 'ENOSPC') throw new Error(`The disk ran full while the backup was packed in ${this.configService.BACKUP_PACKING_PATH}.`);
        if (attempt === PACKING_ATTEMPTS || (error.code !== 'EOF' && error.code !== 'ENOENT')) throw error;
        this.logger.debug(`${error.path ?? 'A file'} changed while the backup was packed, packing again`);
      }
    }
  }

  private async collect(path: string, include: (path: string, stats: Stats) => boolean, excluded: (path: string) => boolean, contents: BackupContents): Promise<void> {
    for (const name of await readdir(path).catch(() => [])) {
      const child = join(path, name);
      const stats = await lstat(child).catch(() => null);
      if (!stats) continue;

      if (!include(child, stats)) {
        if (stats.isDirectory() && !excluded(child) && child !== resolve(this.configService.DEFAULT_BACKUPS_PATH)) contents.ignored.push(child);
        continue;
      }
      if (stats.isDirectory()) {
        await this.collect(child, include, excluded, contents);
        continue;
      }

      contents.files.set(child, stats.size);
      if (stats.size >= SQLITE_HEADER.length && (await isSqlite(child))) contents.sqlite.push(child);
    }
  }

  private async takeSnapshots(directory: string, contents: BackupContents, progress: BackupProgress): Promise<Map<string, string>> {
    const storage = resolve(this.configService.STORAGE_PATH);
    const snapshots = new Map<string, string>();
    const skipped = new Set<string>();
    const total = contents.sqlite.length + 1;
    progress('snapshot', 0, total);

    const database = this.configService.DATABASE_PATH && resolve(this.configService.DATABASE_PATH);
    const liveData = database && join(database, 'data.mdb');
    const dbs = tryInject('dbs');
    if (liveData && contents.files.has(liveData) && dbs) {
      const target = join(directory, relative(storage, database));
      try {
        await dbs.snapshot(target);
        snapshots.set(liveData, join(target, 'data.mdb'));
        skipped.add(join(database, 'lock.mdb'));
      } catch (error) {
        this.logger.warn('Could not take a snapshot of the database, copying it as it is', error);
      }
    }
    progress('snapshot', 1, total);

    for (const [index, file] of contents.sqlite.entries()) {
      const target = join(directory, relative(storage, file));
      if (await snapshotSqlite(file, target)) {
        snapshots.set(file, target);
        for (const suffix of SQLITE_SIDE_FILES) skipped.add(file + suffix);
      } else {
        this.logger.debug(`Could not take a snapshot of ${file}, copying it as it is`);
      }
      progress('snapshot', index + 2, total);
    }

    for (const [live, copy] of snapshots) {
      skipped.add(live);
      contents.files.delete(live);
      contents.files.set(copy, (await stat(copy)).size);
    }
    for (const path of skipped) contents.files.delete(path);
    contents.skipped = skipped;
    return snapshots;
  }

  private async measureIgnored(folders: string[]): Promise<BackupExcludedFolder[]> {
    const storage = resolve(this.configService.STORAGE_PATH);
    const deadline = Date.now() + IGNORED_MEASURE_MS;
    const result: BackupExcludedFolder[] = [];
    for (const folder of folders) {
      result.push({ path: relative(storage, folder).split(sep).join('/'), size: await folderSize(folder, deadline) });
    }
    return result;
  }

  private async assertPackingSpace(directory: string, size: number): Promise<void> {
    await this.assertSpace(directory, size, 'pack the backup');
  }

  private async assertSpace(directory: string, size: number, action: string): Promise<void> {
    const { bavail, bsize } = await statfs(directory);
    const free = bavail * bsize;
    if (free >= size + PACKING_RESERVE_BYTES) return;

    const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    throw new RestoreError(`Not enough free space to ${action}: it needs up to ${gb(size + PACKING_RESERVE_BYTES)}, ${gb(free)} are free in ${directory}.`, 507);
  }

  private async lastChange(folder: string): Promise<number> {
    const names = await readdir(folder).catch(() => []);
    let newest = 0;
    for (const path of [folder, ...names.map((name) => join(folder, name))]) {
      const info = await lstat(path).catch(() => null);
      newest = Math.max(newest, info?.mtimeMs ?? Infinity);
    }
    return newest;
  }

  private async stage(archive: string, kind: RestoreKind, peer?: MovePeer, key?: string): Promise<RestoreStarted> {
    this.acquireLock('restore');

    try {
      this.assertNoRestoreRunning();
      return await this.extractStaged(archive, kind, peer, key);
    } finally {
      BackupService.activeOperation = null;
    }
  }

  private async extractStaged(archive: string, kind: RestoreKind, peer?: MovePeer, key?: string): Promise<RestoreStarted> {
    const stagingPath = this.configService.RESTORE_STAGING_PATH;
    const layout = await readArchiveLayout(archive).catch((error) => {
      throw error instanceof BackupArchiveError ? new RestoreError(error.message) : error;
    });
    const archiveKey = layout.header ? this.archiveKey(layout.header.keyId, key) : null;

    try {
      const journal = readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE);
      if (journal?.state === 'ready') {
        updateRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, (current) => {
          current.state = 'cancelled';
          current.finishedAt = Date.now();
        });
      }

      await remove(stagingPath);
      await ensureDir(stagingPath);
      if (layout.header) await this.assertSpace(this.configService.RESTORE_PATH, layout.header.size, 'unpack the backup');

      try {
        const source = createReadStream(archive, { start: layout.payloadOffset });
        if (layout.header && archiveKey) await pipeline(source, createArchiveDecryptor(archiveKey, layout.header, layout.headerBytes), x({ cwd: stagingPath }));
        else await pipeline(source, x({ cwd: stagingPath }));
      } catch (error) {
        throw this.unpackError(error);
      }

      const infoPath = join(stagingPath, 'camera.ui.backup.json');
      const storagePath = join(stagingPath, 'storage');
      if (!(await pathExists(infoPath)) || !(await pathExists(storagePath))) {
        throw new RestoreError('The file is not a camera.ui backup archive.');
      }

      const info: BackupInfo = await readJson(infoPath);
      this.logger.debug('Backup archive information:', info);
      assertRestorableVersion(info.version, ConfigService.VERSION);

      const facts = await this.readArchiveFacts(storagePath);
      const [identity, plugins] = await Promise.all([
        this.describeIdentity(storagePath, facts, kind),
        describeRestoredPlugins(info.plugins, ConfigService.VERSION, facts?.pluginWorkers),
      ]);
      const backedUp = new Set(info.plugins.map((plugin) => plugin.name));
      const notInBackup = this.pluginsService
        .listPlugins()
        .map((plugin) => plugin.pluginName)
        .filter((name) => !backedUp.has(name));
      const summary: RestoreSummary = {
        ...this.summarize(info, facts, dropsIngressAccount(info, !!this.configService.INGRESS_TRUST_IP)),
        ...identity,
        platformChanges: await alignStagedPlatformValues(storagePath, info.environment),
        ...(info.excluded?.length && { excluded: info.excluded }),
        ...(notInBackup.length && { pluginsNotInBackup: notInBackup }),
      };
      const started = this.newJournal(kind, summary, plugins);
      if (peer) started.journal.movePeer = peer;
      writeRestoreJournal(this.configService.RESTORE_JOURNAL_FILE, started.journal);

      this.logger.log(`Backup from camera.ui ${info.version} is staged and waits to be confirmed`);
      return { ticket: started.ticket, status: restoreStatus(started.journal), localStorage: info.localStorage ?? {} };
    } catch (error) {
      await remove(stagingPath).catch(() => {});
      throw error;
    }
  }

  private archiveKey(keyId: string, provided: string | undefined): Buffer {
    const own = parseBackupKey(this.configService.SECRETS.backupKey);
    if (own && backupKeyId(own) === keyId) return own;

    if (!provided) {
      throw new RestoreError('This backup is encrypted. Enter the backup key of the server it comes from.', 422, 'backup-key-required');
    }
    const key = parseBackupKey(provided);
    if (!key || backupKeyId(key) !== keyId) {
      throw new RestoreError('This key does not open the backup.', 422, 'backup-key-wrong');
    }
    return key;
  }

  private unpackError(error: NodeJS.ErrnoException & { code?: string }): RestoreError {
    if (error instanceof RestoreError) return error;
    if (error.code === 'ENOSPC') return new RestoreError(`Not enough free space to unpack the backup in ${this.configService.RESTORE_PATH}.`, 507);
    if (error instanceof BackupArchiveError) {
      return new RestoreError(error.code === 'incomplete' ? 'The backup archive is incomplete. Copy or download it again.' : 'The backup archive is damaged.');
    }
    if (error.code === 'Z_BUF_ERROR' || /unexpected end of file|truncated/i.test(error.message)) {
      return new RestoreError('The backup archive is incomplete. Copy or download it again.');
    }
    return new RestoreError('The file is not a camera.ui backup archive.');
  }

  private newJournal(kind: RestoreKind, summary: RestoreSummary, plugins: RestoreJournal['plugins']): { ticket: string; journal: RestoreJournal } {
    const ticket = randomBytes(24).toString('base64url');
    const now = Date.now();
    return {
      ticket,
      journal: {
        id: randomUUID(),
        kind,
        state: 'ready',
        createdAt: now,
        updatedAt: now,
        summary,
        plugins,
        ticketHash: hashTicket(ticket),
        boots: 0,
      },
    };
  }

  private ticketMatches(journal: RestoreJournal, ticket: string): boolean {
    const expected = Buffer.from(journal.ticketHash, 'hex');
    const actual = Buffer.from(hashTicket(ticket), 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private assertRestoreWaiting(): void {
    if (readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE)?.state !== 'ready') {
      throw new RestoreError('There is no restore waiting to be confirmed.', 409);
    }
  }

  private assertNoRestoreRunning(): void {
    const journal = readRestoreJournal(this.configService.RESTORE_JOURNAL_FILE);
    if (journal?.state === 'confirmed' || journal?.state === 'applied') {
      throw new RestoreError('A restore is being applied right now. Wait until it is finished.', 409);
    }
  }

  private summarize(info: Pick<BackupInfo, 'version' | 'platform' | 'timestamp'>, facts: RestoreArchiveFacts | undefined, dropsIngress = false): RestoreSummary {
    const accounts = (facts?.accounts ?? []).filter((account) => !dropsIngress || !isIngressAccount(account));
    return { version: info.version, platform: info.platform, createdAt: info.timestamp, cameras: facts?.cameras ?? 0, accounts };
  }

  private async describeIdentity(storagePath: string, facts: RestoreArchiveFacts | undefined, kind: RestoreKind): Promise<Partial<RestoreSummary>> {
    const dbs = inject('dbs');
    const sameServer = !!facts?.instanceId && facts.instanceId === dbs.settingsDB.get('settings')?.instanceId;
    const [certificate, source] = await Promise.all([
      this.hasCertificateAuthority(storagePath),
      sameServer || kind === 'move' ? undefined : this.findRunningSource(facts?.instanceId),
    ]);

    return {
      suggestedMode: kind === 'move' || sameServer || dbs.camerasDB.getKeysCount() === 0 ? 'move' : 'copy',
      sameServer,
      certificate,
      cloud: facts?.cloud ?? false,
      workers: facts?.workers ?? 0,
      ...source,
    };
  }

  private async findRunningSource(instanceId: string | undefined): Promise<Pick<RestoreSummary, 'sourceRunning' | 'sourceUnchecked'> | undefined> {
    if (!instanceId || this.configService.config.mdns === false) return undefined;

    const { servers, failure } = await browseCameraUi(SOURCE_BROWSE_MS);
    if (failure) {
      this.logger.debug(`Could not look for the server of the backup on this network: ${failure}`);
      // macOS answers multicast with EHOSTUNREACH until the app may use the local network
      return { sourceUnchecked: platform() === 'darwin' && failure === 'EHOSTUNREACH' ? 'local-network' : 'network' };
    }

    const addresses = servers.filter((server) => server.id === instanceId).flatMap((server) => server.addresses.map((address) => `${address}:${server.port}`));
    return addresses.length ? { sourceRunning: addresses } : undefined;
  }

  private async hasCertificateAuthority(storagePath: string): Promise<boolean> {
    const { ROOT_CERT_FILE, ROOT_KEY_FILE, STORAGE_PATH } = this.configService;
    const found = await Promise.all([ROOT_CERT_FILE, ROOT_KEY_FILE].map((file) => pathExists(join(storagePath, relative(STORAGE_PATH, file)))));
    return found.every(Boolean);
  }

  private async readArchiveFacts(storagePath: string): Promise<RestoreArchiveFacts | undefined> {
    const databasePath = join(storagePath, 'database');
    if (!(await pathExists(join(databasePath, 'data.mdb')))) {
      this.logger.warn('The backup has no database, it restores without accounts and cameras');
      return undefined;
    }

    return new Promise((resolve, reject) => {
      let result: RestoreArchiveFacts | undefined;
      let stderr = '';

      const child = fork(restoreSummaryPath, [databasePath], {
        silent: true,
        windowsHide: true,
        timeout: SUMMARY_TIMEOUT_MS,
        execArgv: IS_DEV && !IS_ELECTRON ? ['--import=tsx'] : undefined,
      });

      child.stderr?.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-2000)));
      child.on('message', (message: RestoreArchiveFacts) => (result = message));
      child.once('error', (error) => {
        this.logger.warn('Could not read the accounts and cameras of the backup', error);
        resolve(undefined);
      });
      child.once('exit', (code, signal) => {
        if (result) {
          resolve(result);
          return;
        }

        this.logger.warn(`Reading the database of the backup failed (code ${code}, signal ${signal}): ${stderr.trim()}`);
        reject(new RestoreError('The database in this backup is damaged.'));
      });
    });
  }

  private async readUploadMeta(id: string): Promise<UploadMeta> {
    try {
      return await readJson(this.uploadMetaPath(id));
    } catch {
      throw new RestoreError('This upload does not exist or has expired.', 404);
    }
  }

  private uploadMetaPath(id: string): string {
    return join(this.configService.RESTORE_UPLOADS_PATH, `${id}.json`);
  }

  private uploadPartPath(id: string): string {
    return join(this.configService.RESTORE_UPLOADS_PATH, `${id}.part`);
  }
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

async function isSqlite(path: string): Promise<boolean> {
  const file = await open(path, 'r').catch(() => null);
  if (!file) return false;
  try {
    const head = Buffer.alloc(SQLITE_HEADER.length);
    await file.read(head, 0, head.length, 0);
    return head.equals(SQLITE_HEADER);
  } finally {
    await file.close();
  }
}

async function snapshotSqlite(source: string, target: string): Promise<boolean> {
  const sqlite = await import('node:sqlite').catch(() => null);
  if (!sqlite?.backup) return false;

  let db: DatabaseSync | undefined;
  try {
    await ensureDir(dirname(target));
    db = new sqlite.DatabaseSync(source, { readOnly: true, timeout: SQLITE_BUSY_TIMEOUT_MS });
    await sqlite.backup(db, target);
    return true;
  } catch {
    await remove(target).catch(() => {});
    return false;
  } finally {
    db?.close();
  }
}

async function folderSize(path: string, deadline: number): Promise<number | undefined> {
  let size = 0;
  for (const name of await readdir(path).catch(() => [])) {
    if (Date.now() > deadline) return undefined;
    const stats = await lstat(join(path, name)).catch(() => null);
    if (!stats) continue;
    if (stats.isDirectory()) {
      const inner = await folderSize(join(path, name), deadline);
      if (inner === undefined) return undefined;
      size += inner;
    } else if (stats.isFile()) {
      size += stats.size;
    }
  }
  return size;
}
