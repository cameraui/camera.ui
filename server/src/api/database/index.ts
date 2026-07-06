import { sleep } from '@camera.ui/common/utils';
import { open } from 'lmdb';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import semver from 'semver';
import { container } from 'tsyringe';

import { createSourceName } from '../../utils/camera.js';
import { GOP_REGEX, REGEX_ESCAPE } from '../utils/regex.js';
import {
  AUTOMATIONS_ID,
  CAMERAS_ID,
  CLOUD_ID,
  DATABASE_ID,
  DOWNLOADS_ID,
  INSTANCES_CONFIG_ID,
  INSTANCES_ID,
  NOTIFICATION_HISTORY_ID,
  NOTIFICATIONS_ID,
  PLUGINS_ID,
  REMOTE_ID,
  SERVER_ID,
  SETTINGS_ID,
  SHARES_ID,
  TOKENS_ID,
  USERS_ID,
  WORKER_STATE_ID,
} from './constants.js';
import { MigrationRunner } from './migration.js';
import { SelfCheck } from './selfcheck.js';

import type { Database as DB, RootDatabase as RootDB } from 'lmdb';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { DBToken } from '../types/index.js';
import type {
  DBAutomation,
  DBCamera,
  DBCloud,
  DBDownloadEntry,
  DBInstance,
  DBInstancesConfig,
  DBNotificationHistory,
  DBNotificationSettings,
  DBPlugin,
  DBRemote,
  DBServer,
  DBSettings,
  DBShare,
  DBUser,
  DBWorkerState,
} from './types.js';

export class Database {
  static readonly VERSION = '2.0.49';

  public workerStateDB!: DB<DBWorkerState, 'state'>;

  public tokensDB!: DB<DBToken, string>;
  public settingsDB!: DB<DBSettings, 'settings'>;
  public serverDB!: DB<DBServer, 'server'>;
  public remoteDB!: DB<DBRemote, 'remote'>;
  public cloudDB!: DB<DBCloud, 'cloud' | 'cloudDev'>;
  public instancesConfigDB!: DB<DBInstancesConfig, 'instancesConfig'>;

  public camerasDB!: DB<DBCamera, string>;
  public pluginsDB!: DB<DBPlugin, string>;
  public usersDB!: DB<DBUser, string>;
  public sharesDB!: DB<DBShare, string>;
  public automationsDB!: DB<DBAutomation, string>;
  public notificationsDB!: DB<DBNotificationSettings, string>;
  public notificationHistoryDB!: DB<DBNotificationHistory, string>;
  public downloadsDB!: DB<DBDownloadEntry, string>;
  public instancesDB!: DB<DBInstance, string>;

  private lowdb: RootDB;
  private migrationRunner!: MigrationRunner;
  private selfCheck!: SelfCheck;
  private closed = false;

  private configService: ConfigService;
  private logger: LoggerService;

  constructor(private readonly workerMode = false) {
    container.registerInstance('dbs', this);

    this.configService = container.resolve<ConfigService>('configService');
    this.logger = container.resolve<LoggerService>('logger');

    this.lowdb = open({
      path: this.configService.DATABASE_PATH,
      name: DATABASE_ID,
      maxDbs: 20,
    });

    this.workerStateDB = this.lowdb.openDB({ name: WORKER_STATE_ID });

    if (this.workerMode) {
      this.logger.debug('Worker database opened!');
      return;
    }

    this.tokensDB = this.lowdb.openDB({ name: TOKENS_ID });
    this.camerasDB = this.lowdb.openDB({ name: CAMERAS_ID });
    this.pluginsDB = this.lowdb.openDB({ name: PLUGINS_ID });
    this.settingsDB = this.lowdb.openDB({ name: SETTINGS_ID });
    this.usersDB = this.lowdb.openDB({ name: USERS_ID });
    this.serverDB = this.lowdb.openDB({ name: SERVER_ID });
    this.remoteDB = this.lowdb.openDB({ name: REMOTE_ID });
    this.cloudDB = this.lowdb.openDB({ name: CLOUD_ID });
    this.instancesConfigDB = this.lowdb.openDB({ name: INSTANCES_CONFIG_ID });
    this.sharesDB = this.lowdb.openDB({ name: SHARES_ID });
    this.instancesDB = this.lowdb.openDB({ name: INSTANCES_ID });
    this.automationsDB = this.lowdb.openDB({ name: AUTOMATIONS_ID });
    this.notificationsDB = this.lowdb.openDB({ name: NOTIFICATIONS_ID });
    this.notificationHistoryDB = this.lowdb.openDB({ name: NOTIFICATION_HISTORY_ID });
    this.downloadsDB = this.lowdb.openDB({ name: DOWNLOADS_ID });

    this.selfCheck = new SelfCheck();
    this.migrationRunner = new MigrationRunner(this);

    this.logger.debug('Databases opened!');
  }

