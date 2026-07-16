import type { BaseCamera, Point, SensorType, Severity } from '@camera.ui/sdk';
import type { CameraInputSettings } from '@camera.ui/sdk/internal';
import type { Types } from '@eneris/push-receiver/dist/client.js';
import type { NotificationSource } from '../../manager/types.js';
import type { UserLanguage } from '../schemas/users.schema.js';

export interface DBCamera extends BaseCamera {
  sources: CameraInputSettings[];
  workerAgentId?: string;
}

export interface DBPlugin {
  readonly _id: string;
  pluginName: string;
  workerAgentId?: string;
}

export interface DBUserTwoFactor {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  verifiedAt?: Date;
}

export interface DBUser {
  readonly _id: string;
  avatar: string;
  username: string;
  password: string;
  role: DBRoles;
  firstLogin: boolean;
  preferences: DBUserPreferences;
  twoFactor?: DBUserTwoFactor;
}

export interface DBBackupSchedulerLastRun {
  timestamp: number;
  status: 'success' | 'error';
  message?: string;
  filename?: string;
  durationMs?: number;
}

export interface DBBackupSchedulerSettings {
  enabled: boolean;
  interval: 'daily' | 'weekly' | 'monthly';
  // "HH:mm" local time
  time: string;
  // 0 (Sunday) – 6, used when interval is 'weekly'
  weekday: number;
  // 1–28, used when interval is 'monthly'
  dayOfMonth: number;
  // keep the newest N archives in the destination
  retention: number;
  // empty = <storage>/backups
  destinationPath: string;
  lastRun?: DBBackupSchedulerLastRun;
}

export interface DBSettings {
  version: string;
  instanceId?: string;
  knownWorkers?: DBKnownWorker[];
  workerCredentials?: DBWorkerCredential[];
  workerPairings?: DBWorkerPairing[];
  backupScheduler?: DBBackupSchedulerSettings;
}

export interface DBKnownWorker {
  agentId: string;
  name: string;
  lastSeen: number;
}

export interface DBWorkerCredential {
  agentId: string;
  name: string;
  user: string;
  secret: string;
  createdAt: number;
}

export interface DBWorkerPairing {
  code: string;
  expiresAt: number;
}

export interface DBServer {
  serverAddresses: string[];
}

export type DBRemoteDirectMode = 'cloudflare' | 'customDomain';
export type DBCloudflareMode = 'quick' | 'token' | 'managed';

export interface DBRemote {
  enabled: boolean;
  directEnabled: boolean;
  directMode: DBRemoteDirectMode;
  customDomain: {
    url: string | null;
  };
  cloudflare: {
    mode: DBCloudflareMode;
    hostname: string | null;
    token: string | null;
    tunnelId: string | null;
  };
}

export type DBMqttProtocol = 'mqtt' | 'mqtts';
export type DBMqttMode = 'external' | 'embedded';

export interface DBMqtt {
  enabled: boolean;
  mode: DBMqttMode;
  broker: {
    port: number;
    username: string | null;
    password: string | null;
  };
  host: string | null;
  port: number;
  protocol: DBMqttProtocol;
  username: string | null;
  password: string | null;
  clientId: string;
  topicPrefix: string;
  tls: {
    rejectUnauthorized: boolean;
    ca: string | null;
    cert: string | null;
    key: string | null;
  };
  haDiscovery: {
    enabled: boolean;
    prefix: string;
  };
}

export interface ServerOAuthCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scopes: string[];
  grant_id: string;
  server_id: string;
  needs_reauth?: boolean;
}

export interface DBCloud {
  name?: string;
  oauth?: ServerOAuthCredentials;
  pending_pair?: {
    device_code: string;
    user_code: string;
    interval: number;
    expires_at: number;
  };
  push?: Partial<Types.ClientConfig>;
  registrationId?: string;
}

export type DBRoles = 'master' | 'admin' | 'user';

export type ShortcutType = 'camera' | 'sensor';

export type SensorShortcutType =
  'contact' | 'temperature' | 'humidity' | 'occupancy' | 'smoke' | 'leak' | 'light' | 'siren' | 'switch' | 'lock' | 'garage' | 'doorbell' | 'securitySystem' | 'battery';

export interface DBShortcutBase {
  readonly _id: string;
  points: Point;
}

export interface DBCameraShortcut extends DBShortcutBase {
  type: 'camera';
  cameraId: string;
}

