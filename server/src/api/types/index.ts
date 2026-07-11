import type { UsableNetworkAddress } from '@camera.ui/common/network';
import type { AssignedPlugin, DetectionLine, DetectionZone, PluginAssignments, PluginContract, ProbeConfig, SchemaConfig, SensorType } from '@camera.ui/sdk';
import type { Readable } from 'node:stream';
import type { ApplicationResponse, DeviceSourceType } from '../../go2rtc/types.js';
import type { PLUGIN_STATUS } from '../../plugins/types.js';
import type { AuthConfig } from '../../rpc/interfaces/config.js';
import type { DBCamera, DBCamviewLayout, DBNotificationSettings, DBRemote, DBRoles, DBServer, DBUser } from '../database/types.js';
import type { Disable2FAInput, Enable2FAInput, OAuthTokenInput, RefreshTokenInput, RegenerateBackupCodesInput, Verify2FAInput } from '../schemas/auth.schema.js';
import type { CreateAutomationInput, ImportBlueprintInput, PatchAutomationInput } from '../schemas/automations.schema.js';
import type { PatchBackupSchedulerSettingsInput, RestoreBackupInput, ScheduledBackupParamsInput } from '../schemas/backup.schema.js';
import type { CameraParamsInput, CreateCameraInput, PatchCameraInput, PreviewCameraInput, SnapshotQueryInput, StreamParamsInput } from '../schemas/cameras.schema.js';
import type { PaginationQueryInput } from '../schemas/common.schema.js';
import type { ConfigQueryInput, PatchConfigInput } from '../schemas/config.schema.js';
import type { FilesParamsInput } from '../schemas/files.schema.js';
import type { FrameWorkerParamsInput } from '../schemas/frameWorkers.schema.js';
import type { PatchGo2RtcConfigInput } from '../schemas/go2rtc.schema.js';
import type { CreateInstanceInput, UpdateInstanceInput } from '../schemas/instances.schema.js';
import type {
  ActionPluginInput,
  InstallPluginInput,
  RemoveStorageQueryInput,
  TestAudioInput,
  TestClassifierInput,
  TestFaceInput,
  TestLicensePlateInput,
  TestMotionInput,
  TestObjectInput,
} from '../schemas/plugins.schema.js';
import type { PatchMqttInput, TestMqttInput } from '../schemas/mqtt.schema.js';
import type { CloudflareManagedConnectInput, PairInitInput, PairPollInput, PatchRemoteInput } from '../schemas/remote.schema.js';
import type { PatchServerInput, ServerChangelogQueryInput, UpdateServerInput } from '../schemas/server.schema.js';
import type { PatchStorateInput, SetStorageInput, SubmitStorageInput } from '../schemas/storage.schema.js';
import type {
  CreateShortcutInput,
  CreateUserInput,
  CreateViewInput,
  LoginUserInput,
  PatchShortcutInput,
  PatchUserInput,
  PatchViewInput,
  UserLanguage,
  UsernameParamsInput,
} from '../schemas/users.schema.js';
import type { CreateVirtualSensorInput, PatchVirtualSensorInput } from '../schemas/virtualsensors.schema.js';
import type { RegisterDeviceInput } from '../services/notifications.service.js';

export interface BusboyFileStream extends Readable {
  truncated: boolean;
  bytesRead: number;
}

export type ClientKind = 'native' | 'web';

export interface DBTokenDevice {
  id: string;
  name: string;
  kind: ClientKind;
  user_agent: string;
  ip: string;
  created_at: number;
  last_seen_at: number;
}

export interface DBToken {
  readonly id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  refresh_token_expires_at: number;
  persistent: boolean;
  device: DBTokenDevice;
  parent_token_id?: string;
  stream_scope?: string;
}