  public async initialize(): Promise<void> {
    if (this.workerMode) {
      this.logger.debug('Worker database initialized (no migrations)');
      return;
    }

    this.logger.debug('Initializing database...');

    await this.checkOldVersion();
    await this.selfCheck.run();
    await this.ensureDatabases();
    await this.prepareDatabases();
    await this.ensureMaster();
    await this.migrationRunner.migrate();
    this.syncCamerasToGo2RtcConfig();

    this.logger.debug('Database initialized!');
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    await this.lowdb.close();
    this.logger.debug('Databases closed!');
  }

  public async updateCameras(): Promise<void> {
    const streams = this.configService.go2rtcConfig.streams ?? {};

    await this.camerasDB.transaction(() => {
      for (const { key, value: camera } of this.camerasDB.getRange()) {
        let mutated = false;

        for (const source of camera.sources) {
          const sourceName = createSourceName(camera.name, source.name);
          const raw = streams[sourceName];
          if (raw === undefined) continue;

          const urls = Array.isArray(raw) ? raw : [raw];
          source.urls = urls.filter((url) => !url.includes('#cameraui'));
          mutated = true;
        }

        if (mutated) {
          this.camerasDB.put(key, camera);
        }
      }
    });
  }

  public syncCamerasToGo2RtcConfig(): void {
    this.configService.go2rtcConfig.preload ??= {};
    this.configService.go2rtcConfig.streams ??= {};

    const port = this.configService.config.port;
    const streams = this.configService.go2rtcConfig.streams;
    const preload = this.configService.go2rtcConfig.preload;
    const validSourceNames = new Set<string>();

    for (const { value: camera } of this.camerasDB.getRange()) {
      for (const source of camera.sources) {
        const sourceName = createSourceName(camera.name, source.name);
        validSourceNames.add(sourceName);

        source.urls = source.urls.map((url) => {
          if (url.startsWith('cui://')) {
            url = `cui://127.0.0.1:${port}/api/cameras/streams/${camera._id}/${source.name}`;
          }
          if (source.preload && !GOP_REGEX.test(url)) {
            url += '#gop=1';
          } else if (!source.preload && GOP_REGEX.test(url)) {
            url = url.replace(GOP_REGEX, '');
          }
          return url;
        });

        const ffmpegUrl = `ffmpeg:${sourceName}#cameraui#audio=pcma#audio=opus#audio=aac#noVideo#noBackchannel#requirePrevAudio`;

        const existing = streams[sourceName];
        if (!existing) {
          streams[sourceName] = [...source.urls, ffmpegUrl];
        } else if (source.role !== 'snapshot') {
          const go2rtcUrls = Array.isArray(existing) ? existing : [existing];
          const escaped = sourceName.replace(REGEX_ESCAPE, '\\$&');
          const ourPattern = new RegExp(`^ffmpeg:${escaped}(#cameraui)?#audio=pcma#audio=opus#audio=aac#noVideo#noBackchannel#requirePrevAudio$`);
          const idx = go2rtcUrls.findIndex((u) => ourPattern.test(u));
          if (idx !== -1) {
            go2rtcUrls[idx] = ffmpegUrl;
          } else {
            go2rtcUrls.push(ffmpegUrl);
          }
          streams[sourceName] = go2rtcUrls;
        }

        if (source.hotMode) {
          preload[sourceName] = 'video&audio&microphone';
        } else {
          delete preload[sourceName];
        }
      }
    }

    for (const key of Object.keys(streams)) {
      if (key.startsWith('cui_') && !validSourceNames.has(key)) {
        delete streams[key];
      }
    }
    for (const key of Object.keys(preload)) {
      if (key.startsWith('cui_') && !validSourceNames.has(key)) {
        delete preload[key];
      }
    }

    this.configService.writeGo2RtcConfigFile();
  }

