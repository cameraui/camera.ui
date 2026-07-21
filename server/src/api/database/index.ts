import { sleep } from '@camera.ui/common/utils';
import { open } from 'lmdb';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import semver from 'semver';
import { container } from 'tsyringe';

import { DEFAULT_CONFIG_SSL } from '../../services/config/defaults.js';
import { applySourceUrlFlags, createSourceName } from '../../utils/camera.js';
import { createAutomationSchema } from '../schemas/automations.schema.js';
import { createCameraBaseSchema } from '../schemas/cameras.schema.js';
import { notificationSettingsSchema } from '../schemas/notifications.schema.js';
import { createShareSchema } from '../schemas/shares.schema.js';
import { createVirtualSensorSchema } from '../schemas/virtualsensors.schema.js';
import { REGEX_ESCAPE } from '../utils/regex.js';
import { backfillDefaults, backfillSingletonDefaults } from './backfill.js';
import {
  AUTOMATION_STATE_ID,
  AUTOMATIONS_ID,
  CAMERAS_ID,
  CLOUD_ID,
  DATABASE_ID,
  DOWNLOADS_ID,
  INSTANCES_CONFIG_ID,
  INSTANCES_ID,
  MQTT_ID,
  NOTIFICATION_HISTORY_ID,
  NOTIFICATIONS_ID,
  PLUGINS_ID,
  REMOTE_ID,
  SERVER_ID,
  SETTINGS_ID,
  SHARES_ID,
  TOKENS_ID,
  USERS_ID,
  VIRTUAL_SENSORS_ID,
  WORKER_STATE_ID,
} from './constants.js';
import { MigrationRunner } from './migration.js';
import {
  dbCloudSchema,
  dbInstanceSchema,
  dbInstancesConfigSchema,
  dbMqttSchema,
  dbRemoteSchema,
  dbServerSchema,
  dbSettingsSchema,
  dbUserSchema,
} from './record-schemas.js';
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
  DBMqtt,
  DBNotificationHistory,
  DBNotificationSettings,
  DBPlugin,
  DBRemote,
  DBServer,
  DBSettings,
  DBShare,
  DBUser,
  DBVirtualSensor,
  DBWorkerState,
} from './types.js';

const INGRESS_USERNAME = 'homeassistant';

export class Database {
  static readonly VERSION = '2.0.51';

  public workerStateDB!: DB<DBWorkerState, 'state'>;

  public tokensDB!: DB<DBToken, string>;
  public settingsDB!: DB<DBSettings, 'settings'>;
  public serverDB!: DB<DBServer, 'server'>;
  public remoteDB!: DB<DBRemote, 'remote'>;
  public mqttDB!: DB<DBMqtt, 'mqtt'>;
  public cloudDB!: DB<DBCloud, 'cloud'>;
  public instancesConfigDB!: DB<DBInstancesConfig, 'instancesConfig'>;