export interface UserData {
  _id: string;
  username: string;
  avatar: string;
  role: DBRoles;
  firstLogin: boolean;
  language: UserLanguage;
  access_token: string;
  refresh_token: string;
  token_type: string;
  access_token_expires_at: number;
  refresh_token_expires_at: number;
  internalAddresses: string[];
  externalAddresses: string[];
}

export interface JwtPayload {
  _id: string;
  username: string;
  device_id: string;
}

export interface JwtTokenDecoded extends JwtPayload {
  exp: Readonly<number>;
  iat: Readonly<number>;
}

export interface JwtTokenResponse {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: number;
  refresh_token_expires_at: number;
}

export interface SessionInfo {
  id: string;
  device: DBTokenDevice;
  is_current: boolean;
  persistent: boolean;
  refresh_token_expires_at: number;
}

export const TOKEN_LIFETIME = {
  ACCESS_SECONDS: 15 * 60,
  REFRESH_PERSISTENT_MS: 90 * 24 * 60 * 60 * 1000,
  REFRESH_NON_PERSISTENT_MS: 24 * 60 * 60 * 1000,
} as const;

export interface CameraCamviewSettings {
  enabled: boolean;
  mode: InterfaceStreamMode;
  imageRefreshTimer: number;
}

export type InterfaceStreamMode = 'live' | 'snapshot';

export type LogoutResponse = 'OK';

export interface SessionResponse {
  status: 'OK';
  internalAddresses: string[];
  externalAddresses: string[];
}

export interface Pagination {
  pageSize: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  currentPage: number;
  totalPages: number;
  nextPageQuery?: string | null;
  prevPageQuery?: string | null;
}

export interface PaginationResponse {
  pagination: Pagination;
  result: any[];
}

export interface UsersResponse {
  pagination: Pagination;
  result: DBUser[];
}

export interface ViewsResponse {
  pagination: Pagination;
  result: DBCamviewLayout[];
}

export interface CamerasResponse {
  pagination: Pagination;
  result: DBCamera[];
}

export interface HealthResponse {
  status: 'ok';
}

export interface PluginExtension {
  pluginName: string;
  displayName: string;
  contract: PluginContract;
}

export interface PluginExtensionConfig extends PluginExtension, SchemaConfig {}

export interface ExtensionsResponse {
  pagination: Pagination;
  result: PluginExtension[];
}

export interface PluginsProgress {
  pluginName: string;
  action: 'install' | 'update' | 'uninstall';
  version: string;
}

export interface PluginsResponse {
  pagination: Pagination;
  result: CameraUiPlugin[];
}

export interface PluginsProgressResponse {
  pagination: Pagination;
  result: PluginsProgress[];
}

export interface FrameWorkerResponse {
  pagination: Pagination;
  result: FrameWorker[];
}

export interface PluginContractCamera {
  name: string;
  plugins: AssignedPlugin[];
  assignments: PluginAssignments;
  pluginInfo?: { id: string; name: string };
}

export interface PluginContractResponse {
  contract: PluginContract;
  cameras: PluginContractCamera[];
}

export interface Go2RtcInfoAuth {
  username: string;
  password: string;
}

export interface Go2RtcInfo {
  url: string;
  wsURL: string;
  port: number;
  info: ApplicationResponse;
  auth: Partial<Go2RtcInfoAuth>;
}

export interface NatsInfo {
  // servers: string[];
  auth: AuthConfig;
}

export interface SessionsResponse {
  pagination: Pagination;
  result: SessionInfo[];
}

export type PaginationQuery = PaginationQueryInput;

export interface PaginationRequest {
  Querystring: PaginationQuery;
}

export interface AuthParamsRequest {
  Params: { id: string; username?: string };
}

export interface AuthLoginRequest {
  Querystring: { token?: string };
}

export interface AuthNewLoginRequest {
  Body: LoginUserInput;
}

export interface AuthOAuthTokenRequest {
  Body: OAuthTokenInput;
}

export interface AuthRefreshRequest {
  Body: RefreshTokenInput;
}

export interface Auth2FAVerifyRequest {
  Body: Verify2FAInput;
}

