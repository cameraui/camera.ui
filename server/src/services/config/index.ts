import { getUserHomeDir } from '@camera.ui/common/node';
import { IS_DEV, IS_DOCKER, IS_ELECTRON, isEqual, mergeWith, structuredClone } from '@camera.ui/common/utils';
import { go2rtcPath } from '@camera.ui/go2rtc';
import { natsServerPath } from '@camera.ui/nats';
import { tunnelPath } from '@camera.ui/tunnel';
import { emptyDirSync, ensureDirSync, ensureFileSync, pathExistsSync, readJsonSync, removeSync, writeJsonSync } from 'fs-extra/esm';
import { dump, load } from 'js-yaml';
import { ffmpegPath, isFfmpegAvailable } from 'node-av';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, platform, release, tmpdir, type } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { container } from 'tsyringe';
import { ZodError } from 'zod';

import { patchConfigSchema } from '../../api/schemas/config.schema.js';
import { patchGo2RtcSchema } from '../../api/schemas/go2rtc.schema.js';
import { CertificateGeneration } from '../../api/utils/cert.js';
import { HOST_CERT_FILENAME, HOST_KEY_FILENAME, OLD_ROOT_CERT_FILENAME, OLD_ROOT_KEY_FILENAME, ROOT_CERT_FILENAME } from '../../api/utils/constants.js';
import { DEFAULT_CONFIG, DEFAULT_GO2RTC_CONFIG, ELECTRON_ASAR_UNPACKED } from './constants.js';

import type { LoggerOptions } from '@camera.ui/common/logger';
import type { ProcInfo } from '../../api/database/checks.js';
import type { Database } from '../../api/database/index.js';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { DeepPartial } from '../../types.js';
import type { LoggerService } from '../logger/index.js';
import type { EnvironmentInfo, Go2RtcConfig, IConfig, Secrets, SSLConfig } from './types.js';

