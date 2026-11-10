import { isEqual, sleep } from '@camera.ui/common/utils';
import { ensureDir } from 'fs-extra/esm';
import { open } from 'lmdb';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import semver from 'semver';

import { inject, provide } from '../../container.js';
import { DEFAULT_MASTER_USERNAME, INGRESS_USERNAME, MIN_DATABASE_VERSION } from '../../services/config/constants.js';
import { isMovedAway, readMoveRecord } from '../../services/config/move.js';
import { isHostAddress } from '../../services/config/platform-values.js';
import { dropsIngressAccount, isIngressAccount } from '../../services/config/restore.js';
import { createSourceName, generatedSourceUrls, go2rtcStreamUrls, onvifVideoSources, stripStreamToken } from '../../utils/camera.js';
import { createAutomationSchema } from '../schemas/automations.schema.js';
import { createCameraBaseSchema } from '../schemas/cameras.schema.js';
import { notificationSettingsSchema } from '../schemas/notifications.schema.js';
import { createShareSchema } from '../schemas/shares.schema.js';
import { backfillDefaults, backfillSingletonDefaults } from './backfill.js';
import {
  ASSISTANT_ID,
  ASSISTANT_MEMORY_ID,
  ASSISTANT_PROFILES_ID,
  ASSISTANT_SCHEDULES_ID,
  ASSISTANT_STATE_ID,
  ASSISTANT_THREAD_ATTACHMENTS_ID,
  ASSISTANT_THREAD_MESSAGES_ID,
  ASSISTANT_THREADS_ID,
  ASSISTANT_USAGE_ID,
  AUTOMATION_STATE_ID,
  AUTOMATIONS_ID,
  CAMERAS_ID,
  CLOUD_ID,
  DATABASE_ID,
  DOWNLOADS_ID,
  FLOORPLAN_ID,
  INSTANCES_CONFIG_ID,
  INSTANCES_ID,
  MQTT_ID,
  NOTIFICATION_ENTRIES_ID,
  NOTIFICATION_HISTORY_ID,
  NOTIFICATIONS_ID,
  PLUGINS_ID,
  REMOTE_ID,
  ROOMS_ID,
  SENSOR_HISTORY_ID,
  SENSORS_ID,
  SERVER_ID,
  SETTINGS_ID,
  SHARES_ID,
  TOKENS_ID,
  TRAINING_CANDIDATES_ID,
  USERS_ID,
  WORKER_STATE_ID,
} from './constants.js';
import { MigrationRunner } from './migration.js';
import {
  dbAssistantSchema,
  dbCloudSchema,
  dbFloorPlanSchema,
  dbInstanceSchema,
  dbInstancesConfigSchema,
  dbMqttSchema,
  dbRemoteSchema,
  dbRoomCatalogSchema,
  dbServerSchema,
  dbSettingsSchema,
  dbUserSchema,
} from './record-schemas.js';
import { SelfCheck } from './selfcheck.js';
import { tokenIndex } from './tokenIndex.js';

import type { Database as DB, Key, RootDatabase as RootDB } from 'lmdb';
import type { ConfigService } from '../../services/config/index.js';
import type { AppliedRestore } from '../../services/config/restore.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { BackupInfo, DBToken } from '../types/index.js';
import type {
  DBAssistant,
  DBAssistantAttachmentRecord,
  DBAssistantMemoryFact,
  DBAssistantProfile,
  DBAssistantSchedule,
  DBAssistantThreadMeta,
  DBAssistantUsageMonth,
  DBAutomation,
  DBCamera,
  DBCloud,
  DBDownloadEntry,
  DBFloorPlan,
  DBInstance,
  DBInstancesConfig,
  DBMqtt,
  DBNotificationEntry,
  DBNotificationHistory,
  DBNotificationSettings,
  DBPlugin,
  DBRemote,
  DBRoles,
  DBRoomCatalog,
  DBSensor,
  DBSensorHistoryEntry,
  DBServer,
  DBSettings,
  DBShare,
  DBTrainingCandidate,
  DBUser,
  DBWorkerState,
} from './types.js';

export class Database {
  static readonly VERSION = '2.4.10';

  public workerStateDB!: DB<DBWorkerState, 'state'>;