export interface DBSensorShortcut extends DBShortcutBase {
  type: 'sensor';
  sensorType: SensorShortcutType;
  sensorName: string;
  sensorPluginId: string;
  sensorCameraId: string;
}

export type DBShortcut = DBCameraShortcut | DBSensorShortcut;

// prettier-ignore
export type DBUserCameraPreferences = Record<
  string,
  | {
    shortcuts: DBShortcut[];
  }
  | undefined
>;

export interface DBHiddenDevice {
  id: string;
  name: string;
  model?: string;
}

export interface DBUserPreferences {
  language?: UserLanguage;
  camview: {
    views: DBCamviewLayout[];
  };
  cameras: DBUserCameraPreferences;
  discovery?: {
    hiddenDevices: DBHiddenDevice[];
  };
}

export interface DBInstanceCredentials {
  username: string;
  encryptedPassword: string;
  iv: string;
}

export interface DBInstanceCachedUser {
  _id: string;
  username: string;
  role: DBRoles;
  avatar?: string;
}

export interface DBInstanceTokenCache {
  accessToken: string;
  refreshToken: string;
  cachedAt: number;
  user?: DBInstanceCachedUser;
}

export interface DBInstance {
  id: string;
  name: string;
  url: string;
  remoteHomeId?: string;
  credentials?: DBInstanceCredentials;
  tokenCache?: DBInstanceTokenCache;
  favorite?: boolean;
  addedAt: number;
  addedBy: string;
  // Set (timestamp) when the remote account requires 2FA and the challenge
  // hasn't been completed yet — the UI surfaces this state and offers to
  // finish it. Cleared by any successfully cached session.
  pending2fa?: number;
}

export interface DBInstancesConfig {
  homeId: string;
}

export type DBCamviewViewSize = 1 | 4 | 6 | 7 | 9 | 10 | 12 | 13 | 15 | 16 | 20 | 26;

export type CamviewSettingsLayoutMode = 'dnd' | 'view';

export interface DBCamviewLayout {
  readonly _id: string;
  name: string;
  viewSize: DBCamviewViewSize;
  cameras: DBCamviewLayoutCamera[];
  type: CamviewSettingsLayoutMode;
}

export interface DBCamviewLayoutCamera {
  index: number;
  cameraId: string;
  colSpan?: number;
  rowSpan?: number;
  x?: number;
  y?: number;
}

export type DBPluginStorageValue = Record<string, any>;

export interface DBShare {
  readonly _id: string;
  code: string;
  cameraId: string;
  sourceId: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  maxViewers: number;
  currentViewers: number;
  totalViews: number;
  revoked: boolean;
  label?: string;
}

export interface PluginData {
  pluginName: string;
  id?: string;
  version?: string;
}

export interface DBAutomationNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface DBAutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface DBAutomation {
  readonly _id: string;
  name: string;
  enabled: boolean;
  nodes: DBAutomationNode[];
  edges: DBAutomationEdge[];
  suppressDuplicates: boolean;
  singleExecution: boolean;
  requiresUpdate?: boolean;
  lastRun?: {
    status: 'success' | 'error' | 'running' | 'idle';
    timestamp: number;
    error?: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface DBVirtualSensor {
  readonly _id: string;
  cameraId: string;
  type: SensorType;
  name: string;
  displayName: string;
  state?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface DBDownloadEntry {
  readonly _id: string;
  filePath: string;
  filename: string;
  mimeType: string;
  expiresAt: number;
  cleanup: 'never' | 'on-expiry' | 'on-download';
  streaming?: boolean;
  markerPath?: string;
}

export interface DBWorkerState {
  agentId: string;
  connection?: DBWorkerConnection;
}

export interface DBWorkerConnection {
  master: string;
  leafPort: number;
  user: string;
  secret: string;
  ca: string;
  pairingCode: string;
}

export interface DBNotificationSettings {
  readonly _id: string;
  enabled: boolean;
  sources?: Record<string, boolean>;
  systemTypes?: Record<string, boolean>;
  quietHours?: {
    from: string;
    to: string;
    timezone: string;
  };
}

export interface StoredNotification {
  id: string;
  createdAt: number;
  seenAt: number | null;
  title: string;
  subtitle?: string;
  body?: string;
  severity?: Severity;
  tag?: string;
  imageUrl?: string;
  deepLink?: string;
  source: NotificationSource;
  data?: Record<string, unknown>;
}

export interface DBNotificationHistory {
  readonly _id: string; // userId
  items: StoredNotification[];
}