const __require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = __require('../../../package.json');

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
      // homeassistant: IS_HA,
    };
  }

  static readonly NODE_VERSION = process.version;
  static readonly MIN_NODE_VERSION = ConfigService.extractVersion(packageJson.engines.node)!;

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

  readonly PLUGINS_STORAGE_PATH: string;
  readonly PLUGINS_INSTALL_PATH: string;

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
  readonly RESTORE_RESET_IDENTITY_FILE: string;

  readonly UI_PORT = parseInt(process.env.CAMERA_UI_UI_PORT!);

  private logger: LoggerService;
  private _config!: IConfig;
  private _go2rtcConfig!: Go2RtcConfig;
  private _ssl!: SSLConfig;

  get ssl(): SSLConfig {
    return this._ssl;
  }

  get config(): IConfig {
    return this._config;
  }

  set config(newConfig: IConfig) {
    this.validateAndSetConfig(newConfig);
  }

  get go2rtcConfig(): Go2RtcConfig {
    return this._go2rtcConfig;
  }

  set go2rtcConfig(newConfig: Go2RtcConfig) {
    this.validateAndSetGo2RtcConfig(newConfig);
  }

  get DEFAULT_PLUGINS(): string[] {
    if (process.env.CAMERA_UI_DEFAULT_PLUGINS === undefined) {
      return ['@camera.ui/camera-ui-nvr'];
    }

    return process.env.CAMERA_UI_DEFAULT_PLUGINS.split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  get processes(): ProcInfo[] {
    try {
      return JSON.parse(readFileSync(this.PIDS_FILE, 'utf-8'));
    } catch {
      return [];
    }
  }

  set processes(pids: ProcInfo[]) {
    writeFileSync(this.PIDS_FILE, JSON.stringify(pids));
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

  constructor(homePath?: string) {
    container.registerInstance('configService', this);

    this.logger = container.resolve<LoggerService>('logger');

    if (!homePath) {
      if (IS_DEV) {
        this.HOME_PATH = join(__dirname, '..', '..', '..', '..', '.camera.ui');
      } else {
        this.HOME_PATH = join(getUserHomeDir(), '.camera.ui');
      }
    } else {
      this.HOME_PATH = resolve(homePath);
    }

    this.TMP_PATH = join(tmpdir(), '.camera.ui', createHash('sha256').update(this.HOME_PATH).digest('hex').slice(0, 8));
    this.STORAGE_PATH = join(this.HOME_PATH, 'volume');
    this.LOGS_PATH = join(this.STORAGE_PATH, 'logs');
    this.PIDS_FILE = join(this.STORAGE_PATH, 'camera.ui.pids');
    this.REPORTS_FILE = join(this.STORAGE_PATH, 'camera.ui.report.yaml');
    this.GO2RTC_CONFIG_FILE = join(this.STORAGE_PATH, 'go2rtc.yaml');
    this.CONFIG_FILE = join(this.STORAGE_PATH, 'camera.ui.yaml');
    this.BACKUP_INFO_FILE = join(this.STORAGE_PATH, 'camera.ui.backup.json');
    this.DEFAULTS_INSTALLED_FILE = join(this.STORAGE_PATH, '.camera.ui.defaults-installed');
    this.RESTORE_RESET_IDENTITY_FILE = join(this.STORAGE_PATH, '.restore-reset-identity');
    this.DATABASE_PATH = join(this.STORAGE_PATH, 'database');
    this.USERS_STORAGE_PATH = join(this.STORAGE_PATH, 'users');
    this.INTERFACE_CACHE_PATH = join(this.STORAGE_PATH, 'interface');

    this.PLUGINS_STORAGE_PATH = join(this.STORAGE_PATH, 'plugins', 'storage');
    this.PLUGINS_INSTALL_PATH = join(this.HOME_PATH, 'plugins');

    this.GO2RTC_BINARY = go2rtcPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);
    this.TUNNEL_BINARY = tunnelPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);
    this.NATS_BINARY = natsServerPath().replace('app.asar', ELECTRON_ASAR_UNPACKED);

    this.SECRETS_FILE = join(this.STORAGE_PATH, '.camera.ui.secrets');
    this.LOG_FILE = join(this.STORAGE_PATH, 'camera.ui.log');
    this.SECRETS = this.updateSecrets();

    this.createDirs();
    this.read();
    this.logStart();
  }

  public static extractVersion(str: string): string | null {
    const regex = /(?:[>=^]*)(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)/;
    const matches = regex.exec(str);

    if (matches?.[1]) {
      return matches[1];
    } else {
      return null;
    }
  }

  public reissueSslCertificate(): void {
    this._ssl = this.readSSL();
  }

  public writeConfig(newConfig?: DeepPartial<IConfig>): void {
    const oldSSL = structuredClone(this._config.ssl);

    if (newConfig) {
      this.mergeAndValidate(this._config, newConfig);
    }

    const newSSL = structuredClone(this._config.ssl);
    const sslChanged = isEqual(oldSSL, newSSL, true) === false;
    const certFile = join(this.STORAGE_PATH, HOST_CERT_FILENAME);
    const keyFile = join(this.STORAGE_PATH, HOST_KEY_FILENAME);

    if (sslChanged) {
      removeSync(certFile);
      removeSync(keyFile);
      this._ssl = this.readSSL();
    }

    writeFileSync(this.CONFIG_FILE, dump(this._config, { lineWidth: -1, noRefs: true }));
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
      const go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
      await go2rtcApi.configRoute.rewriteConfig(this._go2rtcConfig);
    } else {
      writeFileSync(this.GO2RTC_CONFIG_FILE, dump(this._go2rtcConfig, { lineWidth: -1, noRefs: true }));
    }
  }

  public async writeGo2RtcConfigFile(newConfig?: DeepPartial<Go2RtcConfig>): Promise<void> {
    await this.updateGo2RtcConfigCommon(newConfig, 'file');
  }

  public async writeGo2RtcConfigApi(newConfig?: DeepPartial<Go2RtcConfig>): Promise<void> {
    await this.updateGo2RtcConfigCommon(newConfig, 'api');
  }

  public async mergeGo2RtcConfig(): Promise<void> {
    const fileConfig = this.parseYaml<Go2RtcConfig>(readFileSync(this.GO2RTC_CONFIG_FILE, 'utf-8'));
    if (fileConfig) {
      this.validateAndSetGo2RtcConfig(fileConfig);
    }

    const db: Database = container.resolve<Database>('dbs');

    // Sync stream URL changes from go2rtc to DB, then push DB camera settings (ffmpeg URLs, preload, etc.) back to go2rtc
    await db?.updateCameras();
    db?.syncCamerasToGo2RtcConfig();
  }

  public async updateGo2RtcWebRtcFilter(serverAddresses: string[] = [], oldAddresses: string[] = [], api?: boolean): Promise<void> {
    const webRtcConfig = this._go2rtcConfig.webrtc;

    webRtcConfig.filters ??= {};
    webRtcConfig.filters.candidates ??= [];
    webRtcConfig.filters.ips ??= [];

    if (oldAddresses.length) {
      webRtcConfig.filters.candidates = webRtcConfig.filters.candidates.filter((address) => !oldAddresses.includes(address));
      webRtcConfig.filters.ips = webRtcConfig.filters.ips.filter((address) => !oldAddresses.includes(address));
    }

    if (serverAddresses.length) {
      for (const address of serverAddresses) {
        if (!webRtcConfig.filters.candidates.includes(address)) {
          webRtcConfig.filters.candidates.push(address);
        }

        if (!webRtcConfig.filters.ips.includes(address)) {
          webRtcConfig.filters.ips.push(address);
        }
      }
    } else {
      webRtcConfig.filters.candidates = [];
      webRtcConfig.filters.ips = [];
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

  public addProcess(proc: ProcInfo): ProcInfo {
    const processes = this.processes;
    processes.push(proc);
    writeFileSync(this.PIDS_FILE, JSON.stringify(processes));
    return proc;
  }

  public removeProcessByPID(pid?: number): void {
    if (!pid) {
      return;
    }

    const processes = this.processes;
    const index = processes.findIndex((process) => process.pid === pid);

    if (index > -1) {
      processes.splice(index, 1);
      writeFileSync(this.PIDS_FILE, JSON.stringify(processes));
    }
  }

  public go2rtcAddress(mod: 'api' | 'rtsp' | 'onvif' | 'srtp' | 'rtmp' | 'webrtc' | 'ws' = 'api'): string {
    let go2rtcPort: number;
    let protocol: string | undefined;

    const isTls = this._go2rtcConfig.api.listen === '';

    if (mod === 'api' || mod === 'ws' || mod === 'onvif') {
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

  private defaultConfig(): IConfig {
    const defaultConfig = structuredClone(DEFAULT_CONFIG);
    defaultConfig.ssl.certFile = join(this.STORAGE_PATH, HOST_CERT_FILENAME);
    defaultConfig.ssl.keyFile = join(this.STORAGE_PATH, HOST_KEY_FILENAME);
    defaultConfig.ssl.caFile = join(this.STORAGE_PATH, ROOT_CERT_FILENAME);
    return patchConfigSchema.parse(defaultConfig);
  }

  private defaultGo2RtcConfig(): Go2RtcConfig {
    const defaultConfig = structuredClone(DEFAULT_GO2RTC_CONFIG);
    defaultConfig.api.tls_cert = join(this.STORAGE_PATH, HOST_CERT_FILENAME);
    defaultConfig.api.tls_key = join(this.STORAGE_PATH, HOST_KEY_FILENAME);
    defaultConfig.api.tls_ca = join(this.STORAGE_PATH, ROOT_CERT_FILENAME);
    return patchGo2RtcSchema.parse(defaultConfig);
  }

  private parseYaml<T>(content: string): T | undefined {
    return content.trim() ? (load(content) as T) : undefined;
  }

  private readConfig(): IConfig {
    let config = this.defaultConfig();

    if (pathExistsSync(this.CONFIG_FILE)) {
      let configFileData = this.parseYaml<IConfig>(readFileSync(this.CONFIG_FILE, 'utf-8'));

      if (configFileData) {
        configFileData = this.cleanupConfig(config, configFileData);

        config = mergeWith(this.defaultConfig(), configFileData, (source: any, target: any) => {
          if (Array.isArray(source)) {
            return target;
          }
        });

        if (config.ssl.certFile === join(this.STORAGE_PATH, OLD_ROOT_CERT_FILENAME)) {
          config.ssl.certFile = join(this.STORAGE_PATH, HOST_CERT_FILENAME);
        }

        if (config.ssl.keyFile === join(this.STORAGE_PATH, OLD_ROOT_KEY_FILENAME)) {
          config.ssl.keyFile = join(this.STORAGE_PATH, HOST_KEY_FILENAME);
        }
      }
    }

    config = this.applyEnvOverrides(config);

    return config;
  }

  private applyEnvOverrides(config: IConfig): IConfig {
    if (process.env.CAMERA_UI_PORT) config.port = parseInt(process.env.CAMERA_UI_PORT, 10);
    if (process.env.CAMERA_UI_INSECURE_PORT) config.insecurePort = parseInt(process.env.CAMERA_UI_INSECURE_PORT, 10);

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

    if (pathExistsSync(this.GO2RTC_CONFIG_FILE)) {
      const configFileData = this.parseYaml<Go2RtcConfig>(readFileSync(this.GO2RTC_CONFIG_FILE, 'utf-8'));

      if (configFileData) {
        go2rtcConfig = mergeWith(go2rtcConfig, configFileData, (source: any, target: any) => {
          if (Array.isArray(source)) {
            return target;
          }
        });
      }
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
    this.validateAndSetGo2RtcConfig(this.readGo2RtcConfig());
    this._ssl = this.readSSL();

    this.logger.debugEnabled = this._config.logger?.level === 'debug' || this._config.logger?.level === 'trace';
    this.logger.traceEnabled = this._config.logger?.level === 'trace';
  }

  private updateGo2RtcConfig(go2rtcConfig: Go2RtcConfig): Go2RtcConfig {
    const config = structuredClone(go2rtcConfig);

    config.api.listen = '';
    config.api.origin = '*';
    config.api.tls_cert = this.config.ssl.certFile;
    config.api.tls_key = this.config.ssl.keyFile;
    config.api.tls_ca = this.config.ssl.caFile;

    const customFfmpeg = this.config.ffmpegPath?.trim();
    const bundledFfmpeg = isFfmpegAvailable() ? ffmpegPath().replace('app.asar', ELECTRON_ASAR_UNPACKED) : undefined;

    if (customFfmpeg && existsSync(customFfmpeg)) {
      config.ffmpeg.bin = customFfmpeg;
    } else if (bundledFfmpeg) {
      config.ffmpeg.bin = bundledFfmpeg;
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

        // Add missing 2FA secrets for existing installations
        let needsUpdate = false;
        if (!secrets.jwt2faKey) {
          secrets.jwt2faKey = randomBytes(32).toString('hex');
          needsUpdate = true;
        }
        if (!secrets.twoFactorKey) {
          secrets.twoFactorKey = randomBytes(32).toString('hex');
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

  private async createDirs(): Promise<void> {
    this.safetyEmptyDir(this.TMP_PATH);
    this.safetyEnsureDir(this.HOME_PATH);
    this.safetyEnsureDir(this.LOGS_PATH);
    this.safetyEnsureDir(this.STORAGE_PATH);
    this.safetyEnsureDir(this.USERS_STORAGE_PATH);
    this.safetyEnsureDir(this.PLUGINS_STORAGE_PATH);
    this.safetyEnsureDir(this.PLUGINS_INSTALL_PATH);
    this.safetyEnsureDir(this.DATABASE_PATH);
    this.safetyEnsureDir(this.INTERFACE_CACHE_PATH);
    this.safetyEnsureFile(this.CONFIG_FILE);
    this.safetyEnsureFile(this.GO2RTC_CONFIG_FILE);
    this.safetyEnsureFile(this.SECRETS_FILE);
    this.safetyEnsureFile(this.LOG_FILE);
    this.safetyEnsureFile(this.REPORTS_FILE);
    this.safetyEnsureFile(this.PIDS_FILE);
  }

  private safetyEnsureDir(dir: string): void {
    try {
      ensureDirSync(dir);
    } catch (error: any) {
      if (error.code !== 'EACCES') {
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
      if (error.code !== 'EACCES') {
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
      if (error.code !== 'EACCES') {
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