  public tokensDB!: DB<DBToken, string>;
  public settingsDB!: DB<DBSettings, 'settings'>;
  public serverDB!: DB<DBServer, 'server'>;
  public remoteDB!: DB<DBRemote, 'remote'>;
  public mqttDB!: DB<DBMqtt, 'mqtt'>;
  public cloudDB!: DB<DBCloud, 'cloud'>;
  public roomsDB!: DB<DBRoomCatalog, 'rooms'>;
  public floorPlanDB!: DB<DBFloorPlan, 'floorplan'>;
  public instancesConfigDB!: DB<DBInstancesConfig, 'instancesConfig'>;
  public assistantDB!: DB<DBAssistant, 'assistant'>;

  public camerasDB!: DB<DBCamera, string>;
  public pluginsDB!: DB<DBPlugin, string>;
  public usersDB!: DB<DBUser, string>;
  public sharesDB!: DB<DBShare, string>;
  public automationsDB!: DB<DBAutomation, string>;
  public automationStateDB!: DB<unknown, string>;
  public sensorsDB!: DB<DBSensor, string>;
  public sensorHistoryDB!: DB<DBSensorHistoryEntry, string>;
  public notificationsDB!: DB<DBNotificationSettings, string>;
  public notificationHistoryDB!: DB<DBNotificationHistory, string>;
  public notificationEntriesDB!: DB<DBNotificationEntry, string>;
  public downloadsDB!: DB<DBDownloadEntry, string>;
  public trainingCandidatesDB!: DB<DBTrainingCandidate, string>;
  public instancesDB!: DB<DBInstance, string>;
  public assistantThreadsDB!: DB<DBAssistantThreadMeta, string>;
  public assistantThreadMessagesDB!: DB<unknown[], string>;
  public assistantThreadAttachmentsDB!: DB<DBAssistantAttachmentRecord, string>;
  public assistantSchedulesDB!: DB<DBAssistantSchedule, string>;
  public assistantProfilesDB!: DB<DBAssistantProfile, string>;
  public assistantUsageDB!: DB<DBAssistantUsageMonth, string>;
  public assistantMemoryDB!: DB<DBAssistantMemoryFact, string>;
  public assistantStateDB!: DB<unknown, string>;

  private lowdb: RootDB;
  private migrationRunner!: MigrationRunner;
  private selfCheck!: SelfCheck;
  private closed = false;

  private configService: ConfigService;
  private logger: LoggerService;

  constructor(private readonly workerMode = false) {
    provide('dbs', this);

    this.configService = inject('configService');
    this.logger = inject('logger');

    this.lowdb = open({
      path: this.configService.DATABASE_PATH,
      name: DATABASE_ID,
      maxDbs: 48,
    });

    this.workerStateDB = this.lowdb.openDB({ name: WORKER_STATE_ID });

    if (this.workerMode) {
      this.logger.debug('Worker database opened!');
      return;
    }

    this.tokensDB = this.lowdb.openDB({ name: TOKENS_ID });
    tokenIndex(this.tokensDB);

    this.camerasDB = this.lowdb.openDB({ name: CAMERAS_ID });
    this.pluginsDB = this.lowdb.openDB({ name: PLUGINS_ID });
    this.settingsDB = this.lowdb.openDB({ name: SETTINGS_ID });
    this.usersDB = this.lowdb.openDB({ name: USERS_ID });
    this.serverDB = this.lowdb.openDB({ name: SERVER_ID });
    this.remoteDB = this.lowdb.openDB({ name: REMOTE_ID });
    this.mqttDB = this.lowdb.openDB({ name: MQTT_ID });
    this.cloudDB = this.lowdb.openDB({ name: CLOUD_ID });
    this.roomsDB = this.lowdb.openDB({ name: ROOMS_ID });
    this.floorPlanDB = this.lowdb.openDB({ name: FLOORPLAN_ID });
    this.instancesConfigDB = this.lowdb.openDB({ name: INSTANCES_CONFIG_ID });
    this.assistantDB = this.lowdb.openDB({ name: ASSISTANT_ID });
    this.assistantThreadsDB = this.lowdb.openDB({ name: ASSISTANT_THREADS_ID });
    this.assistantThreadMessagesDB = this.lowdb.openDB({ name: ASSISTANT_THREAD_MESSAGES_ID });
    this.assistantThreadAttachmentsDB = this.lowdb.openDB({ name: ASSISTANT_THREAD_ATTACHMENTS_ID });
    this.assistantSchedulesDB = this.lowdb.openDB({ name: ASSISTANT_SCHEDULES_ID });
    this.assistantProfilesDB = this.lowdb.openDB({ name: ASSISTANT_PROFILES_ID });
    this.assistantUsageDB = this.lowdb.openDB({ name: ASSISTANT_USAGE_ID });
    this.assistantMemoryDB = this.lowdb.openDB({ name: ASSISTANT_MEMORY_ID });
    this.assistantStateDB = this.lowdb.openDB({ name: ASSISTANT_STATE_ID });
    this.sharesDB = this.lowdb.openDB({ name: SHARES_ID });
    this.instancesDB = this.lowdb.openDB({ name: INSTANCES_ID });
    this.automationsDB = this.lowdb.openDB({ name: AUTOMATIONS_ID });
    this.automationStateDB = this.lowdb.openDB({ name: AUTOMATION_STATE_ID });
    this.sensorsDB = this.lowdb.openDB({ name: SENSORS_ID });
    this.sensorHistoryDB = this.lowdb.openDB({ name: SENSOR_HISTORY_ID });
    this.notificationsDB = this.lowdb.openDB({ name: NOTIFICATIONS_ID });
    this.notificationHistoryDB = this.lowdb.openDB({ name: NOTIFICATION_HISTORY_ID });
    this.notificationEntriesDB = this.lowdb.openDB({ name: NOTIFICATION_ENTRIES_ID });
    this.downloadsDB = this.lowdb.openDB({ name: DOWNLOADS_ID });
    this.trainingCandidatesDB = this.lowdb.openDB({ name: TRAINING_CANDIDATES_ID });

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
    await this.adoptRestoredState();
    await this.prepareDatabases();
    await this.ensureIngressUser();
    await this.ensureMaster();
    await this.resetMasterPassword();
    await this.migrationRunner.migrate();
    await this.backfillSchemaDefaults();
    this.syncOnvifVideoSources();
    this.syncCamerasToGo2RtcConfig();

    this.logger.debug('Database initialized!');
  }

