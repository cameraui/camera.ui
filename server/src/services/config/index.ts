import { getUserHomeDir, PidRegistry } from '@camera.ui/common/node';
import { APP_SERVER_NAME, IS_DEV, IS_DOCKER, IS_ELECTRON, mergeWith, structuredClone } from '@camera.ui/common/utils';
import { go2rtcPath } from '@camera.ui/go2rtc';
import { natsServerPath } from '@camera.ui/nats';
import { tunnelPath } from '@camera.ui/tunnel';
import { copySync, emptyDirSync, ensureDirSync, ensureFileSync, moveSync, pathExistsSync, readJsonSync, removeSync, writeJsonSync } from 'fs-extra/esm';
import { dump, load } from 'js-yaml';
import { ffmpegPath, isFfmpegAvailable } from 'node-av';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform, release, tmpdir, type } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';

import { patchConfigSchema } from '../../api/schemas/config.schema.js';
import { patchGo2RtcSchema } from '../../api/schemas/go2rtc.schema.js';
import { CertificateGeneration } from '../../api/utils/cert.js';
import { CUSTOM_CERT_FILENAME, CUSTOM_KEY_FILENAME, HOST_CERT_FILENAME, HOST_KEY_FILENAME, ROOT_CERT_FILENAME, ROOT_KEY_FILENAME } from '../../api/utils/constants.js';
import { customCertificatePaths } from '../../api/utils/custom-cert.js';
import { inject, provide, tryInject } from '../../container.js';
import { MIN_NODE_VERSION } from '../../utils/engines.js';
import { announceUpdateChannel } from '../../utils/ipc.js';
import { execSafePath } from '../../utils/path.js';
import { newBackupKey, parseBackupKey } from './backup-archive.js';
import { DEFAULT_CONFIG, DEFAULT_GO2RTC_CONFIG, DEFAULT_ICE_SERVERS, ELECTRON_ASAR_UNPACKED } from './constants.js';
import { NEW_INSTALL_RTSP_USERNAME } from './defaults.js';
import { dropKey, readKey, writeKey } from './platform-values.js';
import { PROXY_AUTH_ENVIRONMENT, resolveProxyAuth } from './proxy-auth.js';
import { runPendingRestore } from './restore.js';

import type { LoggerOptions } from '@camera.ui/common/logger';
import type { PidRegistryEntry } from '@camera.ui/common/node';
import type { IceServer } from '@camera.ui/sdk/internal';
import type { DeepPartial } from '../../types.js';
import type { LoggerService } from '../logger/index.js';
import type { ProxyAuthSettings } from './proxy-auth.js';
import type { RestorePaths } from './restore.js';
import type { ConfigServiceOptions, EnvironmentInfo, Go2RtcConfig, IConfig, Secrets, SSLConfig } from './types.js';

const __require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = __require('../../../package.json');

const ENVIRONMENT_SETTINGS: Record<string, string> = {
  CAMERA_UI_PORT: 'port',
  CAMERA_UI_INSECURE_PORT: 'insecurePort',
  CAMERA_UI_TRUSTED_PROXIES: 'trustedProxies',
  CAMERA_UI_CLOUDFLARED_PROTOCOL: 'cloudflaredProtocol',
  CAMERA_UI_WORKERS_ENABLED: 'workers.enabled',
  CAMERA_UI_WORKERS_ADDRESS: 'workers.address',
  CAMERA_UI_WORKERS_PORT: 'workers.port',
  CAMERA_UI_WORKER_MASTER: 'worker.master',
  CAMERA_UI_WORKER_API_PORT: 'worker.apiPort',
  CAMERA_UI_WORKER_PAIRING_CODE: 'worker.pairingCode',
  CAMERA_UI_WORKER_NAME: 'worker.name',
  CAMERA_UI_WORKER_CAPABILITIES: 'worker.capabilities',
};

export class ConfigService {
  static get VERSION(): string {
    const pjson = readJsonSync(resolve(join(__dirname, '../../../package.json')));
    return pjson.version;
  }

  static readonly RUNNING_VERSION: string = packageJson.version;

  static get ENVIRONMENT(): EnvironmentInfo {
    return {
      development: IS_DEV,
      docker: IS_DOCKER,
      electron: IS_ELECTRON,
    };
  }

  static readonly NODE_VERSION = process.version;
  static readonly MIN_NODE_VERSION = MIN_NODE_VERSION;

  static readonly SERVER_PATH = resolve(join(__dirname, '../../../'));
  static readonly INTERFACE_SOURCE_PATH =
    IS_DEV && !IS_ELECTRON ? join(ConfigService.SERVER_PATH, 'dist', 'interface') : join(ConfigService.SERVER_PATH, '..', 'interface');

  readonly SECRETS!: Secrets;

  readonly HOME_PATH: string;
  readonly STORAGE_PATH: string;
  readonly LOGS_PATH: string;
  readonly PIDS_FILE: string;
  readonly DATABASE_PATH: string;
  readonly USERS_STORAGE_PATH: string;
  readonly INTERFACE_CACHE_PATH: string;
  readonly TMP_PATH: string;