export interface Auth2FAEnableRequest {
  Body: Enable2FAInput;
}

export interface Auth2FADisableRequest {
  Body: Disable2FAInput;
}

export interface Auth2FARegenerateBackupCodesRequest {
  Body: RegenerateBackupCodesInput;
}

export interface TwoFactorPendingResponse {
  requires2fa: true;
  tempToken: string;
}

export interface TwoFactorSetupResponse {
  qrCode: string;
  secret: string;
}

export interface TwoFactorBackupCodesResponse {
  backupCodes: string[];
}

export interface TwoFactorStatusResponse {
  enabled: boolean;
  verifiedAt?: Date;
  backupCodesCount?: number;
}

export interface CamerasParamsRequest {
  Params: CameraParamsInput;
}

export interface CamerasStreamRequest {
  Params: StreamParamsInput;
}

export interface CameraSnapshotQueryRequest {
  Querystring: SnapshotQueryInput;
}

export interface CameraDiscoverQueryRequest {
  Querystring: { type?: DeviceSourceType; src?: string };
}

export interface CameraProbeSourceQueryRequest {
  Querystring: ProbeConfig & { refresh?: boolean };
}

export interface CameraSourceParamsRequest {
  Params: { sourcename: string };
}

export interface CamerasParamsIdRequest {
  Params: { cameraid: string };
}

export interface CamerasExtensionsParamsRequest {
  Params: { cameraname: string; pluginname: string; scope?: string };
}

export interface CamerasSensorStorageParamsRequest {
  Params: { cameraname: string; pluginname: string; sensorId: string; scope?: string };
}

export interface CamerasExtensionsRequest {
  Querystring: { type: SensorType };
}

export interface CameraZoneInsertPatchRequest {
  Body: DetectionZone[];
}

export interface CameraLineInsertPatchRequest {
  Body: DetectionLine[];
}

export interface CamerasInsertRequest {
  Body: CreateCameraInput;
}

export interface CamerasPreviewRequest {
  Body: PreviewCameraInput;
}

export interface CamerasPatchRequest {
  Body: PatchCameraInput;
}

export interface StoragePatchRequest {
  Body: PatchStorateInput;
}

export interface StorageSetRequest {
  Body: SetStorageInput;
}

export interface StorageSubmitRequest {
  Body: SubmitStorageInput;
}

export interface ConfigRequest {
  Querystring: ConfigQueryInput;
}

export interface ConfigPatchRequest {
  Body: PatchConfigInput;
}

export interface Go2RtcConfigPatchRequest {
  Body: PatchGo2RtcConfigInput;
}

export interface FilesParamsRequest {
  Params: FilesParamsInput;
}

export interface PluginsParamsIdRequest {
  Params: { pluginid: string };
}

export interface PluginsParamsNameRequest {
  Params: { scope?: string; pluginname: string };
}

export interface FrameWorkerParamsNameRequest {
  Params: FrameWorkerParamsInput;
}

export interface PluginsParamsRemoveRequest {
  Querystring: RemoveStorageQueryInput;
}

export interface PluginsQuery {
  pluginname?: string;
  pluginversion?: string;
  refresh?: boolean;
}

export interface PluginsQueryRequest {
  Querystring: PluginsQuery;
}

export interface PluginsInsertRequest {
  Body: InstallPluginInput;
}

export interface PluginsConfigPatchRequest {
  Body: Record<string, any>;
}

export interface PluginsActionRequest {
  Body: ActionPluginInput;
}

export interface PluginsTestMotionRequest {
  Body: TestMotionInput;
}

export interface PluginsTestObjectRequest {
  Body: TestObjectInput;
}

export interface PluginsTestAudioRequest {
  Body: TestAudioInput;
}

export interface PluginsTestFaceRequest {
  Body: TestFaceInput;
}

export interface PluginsTestLicensePlateRequest {
  Body: TestLicensePlateInput;
}