  public async snapshot(directory: string): Promise<void> {
    await ensureDir(directory);
    await this.lowdb.backup(directory, true);
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    await this.lowdb.close();
    this.logger.debug('Databases closed!');
  }

  public async commit<V, K extends Key>(db: DB<V, K>, key: K, apply: (record: V | undefined) => V | undefined): Promise<V | undefined> {
    return db.transaction(() => {
      const next = apply(db.get(key));
      if (next === undefined) {
        return undefined;
      }

      db.put(key, next);

      return next;
    });
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
          source.urls = urls.filter((url) => !url.includes('#cameraui')).map(stripStreamToken);
          mutated = true;
        }

        if (mutated) {
          this.camerasDB.put(key, camera);
        }
      }
    });
  }

  public syncOnvifVideoSources(): boolean {
    const movedAway = isMovedAway(readMoveRecord(this.configService.MOVE_FILE));
    const videoSources = onvifVideoSources(movedAway ? [] : [...this.camerasDB.getRange()].map(({ value }) => value));
    const onvif = this.configService.go2rtcConfig.onvif;

    if (isEqual(videoSources, onvif.video_sources)) return false;

    onvif.video_sources = videoSources;
    return true;
  }

  public syncCamerasToGo2RtcConfig(): void {
    this.configService.go2rtcConfig.preload ??= {};
    this.configService.go2rtcConfig.streams ??= {};

    const port = this.configService.config.port;
    const streams = this.configService.go2rtcConfig.streams;
    const preload = this.configService.go2rtcConfig.preload;
    const validSourceNames = new Set<string>();
    const movedAway = isMovedAway(readMoveRecord(this.configService.MOVE_FILE));

    for (const { value: camera } of this.camerasDB.getRange()) {
      for (const source of camera.sources) {
        const sourceName = createSourceName(camera.name, source.name);
        validSourceNames.add(sourceName);

        source.urls = generatedSourceUrls(camera._id, port, source);
        streams[sourceName] = go2rtcStreamUrls(sourceName, source, source.urls, this.configService.STREAM_URL_TOKEN);

        if (source.hotMode && !camera.disabled && !movedAway) {
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

  private async backfillSchemaDefaults(): Promise<void> {
    await backfillDefaults(this.camerasDB, createCameraBaseSchema.strip(), this.logger, CAMERAS_ID);
    await backfillDefaults(this.automationsDB, createAutomationSchema.strip(), this.logger, AUTOMATIONS_ID);
    await backfillDefaults(this.sharesDB, createShareSchema.strip(), this.logger, SHARES_ID);
    await backfillDefaults(this.notificationsDB, notificationSettingsSchema.strip(), this.logger, NOTIFICATIONS_ID);
    await backfillDefaults(this.usersDB, dbUserSchema, this.logger, USERS_ID);
    await backfillDefaults(this.instancesDB, dbInstanceSchema, this.logger, INSTANCES_ID);
    await backfillSingletonDefaults(this.settingsDB, 'settings', dbSettingsSchema, this.logger, SETTINGS_ID);
    await backfillSingletonDefaults(this.serverDB, 'server', dbServerSchema, this.logger, SERVER_ID);
    await backfillSingletonDefaults(this.remoteDB, 'remote', dbRemoteSchema, this.logger, REMOTE_ID);
    await backfillSingletonDefaults(this.mqttDB, 'mqtt', dbMqttSchema, this.logger, MQTT_ID);
    await backfillSingletonDefaults(this.cloudDB, 'cloud', dbCloudSchema, this.logger, CLOUD_ID);
    await backfillSingletonDefaults(this.roomsDB, 'rooms', dbRoomCatalogSchema, this.logger, ROOMS_ID);
    await backfillSingletonDefaults(this.floorPlanDB, 'floorplan', dbFloorPlanSchema, this.logger, FLOORPLAN_ID);
    await backfillSingletonDefaults(this.instancesConfigDB, 'instancesConfig', dbInstancesConfigSchema, this.logger, INSTANCES_CONFIG_ID);
    await backfillSingletonDefaults(this.assistantDB, 'assistant', dbAssistantSchema, this.logger, ASSISTANT_ID);
  }

  private async checkOldVersion(): Promise<void> {
    const settingsDB = this.settingsDB.get('settings');
    const oldVersion = settingsDB?.version ?? Database.VERSION;

    if (semver.lt(oldVersion, MIN_DATABASE_VERSION)) {
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
    if (!this.roomsDB.get('rooms')) {
      await this.roomsDB.put('rooms', dbRoomCatalogSchema.parse({}));
    }
    if (!this.floorPlanDB.get('floorplan')) {
      await this.floorPlanDB.put('floorplan', dbFloorPlanSchema.parse({}));
    }
    if (!this.instancesConfigDB.get('instancesConfig')) {
      await this.instancesConfigDB.put('instancesConfig', { homeId: randomUUID() });
    }
    if (!this.assistantDB.get('assistant')) {
      await this.assistantDB.put('assistant', dbAssistantSchema.parse({}));
    }
  }

  private async adoptRestoredState(): Promise<void> {
    const markerFile = this.configService.RESTORE_APPLIED_FILE;
    if (!existsSync(markerFile)) {
      return;
    }

    const applied = (await readFile(markerFile, 'utf-8')).trim() as AppliedRestore;
    if (applied === 'copy') await this.resetCopiedIdentity();
    else await this.dropCloudSession();
    if (applied === 'move') await this.keepOwnServerAddresses();
    if (applied !== 'undo') await this.dropIngressAccount();

    const settings = this.settingsDB.get('settings');
    if (settings) await this.settingsDB.put('settings', { ...settings, restoreGeneration: randomUUID() });

    this.configService.refreshHostCertificate();
    await unlink(markerFile);
  }

  private async dropCloudSession(): Promise<void> {
    const { pending_pair, ...cloud } = this.cloudDB.get('cloud') ?? {};
    if (!cloud.oauth) return;

    await this.cloudDB.put('cloud', { ...cloud, oauth: { ...cloud.oauth, access_token: '', refresh_token: '', expires_at: 0, needs_reauth: true } });
  }

  private async dropIngressAccount(): Promise<void> {
    const info = await readFile(this.configService.BACKUP_INFO_FILE, 'utf-8').then(
      (content) => JSON.parse(content) as BackupInfo,
      () => undefined,
    );
    if (!dropsIngressAccount(info, !!this.configService.INGRESS_TRUST_IP)) return;

    for (const { key, value: user } of this.usersDB.getRange()) {
      if (!isIngressAccount(user)) continue;

      await this.usersDB.remove(key);
      for (const { key: tokenKey, value: token } of this.tokensDB.getRange()) {
        if (token.user_id === user._id) await this.tokensDB.remove(tokenKey);
      }
      this.logger.log(`Removed the account "${user.username}" of the backup, it only signs in inside Home Assistant`);
    }
  }

  private async keepOwnServerAddresses(): Promise<void> {
    const server = this.serverDB.get('server');
    const own = server?.serverAddresses.filter((address) => isHostAddress(address));
    if (server && own && own.length !== server.serverAddresses.length) await this.serverDB.put('server', { ...server, serverAddresses: own });
  }

  private async resetCopiedIdentity(): Promise<void> {
    await this.instancesConfigDB.put('instancesConfig', { homeId: randomUUID() });
    await this.serverDB.put('server', { serverAddresses: [] });
    await this.cloudDB.put('cloud', {});
    await this.remoteDB.put('remote', {
      enabled: false,
      directEnabled: false,
      relay: false,
      directMode: 'cloudflare',
      customDomain: { url: null },
      cloudflare: { mode: 'quick', hostname: null, token: null, tunnelId: null },
    });
    await this.tokensDB.clearAsync();

    const settings = this.settingsDB.get('settings');
    if (settings) {
      const { knownWorkers, workerCredentials, workerPairings, workerLastShutdown, workerReleases, workerUpdates, ...rest } = settings;
      await this.settingsDB.put('settings', { ...rest, instanceId: randomUUID() });
    }
    await this.workerStateDB.clearAsync();

    for (const { key, value: camera } of this.camerasDB.getRange()) {
      if (camera.workerAgentId === undefined && camera.workerOnly === undefined) continue;
      const { workerAgentId, workerOnly, ...rest } = camera;
      await this.camerasDB.put(key, rest);
    }
    for (const { key, value: plugin } of this.pluginsDB.getRange()) {
      if (plugin.workerAgentId === undefined && plugin.workerOnly === undefined) continue;
      const { workerAgentId, workerOnly, ...rest } = plugin;
      await this.pluginsDB.put(key, rest);
    }
  }

  private async prepareDatabases(): Promise<void> {
    const serverDB = this.serverDB.get('server');
    const serverAddresses = serverDB?.serverAddresses ?? [];
    await this.configService.updateGo2RtcWebRtcFilter(serverAddresses, undefined);
  }

  private async ensureMaster(): Promise<void> {
    const users = [...this.usersDB.getRange()];
    if (users.some(({ value: user }) => user.role === 'master')) return;

    // a second account of this name would leave the login to chance
    const named = users.find(({ value: user }) => user.username === DEFAULT_MASTER_USERNAME);
    if (named) {
      this.logger.attention(`No master found! "${DEFAULT_MASTER_USERNAME}" becomes the master and keeps its password.`);
      await this.commit(this.usersDB, named.key, (current) => (current ? { ...current, role: 'master' as const } : undefined));
      return;
    }

    this.logger.attention('No master found! Creating new master...');
    const master = this.generateMaster();
    await this.usersDB.put(master._id, master);
  }

  private async resetMasterPassword(): Promise<void> {
    const markerFile = [this.configService.RESET_PASSWORD_FILE, `${this.configService.RESET_PASSWORD_FILE}.txt`].find((file) => existsSync(file));
    if (!markerFile) {
      return;
    }

    for (const { key, value: user } of this.usersDB.getRange()) {
      if (user.role !== 'master' || user.username === INGRESS_USERNAME) continue;

      await this.commit(this.usersDB, key, (current) => {
        if (!current) return undefined;
        const next: DBUser = { ...current, password: hashPassword('admin'), firstLogin: true };
        delete next.twoFactor;
        return next;
      });

      for (const { key: tokenKey, value: token } of this.tokensDB.getRange()) {
        if (token.user_id === user._id && token.type !== 'api') await this.tokensDB.remove(tokenKey);
      }

      this.logger.attention(`Password of "${user.username}" reset to "admin" and two-factor login turned off. A new password is required at the next login.`);
    }

    await unlink(markerFile);
  }

  private generateMaster(): DBUser {
    return {
      _id: randomUUID(),
      avatar: 'logo-256.png',
      username: DEFAULT_MASTER_USERNAME,
      password: hashPassword('admin'),
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
    const user = ingressUser(INGRESS_USERNAME, 'master');
    await this.usersDB.put(user._id, user);
  }
}

export function ingressUser(username: string, role: DBRoles, _id: string = randomUUID()): DBUser {
  return {
    _id,
    avatar: 'logo-256.png',
    username,
    password: hashPassword(randomBytes(32).toString('base64')),
    role,
    firstLogin: false,
    preferences: {
      camview: {
        views: [],
      },
      cameras: {},
    },
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('base64');
  return salt + '$' + createHmac('sha512', salt).update(password).digest('base64');
}