  private async checkOldVersion(): Promise<void> {
    const settingsDB = this.settingsDB.get('settings');
    const oldVersion = settingsDB?.version ?? Database.VERSION;

    if (semver.lt(oldVersion, '2.0.0')) {
      this.logger.attention('Database version is too old! camera.ui will reset the database and restart!');

      this.configService.reset();

      await this.settingsDB.put('settings', {
        version: Database.VERSION,
      });

      await sleep(1000);

      process.exit(0);
    }
  }

  private async ensureDatabases(): Promise<void> {
    if (!this.settingsDB.get('settings')) {
      await this.settingsDB.put('settings', { version: Database.VERSION });
    }
    if (!this.serverDB.get('server')) {
      await this.serverDB.put('server', { serverAddresses: [] });
    }
    const existingRemote = this.remoteDB.get('remote') as Partial<DBRemote> | undefined;
    if (!existingRemote) {
      await this.remoteDB.put('remote', {
        enabled: false,
        directEnabled: false,
        directMode: 'cloudflare',
        customDomain: { url: null },
        cloudflare: { mode: 'quick', hostname: null, token: null, tunnelId: null },
      });
    } else if (existingRemote.directMode === undefined || existingRemote.customDomain === undefined || existingRemote.cloudflare === undefined) {
      await this.remoteDB.put('remote', {
        enabled: existingRemote.enabled ?? false,
        directEnabled: existingRemote.directEnabled ?? false,
        directMode: existingRemote.directMode ?? 'cloudflare',
        customDomain: existingRemote.customDomain ?? { url: null },
        cloudflare: existingRemote.cloudflare ?? { mode: 'quick', hostname: null, token: null, tunnelId: null },
      });
    }
    if (!this.cloudDB.get('cloud')) {
      await this.cloudDB.put('cloud', {});
    }
    if (!this.cloudDB.get('cloudDev')) {
      await this.cloudDB.put('cloudDev', {});
    }
    if (!this.instancesConfigDB.get('instancesConfig')) {
      await this.instancesConfigDB.put('instancesConfig', { homeId: randomUUID() });
    }
  }

  private async prepareDatabases(): Promise<void> {
    const serverDB = this.serverDB.get('server');
    const serverAddresses = serverDB?.serverAddresses ?? [];
    await this.configService.updateGo2RtcWebRtcFilter(serverAddresses, undefined);
  }

  private async ensureMaster(): Promise<void> {
    for (const { value: user } of this.usersDB.getRange()) {
      if (user.role === 'master') return;
    }

    this.logger.attention('No master found! Creating new master...');
    const master = this.generateMaster();
    await this.usersDB.put(master._id, master);
  }

  private generateMaster(): DBUser {
    const salt = randomBytes(16).toString('base64');
    const hash = createHmac('sha512', salt).update('admin').digest('base64');

    return {
      _id: randomUUID(),
      avatar: 'logo-256.png',
      username: 'admin',
      password: salt + '$' + hash,
      role: 'master',
      firstLogin: true,
      preferences: {
        camview: {
          views: [],
        },
        cameras: {},
      },
    };
  }
}