export interface PluginsTestClassifierRequest {
  Body: TestClassifierInput;
}

export interface PluginsInterfaceQueryType {
  type: 'objectDetection' | 'motionDetection' | 'audioDetection' | 'faceDetection' | 'licensePlateDetection' | 'classifierDetection';
}

export interface UsersParamsRequest {
  Params: UsernameParamsInput;
}

export interface UsersInsertRequest {
  Body: CreateUserInput & { avatar: string };
}

export interface UsersPatchRequest {
  Body: PatchUserInput & { avatar: string };
}

export interface ServerPatchRequest {
  Body: PatchServerInput;
}

export interface ServerUpdateRequest {
  Body: UpdateServerInput;
}

export interface ServerChangelogRequest {
  Querystring: ServerChangelogQueryInput;
}

export interface MqttPatchRequest {
  Body: PatchMqttInput;
}

export interface MqttTestRequest {
  Body: TestMqttInput;
}

export interface RemotePatchRequest {
  Body: PatchRemoteInput;
}

export interface RemoteRegisterRequest {
  Body: PairInitInput;
}

export interface RemotePairPollRequest {
  Body: PairPollInput;
}

export interface CloudflareManagedConnectRequest {
  Body: CloudflareManagedConnectInput;
}

export interface ViewsParamsRequest {
  Params: { viewid: string };
}

export interface ViewsInsertRequest {
  Body: CreateViewInput;
}

export interface ViewsPatchRequest {
  Body: PatchViewInput;
}

export interface ShortcutParamsRequest {
  Params: { shortcutid: string };
}

export interface ShortcutInsertRequest {
  Body: CreateShortcutInput;
}

export interface ShortcutPatchRequest {
  Body: PatchShortcutInput;
}

export interface BackupCreateRequest {
  Body: { localStorage: Partial<UiLocalStorage> };
}

export interface BackupSchedulerPatchRequest {
  Body: PatchBackupSchedulerSettingsInput;
}

export interface ScheduledBackupParamsRequest {
  Params: ScheduledBackupParamsInput;
}

export interface PluginBackupInfo {
  id: string;
  name: string;
  version: string;
}

export interface BackupInfo {
  timestamp: number;
  platform: string;
  node: string;
  version: string;
  plugins: PluginBackupInfo[];
  localStorage: Partial<UiLocalStorage>;
}

export interface BackupStorage {
  backupDirectory: string;
  backupFile: string;
  backupFileName: string;
}

export type SupportedThemes = 'light' | 'dark';

export interface ConfigSettings {
  zoom: number; // 8 - 20
}

export interface ConsoleSettings {
  zoom: number; // 8 - 20
}

export type SettingsViews = 'account' | 'appearance' | 'user' | 'notifications' | 'recordings' | 'remote' | 'backup' | 'system';