  readonly CERTS_PATH: string;
  readonly CUSTOM_CERTS_PATH: string;
  readonly HOST_CERT_FILE: string;
  readonly HOST_KEY_FILE: string;
  readonly ROOT_CERT_FILE: string;
  readonly ROOT_KEY_FILE: string;

  readonly PLUGINS_STORAGE_PATH: string;
  readonly PLUGINS_INSTALL_PATH: string;
  readonly RESTORE_PATH: string;
  readonly RESTORE_STAGING_PATH: string;
  readonly RESTORE_JOURNAL_FILE: string;
  readonly RESTORE_UPLOADS_PATH: string;
  readonly RESTORE_PREVIOUS_PATH: string;
  readonly RESTORE_PREVIOUS_INFO_FILE: string;
  readonly RESTORE_PREVIOUS_MOVE_FILE: string;
  readonly MOVE_FILE: string;
  readonly BACKUP_PACKING_PATH: string;
  readonly DEFAULT_BACKUPS_PATH: string;

  readonly REPORTS_FILE: string;
  readonly LOG_FILE: string;
  readonly CONFIG_FILE: string;
  readonly SECRETS_FILE: string;
  readonly GO2RTC_BINARY: string;
  readonly TUNNEL_BINARY: string;
  readonly GO2RTC_CONFIG_FILE: string;
  readonly NATS_BINARY: string;
  readonly BACKUP_INFO_FILE: string;
  readonly DEFAULTS_INSTALLED_FILE: string;
  readonly RESTORE_APPLIED_FILE: string;
  readonly RESET_PASSWORD_FILE: string;

  readonly UI_PORT = parseInt(process.env.CAMERA_UI_UI_PORT!);
  readonly INGRESS_TRUST_IP = process.env.CAMERA_UI_INGRESS_TRUST ?? undefined;
  readonly STREAM_URL_TOKEN = randomBytes(32).toString('base64url');

  private logger: LoggerService;
  private _config!: IConfig;
  private _go2rtcConfig!: Go2RtcConfig;
  private _ssl!: SSLConfig;
  private _proxyAuthBlock?: unknown;
  private _proxyAuth?: ProxyAuthSettings;
  private fileValues = new Map<string, unknown>();
  private _pidRegistry?: PidRegistry;
  private sslListeners?: Set<(ssl: SSLConfig) => void>;

  get ssl(): SSLConfig {
    return this._ssl;
  }

  get config(): IConfig {
    return this._config;
  }

  set config(newConfig: IConfig) {
    this.validateAndSetConfig(newConfig);
  }

  public get proxyAuth(): ProxyAuthSettings | undefined {
    return this._proxyAuth;
  }

  public get proxyAuthBlock(): unknown {
    return this._proxyAuthBlock;
  }

  get go2rtcConfig(): Go2RtcConfig {
    return this._go2rtcConfig;
  }

  set go2rtcConfig(newConfig: Go2RtcConfig) {
    this.validateAndSetGo2RtcConfig(newConfig);
  }

  get iceServers(): IceServer[] {
    return this._go2rtcConfig.webrtc.ice_servers ?? DEFAULT_ICE_SERVERS;
  }