  public camerasDB!: DB<DBCamera, string>;
  public pluginsDB!: DB<DBPlugin, string>;
  public usersDB!: DB<DBUser, string>;
  public sharesDB!: DB<DBShare, string>;
  public automationsDB!: DB<DBAutomation, string>;
  public automationStateDB!: DB<unknown, string>;
  public virtualSensorsDB!: DB<DBVirtualSensor, string>;
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
      maxDbs: 32,
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
    this.mqttDB = this.lowdb.openDB({ name: MQTT_ID });
    this.cloudDB = this.lowdb.openDB({ name: CLOUD_ID });
    this.instancesConfigDB = this.lowdb.openDB({ name: INSTANCES_CONFIG_ID });
    this.sharesDB = this.lowdb.openDB({ name: SHARES_ID });
    this.instancesDB = this.lowdb.openDB({ name: INSTANCES_ID });
    this.automationsDB = this.lowdb.openDB({ name: AUTOMATIONS_ID });
    this.automationStateDB = this.lowdb.openDB({ name: AUTOMATION_STATE_ID });
    this.virtualSensorsDB = this.lowdb.openDB({ name: VIRTUAL_SENSORS_ID });
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
    await this.resetRestoredIdentity();
    await this.prepareDatabases();
    await this.ensureIngressUser();
    await this.ensureMaster();
    await this.migrationRunner.migrate();
    await this.backfillSchemaDefaults();
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
          return applySourceUrlFlags(url, source);
        });

        const ffmpegUrl = `ffmpeg:${sourceName}#cameraui#audio=pcma#audio=opus#audio=aac#noVideo#noBackchannel#requirePrevAudio`;
        const homekitSourceName = `${sourceName}_homekit`;
        const homekitUrl = source.role === 'snapshot'
          ? undefined
          : `ffmpeg:${sourceName}#video=h264#hardware#noAudio#noBackchannel`;

        const existing = streams[sourceName];
        if (!existing) {
          streams[sourceName] = source.muted ? [...source.urls] : [...source.urls, ffmpegUrl];
        } else if (source.role !== 'snapshot') {
          const go2rtcUrls = Array.isArray(existing) ? existing : [existing];
          const escaped = sourceName.replace(REGEX_ESCAPE, '\\$&');
          const ourPattern = new RegExp(`^ffmpeg:${escaped}(#cameraui)?#audio=pcma#audio=opus#audio=aac#noVideo#noBackchannel#requirePrevAudio$`);
          const idx = go2rtcUrls.findIndex((u) => ourPattern.test(u));
          if (source.muted) {
            if (idx !== -1) {
              go2rtcUrls.splice(idx, 1);
            }
          } else if (idx !== -1) {
            go2rtcUrls[idx] = ffmpegUrl;
          } else {
            go2rtcUrls.push(ffmpegUrl);
          }
          streams[sourceName] = go2rtcUrls;
        }

        // a disabled camera must not be preloaded by go2rtc at its own startup
        if (source.hotMode && !camera.disabled) {
          preload[sourceName] = source.muted ? 'video&microphone' : 'video&audio&microphone';
          if (homekitUrl) {
            preload[homekitSourceName] = source.muted ? 'video&microphone' : 'video&audio&microphone';
          }
        } else {
          delete preload[sourceName];
          delete preload[homekitSourceName];
        }
        if (homekitUrl) streams[homekitSourceName] = [homekitUrl, `rtsp://127.0.0.1:${this.configService.go2rtcConfig.rtsp.listen.split(':').pop()}/${sourceName}?audio`];
        else delete streams[homekitSourceName];
        validSourceNames.add(homekitSourceName);
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

  private async backfillSchemaDefaults(): Promise<void> {
    await backfillDefaults(this.camerasDB, createCameraBaseSchema.strip(), this.logger, CAMERAS_ID);
    await backfillDefaults(this.automationsDB, createAutomationSchema.strip(), this.logger, AUTOMATIONS_ID);
    await backfillDefaults(this.virtualSensorsDB, createVirtualSensorSchema.strip(), this.logger, VIRTUAL_SENSORS_ID);
    await backfillDefaults(this.sharesDB, createShareSchema.strip(), this.logger, SHARES_ID);
    await backfillDefaults(this.notificationsDB, notificationSettingsSchema.strip(), this.logger, NOTIFICATIONS_ID);
    await backfillDefaults(this.usersDB, dbUserSchema, this.logger, USERS_ID);
    await backfillDefaults(this.instancesDB, dbInstanceSchema, this.logger, INSTANCES_ID);
    await backfillSingletonDefaults(this.settingsDB, 'settings', dbSettingsSchema, this.logger, SETTINGS_ID);
    await backfillSingletonDefaults(this.serverDB, 'server', dbServerSchema, this.logger, SERVER_ID);
    await backfillSingletonDefaults(this.remoteDB, 'remote', dbRemoteSchema, this.logger, REMOTE_ID);
    await backfillSingletonDefaults(this.mqttDB, 'mqtt', dbMqttSchema, this.logger, MQTT_ID);
    await backfillSingletonDefaults(this.cloudDB, 'cloud', dbCloudSchema, this.logger, CLOUD_ID);
    await backfillSingletonDefaults(this.instancesConfigDB, 'instancesConfig', dbInstancesConfigSchema, this.logger, INSTANCES_CONFIG_ID);
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
    if (!this.remoteDB.get('remote')) {
      await this.remoteDB.put('remote', dbRemoteSchema.parse({}));
    }
    if (!this.mqttDB.get('mqtt')) {
      await this.mqttDB.put('mqtt', dbMqttSchema.parse({}));
    }
    if (!this.cloudDB.get('cloud')) {
      await this.cloudDB.put('cloud', {});
    }
    if (!this.instancesConfigDB.get('instancesConfig')) {
      await this.instancesConfigDB.put('instancesConfig', { homeId: randomUUID() });
    }
  }

  private async resetRestoredIdentity(): Promise<void> {
    const markerFile = this.configService.RESTORE_RESET_IDENTITY_FILE;
    if (!existsSync(markerFile)) {
      return;
    }

    await this.instancesConfigDB.put('instancesConfig', { homeId: randomUUID() });
    await this.serverDB.put('server', { serverAddresses: [] });
    await this.cloudDB.put('cloud', {});
    await this.remoteDB.put('remote', {
      enabled: false,
      directEnabled: false,
      directMode: 'cloudflare',
      customDomain: { url: null },
      cloudflare: { mode: 'quick', hostname: null, token: null, tunnelId: null },
    });

    this.configService.writeConfig({ ssl: { addresses: [...DEFAULT_CONFIG_SSL.addresses!] } });

    await unlink(markerFile);
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

  private async ensureIngressUser(): Promise<void> {
    if (!this.configService.INGRESS_TRUST_IP) {
      return;
    }

    for (const { value: user } of this.usersDB.getRange()) {
      if (user.username === INGRESS_USERNAME) return;
    }

    this.logger.attention('Ingress mode: provisioning the homeassistant user...');
    const user = this.generateIngressUser();
    await this.usersDB.put(user._id, user);
  }

  private generateIngressUser(): DBUser {
    const salt = randomBytes(16).toString('base64');
    const hash = createHmac('sha512', salt).update(randomBytes(32).toString('base64')).digest('base64');

    return {
      _id: randomUUID(),
      avatar: 'logo-256.png',
      username: INGRESS_USERNAME,
      password: salt + '$' + hash,
      role: 'master',
      firstLogin: false,
      preferences: {
        camview: {
          views: [],
        },
        cameras: {},
      },
    };
  }
}