export interface CamviewLayoutOverride {
  index: number;
  cameraId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CamviewSettings {
  dragDisabled?: boolean;
  viewid?: string;
  layouts?: Record<string, CamviewLayoutOverride[]>;
}

export interface CamerasSettings {
  showEvents: boolean;
  order?: string[]; // Camera IDs in custom order
  groupOrder?: Record<string, string[]>; // Per-room camera order for grouped view
  viewMode?: 'default' | 'grouped';
  dragDisabled: boolean;
}

export interface InterfaceSettinges {
  showBottomBarOnMobile: boolean;
  selectedSettingsView: SettingsViews;
  navbarStayCollapsed: boolean;
}

export interface UiSettingsLocalStorage {
  cameras: CamerasSettings;
  camview: CamviewSettings;
  config: ConfigSettings;
  console: ConsoleSettings;
  interface: InterfaceSettinges;
}

export interface ThemeLocalStorage {
  theme: SupportedThemes;
  autoMode: boolean;
}

export interface UiLocalStorage {
  ui: UiSettingsLocalStorage;
  theme: ThemeLocalStorage;
  language: UserLanguage;
}

export interface BackupRestoreRequest {
  Body: RestoreBackupInput;
}

export interface INpmPluginState {
  updateAvailable: boolean;
  betaUpdateAvailable: boolean;
  lastUpdated?: string;
  latestVersion?: string;
}

export interface INpmPerson {
  name?: string;
  email?: string;
  homepage?: string;
  username?: string;
  url?: string;
}

export interface IPackageJson {
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  keywords?: string[];
  homepage?: string;
  bugs?: string | { email?: string; url?: string };
  license?: string;
  author?: string | INpmPerson;
  maintainers?: INpmPerson[];
  contributors?: string[] | INpmPerson[];
  files?: string[];
  main?: string;
  bin?: string | Record<string, string>;
  repository?: string | { type: string; url: string };
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bundledDependencies?: string[];
  engines?: Record<string, string>;
  os?: string[];
  cpu?: string[];
  preferGlobal?: boolean;
  private?: boolean;
  publishConfig?: { registry?: string };
  exports?: Record<string, any>;
  type?: 'module';
  'camera.ui'?: PluginContract;
}

export interface INpmRegistryModule {
  _id: string;
  _rev: string;
  name: string;
  'dist-tags': {
    latest: string;
    [key: string]: string;
  };
  versions: Record<string, IPackageJson>;
  time: {
    created: string;
    modified: string;
    [key: string]: string;
  };
  maintainers: INpmPerson[];
  description: string;
  homepage: string;
  keywords: string[];
  repository: { type: string; url: string };
  author: INpmPerson;
  bugs: { email?: string; url?: string };
  license: string;
  readme: string;
  readmeFilename: string;
}

export interface INpmSearchResults {
  objects: INpmSearchResultItem[];
}

export interface INpmSearchResultItem {
  package: {
    name: string;
    scoped: string;
    version: string;
    description: string;
    keywords: string[];
    date: string;
    links: {
      npm: string;
      repository?: string;
      bugs?: string;
    };
    author: INpmPerson;
    publisher: INpmPerson;
    maintainers: INpmPerson[];
  };
  flags: {
    unstable: boolean;
  };
  score: {
    final: number;
    detail: {
      quality: number;
      popularity: number;
      maintenance: number;
    };
  };
  searchScore: number;
}

export interface PluginLinks {
  npm: string;
  homepage: string;
}

export interface PluginEngines {
  node: string;
  'camera.ui': string;
}

export interface EngineIssue {
  engine: 'camera.ui' | 'node';
  required: string;
  current: string;
}

export interface EngineCompatResult {
  compatible: boolean;
  issues: EngineIssue[];
  os?: string[];
  cpu?: string[];
  platformCompatible?: boolean;
}

export interface CameraUiPlugin {
  id: string;
  pluginName: string;
  private: boolean;
  displayName: string;
  description?: string;
  publicPackage?: boolean;
  installedVersion?: string;
  latestVersion?: string;
  lastUpdated?: string;
  availableVersions?: string[];
  installPath?: string;
  globalInstall?: boolean;
  disabled?: boolean;
  restartRequired?: boolean;
  links?: {
    npm?: string;
    homepage?: string;
    bugs?: string;
    repository?: string;
  };
  author?: string;
  engines?: {
    'camera.ui'?: string;
    node?: string;
  };
  trust?: 'official' | 'verified' | 'community';
  blocked?: { reason: string; ref?: string };
  category?: string;
  featured?: boolean;
  tagline?: string;
  logo?: string;
  screenshots?: string[];
  keywords?: string[];
  downloads?: { weekly?: number };
  license?: string;
  contract: PluginContract;
  isPython: boolean;
  isGo: boolean;
  isNode: boolean;
  os?: string[];
  cpu?: string[];
  compatible: boolean;
  engineIssues?: EngineIssue[];
  workerAgentId?: string;
}

export interface FrameWorker {
  name: string;
  status: PLUGIN_STATUS;
}

export interface ServerInfo extends DBServer {
  availableAddresses: UsableNetworkAddress[];
}

export interface RemoteInfo {
  remoteSettings: DBRemote;
  externalUrl: string | null;
  cloudflareTokenSet: boolean;
  directOverride: { active: boolean; fallback: boolean };
}

export interface RemoteRegistrationStatus {
  isRegistered: boolean;
  needsReauth: boolean;
  serverName?: string;
}

export interface RemoteUpdateServerNameRequest {
  Body: { name: string };
}

export interface RemoteTestRequest {
  Params: { mode: 'cloudflare' | 'customDomain' };
}

export interface DiscoveryPluginParamsRequest {
  Params: { pluginid: string };
}

export interface DiscoveryCameraParamsRequest {
  Params: { pluginid: string; discoveredid: string };
}

export interface InstanceParamsRequest {
  Params: { id: string };
}

export interface CreateInstanceRequest {
  Body: CreateInstanceInput;
}

export interface UpdateInstanceRequest {
  Body: UpdateInstanceInput;
}

export interface CreateShareBody {
  cameraId: string;
  sourceId: string;
  ttlHours: number;
  maxViewers: number;
  label?: string;
}

export interface ShareTokenParams {
  token: string;
}

export interface ValidateQuery {
  code: string;
}

export interface ListSharesQuery {
  camera?: string;
}

export interface CreateShareRequest {
  Body: CreateShareBody;
}

export interface ListShareRequest {
  Querystring: ListSharesQuery;
}

export interface ShareParamsRequest {
  Params: ShareTokenParams;
}

export interface ValidateShareRequest {
  Params: ShareTokenParams;
  Querystring: ValidateQuery;
}

export interface WorkerRestartRequest {
  Params: { agentId: string };
}

export interface WorkerAssignRequest {
  Body: { cameraId: string; agentId: string };
}

export interface WorkerUnassignRequest {
  Body: { cameraId: string };
}

export interface WorkerPairRequest {
  Body: { code: string; agentId: string; name: string };
}

export interface WorkerAssignPluginRequest {
  Body: { pluginName: string; agentId: string };
}

export interface WorkerUnassignPluginRequest {
  Body: { pluginName: string };
}

export interface WorkerConfigPatchRequest {
  Body: { enabled?: boolean; address?: string; port?: number };
}

export interface WorkerRemoveRequest {
  Params: { agentId: string };
}

export interface AutomationsParamsRequest {
  Params: { id: string };
}

export interface AutomationsParamsWebhookRequest {
  Params: { webhookId: string };
}

export interface AutomationsParamsGeofenceRequest {
  Params: { geofenceId: string };
}

export interface AutomationsCreateRequest {
  Body: CreateAutomationInput;
}

export interface AutomationsPatchRequest {
  Body: PatchAutomationInput;
}

export interface AutomationsImportRequest {
  Body: ImportBlueprintInput;
}

export interface AutomationsStoreQueryRequest {
  Querystring: { refresh?: boolean };
}

export interface AutomationsStoreParamsRequest {
  Params: { id: string };
}

export interface VirtualSensorsParamsRequest {
  Params: { id: string };
}

export interface VirtualSensorsCreateRequest {
  Body: CreateVirtualSensorInput;
}

export interface VirtualSensorsPatchRequest {
  Body: PatchVirtualSensorInput;
}

export interface DownloadParamsRequest {
  Params: { token: string };
}

export interface NotificationsSettingsRequest {
  Body: DBNotificationSettings;
}

export interface NotificationsRegisterDeviceRequest {
  Body: RegisterDeviceInput;
}

export interface NotificationsRevokeDeviceRequest {
  Params: { id: string };
}

export interface NotificationsUpdateDeviceRequest {
  Params: { id: string };
  Body: Record<string, unknown>;
}

export interface RemotePairPollRequest {
  Body: PairPollInput;
}