  get DEFAULT_PLUGINS(): string[] {
    if (process.env.CAMERA_UI_DEFAULT_PLUGINS === undefined) {
      return ['@camera.ui/camera-ui-nvr'];
    }

    return process.env.CAMERA_UI_DEFAULT_PLUGINS.split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  get processes(): PidRegistryEntry[] {
    return this.pidRegistry.all;
  }

  get loggerOptions(): LoggerOptions {
    return {
      prefix: 'camera.ui',
      suffix: undefined,
      debugEnabled: this._config.logger?.level === 'debug' || this._config.logger?.level === 'trace',
      traceEnabled: this._config.logger?.level === 'trace',
    };
  }

  get go2rtcLoggerOptions(): LoggerOptions {
    return {
      prefix: 'Go2RTC',
      suffix: undefined,
      debugEnabled: this._go2rtcConfig.log?.level === 'debug' || this._go2rtcConfig.log?.level === 'trace',
      traceEnabled: this._go2rtcConfig.log?.level === 'trace',
    };
  }

  public get BACKUP_EXCLUDED_PATHS(): string[] {
    return [this.INTERFACE_CACHE_PATH, this.LOGS_PATH, this.LOG_FILE, this.PIDS_FILE, this.REPORTS_FILE, this.HOST_CERT_FILE, this.HOST_KEY_FILE];
  }

  public get RESTORE_PRESERVED_PATHS(): string[] {
    return [...this.BACKUP_EXCLUDED_PATHS, this.DEFAULT_BACKUPS_PATH, ...this.restorePaths.identity];
  }

  public get restorePaths(): RestorePaths {
    return {
      storage: this.STORAGE_PATH,
      root: this.RESTORE_PATH,
      staging: this.RESTORE_STAGING_PATH,
      previous: this.RESTORE_PREVIOUS_PATH,
      previousInfo: this.RESTORE_PREVIOUS_INFO_FILE,
      journal: this.RESTORE_JOURNAL_FILE,
      uploads: this.RESTORE_UPLOADS_PATH,
      backupInfo: this.BACKUP_INFO_FILE,
      applied: this.RESTORE_APPLIED_FILE,
      move: this.MOVE_FILE,
      previousMove: this.RESTORE_PREVIOUS_MOVE_FILE,
      identity: [this.ROOT_CERT_FILE, this.ROOT_KEY_FILE],
    };
  }

  public get ENVIRONMENT_SETTINGS(): string[] {
    return Object.entries(ENVIRONMENT_SETTINGS)
      .filter(([name]) => process.env[name] !== undefined)
      .map(([, setting]) => setting);
  }

  public get ENVIRONMENT_VARIABLES(): Record<string, string> {
    const settings = Object.entries(ENVIRONMENT_SETTINGS)
      .filter(([name]) => process.env[name] !== undefined)
      .map(([name, setting]) => [setting, name]);
    const proxyAuth = Object.entries(PROXY_AUTH_ENVIRONMENT)
      .filter(([, name]) => process.env[name]?.trim())
      .map(([key, name]) => [`proxyAuth.${key}`, name]);
    return Object.fromEntries([...settings, ...proxyAuth]);
  }

  public get STAGED_VERSION(): string | undefined {
    const serverPath = join(this.HOME_PATH, 'server');
    if (existsSync(join(serverPath, '.staging.lock'))) return undefined;
    try {
      return readJsonSync(join(serverPath, '.staging', 'node_modules', APP_SERVER_NAME, 'package.json')).version;
    } catch {
      return undefined;
    }
  }

  constructor(homePath?: string, options: ConfigServiceOptions = {}) {
    provide('configService', this);

    this.logger = inject('logger');

    this.HOME_PATH = ConfigService.resolveHomePath(homePath);

    const tmpBase = process.getuid ? `.camera.ui-${process.getuid()}` : '.camera.ui';
    this.TMP_PATH = join(tmpdir(), tmpBase, createHash('sha256').update(this.HOME_PATH).digest('hex').slice(0, 8));
    this.STORAGE_PATH = join(this.HOME_PATH, 'volume');
    this.LOGS_PATH = join(this.STORAGE_PATH, 'logs');
    this.PIDS_FILE = join(this.STORAGE_PATH, 'camera.ui.pids');
    this.REPORTS_FILE = join(this.STORAGE_PATH, 'camera.ui.report.yaml');
    this.GO2RTC_CONFIG_FILE = join(this.STORAGE_PATH, 'go2rtc.yaml');
    this.CONFIG_FILE = join(this.STORAGE_PATH, 'camera.ui.yaml');
    this.BACKUP_INFO_FILE = join(this.STORAGE_PATH, 'camera.ui.backup.json');
    this.DEFAULTS_INSTALLED_FILE = join(this.STORAGE_PATH, '.camera.ui.defaults-installed');
    this.RESTORE_APPLIED_FILE = join(this.STORAGE_PATH, '.restore-applied');
    this.RESET_PASSWORD_FILE = join(this.STORAGE_PATH, 'reset-password');
    this.DATABASE_PATH = join(this.STORAGE_PATH, 'database');
    this.USERS_STORAGE_PATH = join(this.STORAGE_PATH, 'users');
    this.INTERFACE_CACHE_PATH = join(this.STORAGE_PATH, 'interface');

    this.CERTS_PATH = join(this.STORAGE_PATH, 'certs');
    this.CUSTOM_CERTS_PATH = join(this.CERTS_PATH, 'custom');
    this.HOST_CERT_FILE = join(this.CERTS_PATH, HOST_CERT_FILENAME);
    this.HOST_KEY_FILE = join(this.CERTS_PATH, HOST_KEY_FILENAME);
    this.ROOT_CERT_FILE = join(this.CERTS_PATH, ROOT_CERT_FILENAME);
    this.ROOT_KEY_FILE = join(this.CERTS_PATH, ROOT_KEY_FILENAME);

    this.PLUGINS_STORAGE_PATH = join(this.STORAGE_PATH, 'plugins', 'storage');
    this.PLUGINS_INSTALL_PATH = join(this.HOME_PATH, 'plugins');
    this.RESTORE_PATH = join(this.HOME_PATH, 'restore');
    this.RESTORE_STAGING_PATH = join(this.RESTORE_PATH, 'staging');
    this.RESTORE_JOURNAL_FILE = join(this.RESTORE_PATH, 'state.json');
    this.RESTORE_UPLOADS_PATH = join(this.RESTORE_PATH, 'uploads');
    this.RESTORE_PREVIOUS_PATH = join(this.RESTORE_PATH, 'previous');
    this.RESTORE_PREVIOUS_INFO_FILE = join(this.RESTORE_PATH, 'previous.json');
    this.RESTORE_PREVIOUS_MOVE_FILE = join(this.RESTORE_PATH, 'previous-move.json');
    this.MOVE_FILE = join(this.RESTORE_PATH, 'move.json');
    this.BACKUP_PACKING_PATH = join(this.RESTORE_PATH, 'packing');
    this.DEFAULT_BACKUPS_PATH = join(this.STORAGE_PATH, 'backups');

    this.GO2RTC_BINARY = go2rtcPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);
    this.TUNNEL_BINARY = tunnelPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);
    this.NATS_BINARY = natsServerPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);

    this.SECRETS_FILE = join(this.STORAGE_PATH, '.camera.ui.secrets');
    this.LOG_FILE = join(this.STORAGE_PATH, 'camera.ui.log');

    if (options.applyPendingRestore) {
      this.applyPendingRestore();
    }

    this.SECRETS = this.updateSecrets();

    this.createDirs();
    this.migrateCertificates();
    this.read();
    this.logStart();
  }

  public static resolveHomePath(homePath?: string): string {
    if (homePath) return resolve(homePath);
    return IS_DEV ? join(__dirname, '..', '..', '..', '..', '.camera.ui') : join(getUserHomeDir(), '.camera.ui');
  }

  public reissueSslCertificate(): void {
    this.updateSsl();
  }

  public readWorkerConfig(): IConfig['worker'] {
    try {
      return this.readConfig().worker;
    } catch {
      return this._config.worker;
    }
  }

  public refreshHostCertificate(newRoot = false): void {
    removeSync(this.HOST_CERT_FILE);
    removeSync(this.HOST_KEY_FILE);
    if (newRoot) {
      removeSync(this.ROOT_CERT_FILE);
      removeSync(this.ROOT_KEY_FILE);
    }
    this.updateSsl();
  }

  public onSslChange(listener: (ssl: SSLConfig) => void): () => void {
    (this.sslListeners ??= new Set()).add(listener);
    return () => {
      this.sslListeners?.delete(listener);
    };
  }

  public writeConfig(newConfig?: DeepPartial<IConfig>): void {
    if (newConfig) {
      this.mergeAndValidate(this._config, newConfig);
    }

    const content = structuredClone(this._config) as unknown as Record<string, unknown>;
    // an environment value holds for this run only, the file keeps its own
    for (const [setting, value] of this.fileValues) {
      if (value === undefined) dropKey(content, setting);
      else writeKey(content, setting, value);
    }
    if (this._proxyAuthBlock !== undefined) content.proxyAuth = this._proxyAuthBlock;
    writeFileSync(this.CONFIG_FILE, dump(content, { lineWidth: -1, noRefs: true }));

    announceUpdateChannel(this._config.betaUpdates ?? false);
  }

  public writeProxyAuth(block: unknown): void {
    this._proxyAuthBlock = block;
    this.resolveProxyAuthSettings();
    this.writeConfig();
  }

  private async updateGo2RtcConfigCommon(newConfig?: DeepPartial<Go2RtcConfig>, writeMethod: 'file' | 'api' = 'file'): Promise<void> {
    if (newConfig) {
      this.mergeAndValidate(this._go2rtcConfig, newConfig);
    }

    if (this._go2rtcConfig.streams && Object.keys(this._go2rtcConfig.streams).length === 0) {
      delete this._go2rtcConfig.streams;
    }

    if (this._go2rtcConfig.preload && Object.keys(this._go2rtcConfig.preload).length === 0) {
      delete this._go2rtcConfig.preload;
    }

    if (writeMethod === 'api') {
      const go2rtcApi = inject('go2rtcApi');
      await go2rtcApi.configRoute.rewriteConfig(this._go2rtcConfig);
    } else {
      writeFileSync(this.GO2RTC_CONFIG_FILE, dump(this._go2rtcConfig, { lineWidth: -1, noRefs: true }));
    }
  }

  public async refreshGo2RtcCertificate(): Promise<void> {
    this.validateAndSetGo2RtcConfig(this._go2rtcConfig);
    await this.writeGo2RtcConfigFile();
  }

  public async writeGo2RtcConfigFile(newConfig?: DeepPartial<Go2RtcConfig>): Promise<void> {
    await this.updateGo2RtcConfigCommon(newConfig, 'file');
  }

  public async writeGo2RtcConfigApi(newConfig?: DeepPartial<Go2RtcConfig>): Promise<void> {
    await this.updateGo2RtcConfigCommon(newConfig, 'api');
  }

  public patchGo2RtcConfig(patch: DeepPartial<Go2RtcConfig>): void {
    this.mergeAndValidate(this._go2rtcConfig, patch);
  }

  public async mergeGo2RtcConfig(): Promise<void> {
    const fileConfig = this.parseYaml<Go2RtcConfig>(readFileSync(this.GO2RTC_CONFIG_FILE, 'utf-8'));
    if (fileConfig) {
      this.validateAndSetGo2RtcConfig(fileConfig);
    }

    const db = tryInject('dbs');

    await db?.updateCameras();
    const onvifChanged = db?.syncOnvifVideoSources();
    db?.syncCamerasToGo2RtcConfig();

    if (onvifChanged) {
      await this.writeGo2RtcConfigApi();
    }
  }

  public async updateGo2RtcWebRtcFilter(serverAddresses: string[] = [], oldAddresses: string[] = [], api?: boolean): Promise<void> {
    const webRtcConfig = this._go2rtcConfig.webrtc;

    webRtcConfig.filters ??= {};
    webRtcConfig.filters.candidates ??= [];

    if (oldAddresses.length) {
      webRtcConfig.filters.candidates = webRtcConfig.filters.candidates.filter((address) => !oldAddresses.includes(address));
    }

    if (serverAddresses.length) {
      for (const address of serverAddresses) {
        if (!webRtcConfig.filters.candidates.includes(address)) {
          webRtcConfig.filters.candidates.push(address);
        }
      }
    } else {
      webRtcConfig.filters.candidates = [];
    }

    if (webRtcConfig.filters.ips?.length) {
      const ours = new Set([...serverAddresses, ...oldAddresses]);
      webRtcConfig.filters.ips = webRtcConfig.filters.ips.filter((address: string) => !ours.has(address));
    }

    this.cleanupWebRtcFilters(webRtcConfig);

    if (api) {
      await this.writeGo2RtcConfigApi({ webrtc: webRtcConfig });
    } else {
      await this.writeGo2RtcConfigFile({ webrtc: webRtcConfig });
    }
  }

  public async reset(): Promise<void> {
    this.logger.attention('Resetting camera.ui...');

    this.safetyEmptyDir(this.STORAGE_PATH);
    this.safetyEmptyDir(this.PLUGINS_INSTALL_PATH);
  }

  private get pidRegistry(): PidRegistry {
    this._pidRegistry ??= new PidRegistry(this.PIDS_FILE);
    return this._pidRegistry;
  }

  private cleanupWebRtcFilters(webRtcConfig: any): void {
    for (const key of ['candidates', 'ips', 'networks', 'interfaces', 'udp_ports']) {
      if (!webRtcConfig.filters[key]?.length) {
        delete webRtcConfig.filters[key];
      }
    }

    if (Object.keys(webRtcConfig.filters).length === 0) {
      delete webRtcConfig.filters;
    }
  }

  public addProcess(proc: PidRegistryEntry): PidRegistryEntry {
    return this.pidRegistry.add(proc);
  }

  public removeProcessByPID(pid?: number): void {
    this.pidRegistry.remove(pid);
  }

  public flushProcesses(): Promise<void> {
    return this.pidRegistry.flush();
  }

  public go2rtcAddress(mod: 'api' | 'rtsp' | 'onvif' | 'srtp' | 'rtmp' | 'webrtc' | 'ws' = 'api'): string {
    let go2rtcPort: number;
    let protocol: string | undefined;

    const isTls = this._go2rtcConfig.api.listen === '';

    if (mod === 'onvif' && !this._go2rtcConfig.onvif.listen) {
      return '';
    }

    if (mod === 'api' || mod === 'ws') {
      const listen = isTls ? this._go2rtcConfig.api.tls_listen : this._go2rtcConfig.api.listen;
      go2rtcPort = parseInt(listen.split(':')[1], 10);
    } else {
      go2rtcPort = parseInt(this._go2rtcConfig[mod].listen.split(':')[1], 10);
    }

    if (!protocol) {
      switch (mod) {
        case 'api':
        case 'webrtc':
          protocol = isTls ? 'https' : 'http';
          break;
        case 'ws':
          protocol = isTls ? 'wss' : 'ws';
          break;
        case 'rtsp':
          protocol = 'rtsp';
          break;
        case 'onvif':
          protocol = 'onvif';
          break;
        case 'srtp':
          protocol = 'srtp';
          break;
        case 'rtmp':
          protocol = 'rtmp';
          break;
        default:
          protocol = 'http';
          break;
      }
    }

    return `${protocol}://127.0.0.1:${go2rtcPort}`;
  }

  public cameraURLExists(cameraUrl: string): boolean {
    const url = new URL(cameraUrl);
    const host = url.host;
    const port = url.port;

    const sources = this._go2rtcConfig.streams ?? {};
    const urls = Object.values(sources)
      .filter((source) => source)
      .map((source) => source!)
      .flat();

    return urls.some((url) => {
      if (!host) {
        return host === url;
      }

      const u = new URL(url);
      return u.host === host && u.port === port;
    });
  }

  private validateAndSetConfig(newConfig: IConfig): void {
    try {
      const config = patchConfigSchema.parse(newConfig);
      this._config = config;
    } catch (error: any) {
      if (error instanceof ZodError) {
        this.logger.error('Invalid camera.ui config!');
        throw error;
      }

      this.logger.error('Failed to parse camera.ui config!');
      throw error;
    }
  }

  private validateAndSetGo2RtcConfig(newConfig: Go2RtcConfig): void {
    if (!newConfig.streams || newConfig.streams === null) {
      delete newConfig.streams;
    }

    if (!newConfig.preload || newConfig.preload === null) {
      delete newConfig.preload;
    }

    try {
      const config = patchGo2RtcSchema.parse(newConfig);
      this._go2rtcConfig = this.updateGo2RtcConfig(config);
    } catch (error: any) {
      if (error instanceof ZodError) {
        this.logger.error('Invalid go2rtc config!');
        throw error;
      }

      this.logger.error('Failed to parse go2rtc config!');
      throw error;
    }
  }

  private mergeAndValidate<T>(target: T, source: DeepPartial<T>): void {
    mergeWith(target, source, (sourceVal: any, targetVal: any) => {
      if (Array.isArray(sourceVal)) {
        return targetVal;
      }
    });
  }

  private read() {
    this.updateConfig();
    this.writeConfig();
    this.writeGo2RtcConfigFile();
  }

  private applyPendingRestore(): void {
    ensureDirSync(this.RESTORE_PATH);
    runPendingRestore(this.restorePaths, this.RESTORE_PRESERVED_PATHS, this.logger);
  }

  private defaultConfig(): IConfig {
    return patchConfigSchema.parse(structuredClone(DEFAULT_CONFIG));
  }

  private defaultGo2RtcConfig(): Go2RtcConfig {
    const defaultConfig = structuredClone(DEFAULT_GO2RTC_CONFIG);
    defaultConfig.api.tls_cert = this.HOST_CERT_FILE;
    defaultConfig.api.tls_key = this.HOST_KEY_FILE;
    defaultConfig.api.tls_ca = this.ROOT_CERT_FILE;
    return patchGo2RtcSchema.parse(defaultConfig);
  }

  private parseYaml<T>(content: string): T | undefined {
    return content.trim() ? (load(content) as T) : undefined;
  }

  private readConfig(): IConfig {
    let config = this.defaultConfig();
    this._proxyAuthBlock = undefined;

    if (pathExistsSync(this.CONFIG_FILE)) {
      let configFileData = this.parseYaml<IConfig>(readFileSync(this.CONFIG_FILE, 'utf-8'));

      if (configFileData) {
        this._proxyAuthBlock = (configFileData as { proxyAuth?: unknown }).proxyAuth;
        configFileData = this.cleanupConfig(config, configFileData);

        config = mergeWith(this.defaultConfig(), configFileData, (source: any, target: any) => {
          if (Array.isArray(source)) {
            return target;
          }
        });
      }
    }

    this.fileValues = new Map(this.ENVIRONMENT_SETTINGS.map((setting) => [setting, readKey(config as unknown as Record<string, unknown>, setting)]));
    config = this.applyEnvOverrides(config);

    return config;
  }

  private applyEnvOverrides(config: IConfig): IConfig {
    if (process.env.CAMERA_UI_PORT) config.port = parseInt(process.env.CAMERA_UI_PORT, 10);
    if (process.env.CAMERA_UI_INSECURE_PORT) config.insecurePort = parseInt(process.env.CAMERA_UI_INSECURE_PORT, 10);
    if (process.env.CAMERA_UI_TRUSTED_PROXIES) {
      config.trustedProxies = process.env.CAMERA_UI_TRUSTED_PROXIES.split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    }
    if (process.env.CAMERA_UI_CLOUDFLARED_PROTOCOL) config.cloudflaredProtocol = process.env.CAMERA_UI_CLOUDFLARED_PROTOCOL;

    config.workers ??= {};
    if (process.env.CAMERA_UI_WORKERS_ENABLED !== undefined) config.workers.enabled = process.env.CAMERA_UI_WORKERS_ENABLED === 'true';
    if (process.env.CAMERA_UI_WORKERS_ADDRESS) config.workers.address = process.env.CAMERA_UI_WORKERS_ADDRESS;
    if (process.env.CAMERA_UI_WORKERS_PORT) config.workers.port = parseInt(process.env.CAMERA_UI_WORKERS_PORT, 10);

    config.worker ??= {};
    if (process.env.CAMERA_UI_WORKER_MASTER) config.worker.master = process.env.CAMERA_UI_WORKER_MASTER;
    if (process.env.CAMERA_UI_WORKER_API_PORT) config.worker.apiPort = parseInt(process.env.CAMERA_UI_WORKER_API_PORT, 10);
    if (process.env.CAMERA_UI_WORKER_PAIRING_CODE) config.worker.pairingCode = process.env.CAMERA_UI_WORKER_PAIRING_CODE;
    if (process.env.CAMERA_UI_WORKER_NAME) config.worker.name = process.env.CAMERA_UI_WORKER_NAME;
    if (process.env.CAMERA_UI_WORKER_CAPABILITIES) {
      config.worker.capabilities = process.env.CAMERA_UI_WORKER_CAPABILITIES.split(',')
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return config;
  }

  private readGo2RtcConfig(): Go2RtcConfig {
    let go2rtcConfig = this.defaultGo2RtcConfig();

    const configFileData = pathExistsSync(this.GO2RTC_CONFIG_FILE) ? this.parseYaml<Go2RtcConfig>(readFileSync(this.GO2RTC_CONFIG_FILE, 'utf-8')) : undefined;

    if (configFileData) {
      go2rtcConfig = mergeWith(go2rtcConfig, configFileData, (source: any, target: any) => {
        if (Array.isArray(source)) {
          return target;
        }
      });
    } else {
      // a new install gets its own restream login, the file keeps it from then on
      go2rtcConfig.rtsp.username = NEW_INSTALL_RTSP_USERNAME;
      go2rtcConfig.rtsp.password = randomBytes(12).toString('base64url');
    }

    return this.updateGo2RtcConfig(go2rtcConfig);
  }

  private cleanupConfig(config: IConfig, newConfig: IConfig): IConfig {
    const schemaKeys = new Set(Object.keys(patchConfigSchema.shape));
    for (const key in newConfig) {
      if ((config as any)[key] === undefined) {
        if (!schemaKeys.has(key)) delete (newConfig as any)[key];
      } else if (Object.keys((newConfig as any)[key]).length > 0) {
        const keys = Object.keys((newConfig as any)[key]);
        for (const k of keys) {
          if ((config as any)[key][k] === undefined) {
            delete (newConfig as any)[key][k];
          }
        }
      }
    }

    return newConfig;
  }

  private updateConfig(): void {
    this.validateAndSetConfig(this.readConfig());
    this.resolveProxyAuthSettings();
    this.validateAndSetGo2RtcConfig(this.readGo2RtcConfig());
    this._ssl = this.readSSL();

    this.logger.debugEnabled = this._config.logger?.level === 'debug' || this._config.logger?.level === 'trace';
    this.logger.traceEnabled = this._config.logger?.level === 'trace';
  }

  private resolveProxyAuthSettings(): void {
    this._proxyAuth = resolveProxyAuth(this._proxyAuthBlock, process.env, [this._config.port, this._config.insecurePort], (message) => this.logger.warn(message));
  }

  private updateGo2RtcConfig(go2rtcConfig: Go2RtcConfig): Go2RtcConfig {
    const config = structuredClone(go2rtcConfig);

    config.api.listen = '';
    config.api.origin = '*';

    const custom = customCertificatePaths(this);
    config.api.tls_cert = custom?.certFile ?? this.HOST_CERT_FILE;
    config.api.tls_key = custom?.keyFile ?? this.HOST_KEY_FILE;
    config.api.tls_ca = custom ? '' : this.ROOT_CERT_FILE;

    const customFfmpeg = this.config.ffmpegPath?.trim();
    const bundledFfmpeg = isFfmpegAvailable() ? ffmpegPath().replace('app.asar', ELECTRON_ASAR_UNPACKED) : undefined;

    if (customFfmpeg && existsSync(customFfmpeg)) {
      config.ffmpeg.bin = execSafePath(customFfmpeg);
    } else if (bundledFfmpeg) {
      config.ffmpeg.bin = execSafePath(bundledFfmpeg);
    } else {
      config.ffmpeg.bin = platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    }

    config.webrtc.filters ??= {};

    if (!config.streams) {
      delete config.streams;
    }

    if (!config.preload) {
      delete config.preload;
    }

    if (!config.webrtc.candidates?.length) {
      delete config.webrtc.candidates;
    }

    this.cleanupWebRtcFilters(config.webrtc);

    return config;
  }

  private updateSsl(): void {
    const previous = this._ssl;
    this._ssl = this.readSSL();
    if (previous?.cert.equals(this._ssl.cert)) return;
    for (const listener of this.sslListeners ?? []) listener(this._ssl);
  }

  private readSSL(): SSLConfig {
    const { cert, key, ca } = CertificateGeneration.generateCert();

    return {
      cert: Buffer.from(cert),
      key: Buffer.from(key),
      ca: Buffer.from(ca),
    };
  }

  private updateSecrets(): Secrets {
    const createSecrets = (): Secrets => {
      const secrets: Secrets = {
        jwtAccessKey: randomBytes(32).toString('hex'),
        jwtRefreshKey: randomBytes(32).toString('hex'),
        jwt2faKey: randomBytes(32).toString('hex'),
        twoFactorKey: randomBytes(32).toString('hex'),
        backupKey: newBackupKey(),
      };

      writeJsonSync(this.SECRETS_FILE, secrets, { spaces: 2 });

      return secrets;
    };

    if (pathExistsSync(this.SECRETS_FILE)) {
      try {
        const secrets: Secrets = readJsonSync(this.SECRETS_FILE);

        if (!secrets.jwtAccessKey || !secrets.jwtRefreshKey) {
          return createSecrets();
        }

        // older installations lack the 2FA secrets
        let needsUpdate = false;
        if (!secrets.jwt2faKey) {
          secrets.jwt2faKey = randomBytes(32).toString('hex');
          needsUpdate = true;
        }
        if (!secrets.twoFactorKey) {
          secrets.twoFactorKey = randomBytes(32).toString('hex');
          needsUpdate = true;
        }
        if (!secrets.backupKey || !parseBackupKey(secrets.backupKey)) {
          secrets.backupKey = newBackupKey();
          needsUpdate = true;
        }
        if (needsUpdate) {
          writeJsonSync(this.SECRETS_FILE, secrets, { spaces: 2 });
        }

        return secrets;
      } catch {
        return createSecrets();
      }
    } else {
      return createSecrets();
    }
  }

  private createDirs(): void {
    this.safetyEmptyDir(this.TMP_PATH);
    this.safetyEnsureDir(this.HOME_PATH);
    this.safetyEnsureDir(this.LOGS_PATH);
    this.safetyEnsureDir(this.STORAGE_PATH);
    this.safetyEnsureDir(this.USERS_STORAGE_PATH);
    this.safetyEnsureDir(this.PLUGINS_STORAGE_PATH);
    this.safetyEnsureDir(this.PLUGINS_INSTALL_PATH);
    this.safetyEnsureDir(this.DATABASE_PATH);
    this.safetyEnsureDir(this.INTERFACE_CACHE_PATH);
    this.safetyEnsureDir(this.CERTS_PATH);
    this.safetyEnsureDir(this.CUSTOM_CERTS_PATH);
    this.safetyEnsureFile(this.CONFIG_FILE);
    this.safetyEnsureFile(this.GO2RTC_CONFIG_FILE);
    this.safetyEnsureFile(this.SECRETS_FILE);
    this.safetyEnsureFile(this.LOG_FILE);
    this.safetyEnsureFile(this.REPORTS_FILE);
    this.safetyEnsureFile(this.PIDS_FILE);
  }

  private migrateCertificates(): void {
    const disposable: [string, string][] = [
      [join(this.STORAGE_PATH, HOST_CERT_FILENAME), this.HOST_CERT_FILE],
      [join(this.STORAGE_PATH, HOST_KEY_FILENAME), this.HOST_KEY_FILE],
    ];

    const identity: [string, string][] = [
      [join(this.STORAGE_PATH, ROOT_CERT_FILENAME), this.ROOT_CERT_FILE],
      [join(this.STORAGE_PATH, ROOT_KEY_FILENAME), this.ROOT_KEY_FILE],
    ];

    for (const [from, to] of identity) {
      if (!existsSync(from) || existsSync(to)) continue;
      try {
        moveSync(from, to);
      } catch (error: any) {
        throw new Error(`Could not move the instance CA to ${this.CERTS_PATH}: ${error.message}`);
      }
    }

    for (const [from, to] of disposable) {
      if (!existsSync(from) || existsSync(to)) continue;
      try {
        moveSync(from, to);
      } catch {
        // re-issued from the CA on the next read
      }
    }

    this.adoptConfiguredCertificate();
  }

  private adoptConfiguredCertificate(): void {
    if (!pathExistsSync(this.CONFIG_FILE)) return;

    const raw = this.parseYaml<{ ssl?: { certFile?: string; keyFile?: string } }>(readFileSync(this.CONFIG_FILE, 'utf-8'));
    const certFile = raw?.ssl?.certFile;
    const keyFile = raw?.ssl?.keyFile;

    if (!certFile || !keyFile) return;
    if (certFile.startsWith(this.STORAGE_PATH) || !existsSync(certFile) || !existsSync(keyFile)) return;
    if (existsSync(join(this.CUSTOM_CERTS_PATH, CUSTOM_CERT_FILENAME))) return;

    try {
      copySync(certFile, join(this.CUSTOM_CERTS_PATH, CUSTOM_CERT_FILENAME));
      copySync(keyFile, join(this.CUSTOM_CERTS_PATH, CUSTOM_KEY_FILENAME));
      this.logger.log(`Moved the certificate from the old ssl config into ${this.CUSTOM_CERTS_PATH}, it is served for the names it covers`);
    } catch (error: any) {
      this.logger.warn(`Could not adopt the certificate from the old ssl config: ${error.message}`);
    }
  }

  private safetyEnsureDir(dir: string): void {
    try {
      ensureDirSync(dir);
    } catch (error: any) {
      if (error.code === 'EACCES') {
        this.logger.warn(`Failed to create directory: ${dir}`);
        this.logger.warn(`Please make sure the user "${process.env.USER}" has the correct permissions`);
        this.logger.warn(`EXAMPLE: sudo chown -R ${process.env.USER}:${process.env.USER} ${dir}`);
      }

      throw error;
    }
  }

  private safetyEmptyDir(dir: string): void {
    try {
      emptyDirSync(dir);
    } catch (error: any) {
      if (error.code === 'EACCES') {
        this.logger.warn(`Failed to empty directory: ${dir}`);
        this.logger.warn(`Please make sure the user "${process.env.USER}" has the correct permissions`);
        this.logger.warn(`EXAMPLE: sudo chown -R ${process.env.USER}:${process.env.USER} ${dir}`);
      }

      throw error;
    }
  }

  private safetyEnsureFile(file: string): void {
    try {
      ensureFileSync(file);
    } catch (error: any) {
      if (error.code === 'EACCES') {
        this.logger.warn(`Failed to create file: ${file}`);
        this.logger.warn(`Please make sure the user "${process.env.USER}" has the correct permissions`);
        this.logger.warn(`EXAMPLE: sudo chown ${process.env.USER}:${process.env.USER} ${file}`);
      }

      throw error;
    }
  }

  private logStart(): void {
    this.logger.log('---');
    this.logger.log(`Initializing camera.ui with PID: ${process.pid}`);
    this.logger.log('---');
    this.logger.log(`camera.ui Home Path: ${this.HOME_PATH}`);
    this.logger.log(`camera.ui Storage Path: ${this.STORAGE_PATH}`);
    this.logger.log(`camera.ui Config Path: ${this.CONFIG_FILE}`);
    this.logger.log(`Go2RTC Binary Path: ${this.GO2RTC_BINARY}`);
    this.logger.log(`Go2RTC Config Path ${this.GO2RTC_CONFIG_FILE}`);
    this.logger.log(`Tunnel Client Binary Path: ${this.TUNNEL_BINARY}`);
    this.logger.log(`Nats Binary Path: ${this.NATS_BINARY}`);
    this.logger.log(`Plugins Storage Path: ${this.PLUGINS_STORAGE_PATH}`);
    this.logger.log(`Plugins Install Path: ${this.PLUGINS_INSTALL_PATH}`);
    this.logger.log('---');
    this.logger.log(`OS: ${type()} ${release()} ${arch()}`);
    this.logger.log(`Node.js ${process.version} ${process.execPath}`);
    this.logger.log(`User: ${process.env.USER ?? process.env.USERNAME}`);
    this.logger.log('Environment:', ConfigService.ENVIRONMENT);
    this.logger.log('---');
  }
}
