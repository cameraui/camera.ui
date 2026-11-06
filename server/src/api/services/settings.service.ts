import { isEqual, structuredClone } from '@camera.ui/common/utils';
import { createSocket } from 'node:dgram';
import { createServer, isIP } from 'node:net';

import { inject } from '../../container.js';
import { DEFAULT_ONVIF_PORT } from '../../services/config/defaults.js';
import { dropKey, listenPort } from '../../services/config/platform-values.js';
import { resolveProxyAuth } from '../../services/config/proxy-auth.js';
import { RUNTIME_STATUS } from '../../services/config/types.js';

import type { ProxyAuthSettings } from '../../services/config/proxy-auth.js';
import type { DeepPartial } from '../../types.js';
import type { Go2RtcConfig, IConfig, LoggingLevel, LogLevel } from '../../services/config/types.js';
import type { SettingsPatchInput } from '../schemas/settings.schema.js';

type Protocol = 'tcp' | 'udp';
type ProxyAuthPatch = NonNullable<SettingsPatchInput['proxy']>['proxyAuth'];

interface Listener {
  field: string;
  label: string;
  port?: number;
  host?: string;
  protocols: Protocol[];
}

export interface SettingsView {
  server: { port: number; insecurePort: number | null; host: string; mdns: boolean };
  logging: { level: LoggingLevel; streamingLevel: LogLevel };
  proxy: {
    trustedProxies: string[];
    corsOrigins: string[];
    cloudflaredProtocol: string;
    proxyAuth: { port: number; header: string; trust: string[]; logoutUrl: string; secretSet: boolean } | null;
  };
  streaming: {
    rtsp: { port: number | null; username: string; password: string; defaultQuery: string };
    onvif: { enabled: boolean; port: number };
    webrtc: { port: number | null; candidates: string[] };
    srtpPort: number | null;
    rtmpPort: number | null;
  };
  locked: Record<string, string>;
  restartPending: boolean;
}

export interface SettingsUpdate extends SettingsView {
  streamingRestarted: boolean;
}

const LOCKABLE: Record<string, string> = {
  port: 'server.port',
  insecurePort: 'server.insecurePort',
  trustedProxies: 'proxy.trustedProxies',
  cloudflaredProtocol: 'proxy.cloudflaredProtocol',
  'proxyAuth.port': 'proxy.proxyAuth.port',
  'proxyAuth.header': 'proxy.proxyAuth.header',
  'proxyAuth.trust': 'proxy.proxyAuth.trust',
  'proxyAuth.secret': 'proxy.proxyAuth.secret',
  'proxyAuth.logoutUrl': 'proxy.proxyAuth.logoutUrl',
};

// go2rtc takes these from a config saved through its API
const LIVE_GO2RTC_SETTINGS = ['rtsp.username', 'rtsp.password', 'rtsp.default_query', 'rtmp.listen', 'onvif.listen', 'webrtc.candidates'];

let updates: Promise<unknown> = Promise.resolve();

export class SettingsError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

export class SettingsService {
  private configService = inject('configService');

  public read(): SettingsView {
    const { config, go2rtcConfig: go2rtc, proxyAuth } = this.configService;

    return {
      server: { port: config.port, insecurePort: config.insecurePort ?? null, host: config.host ?? '', mdns: config.mdns !== false },
      logging: { level: config.logger.level, streamingLevel: go2rtc.log.level ?? 'info' },
      proxy: {
        trustedProxies: config.trustedProxies ?? [],
        corsOrigins: config.cors?.origins ?? [],
        cloudflaredProtocol: config.cloudflaredProtocol ?? '',
        proxyAuth: proxyAuth
          ? { port: proxyAuth.port, header: proxyAuth.header, trust: proxyAuth.trust, logoutUrl: proxyAuth.logoutUrl ?? '', secretSet: !!proxyAuth.secret }
          : null,
      },
      streaming: {
        rtsp: {
          port: portOf(go2rtc.rtsp.listen),
          username: go2rtc.rtsp.username ?? '',
          password: go2rtc.rtsp.password ?? '',
          defaultQuery: go2rtc.rtsp.default_query,
        },
        onvif: { enabled: !!go2rtc.onvif.listen, port: portOf(go2rtc.onvif.listen) ?? DEFAULT_ONVIF_PORT },
        webrtc: { port: portOf(go2rtc.webrtc.listen), candidates: go2rtc.webrtc.candidates ?? [] },
        srtpPort: portOf(go2rtc.srtp.listen),
        rtmpPort: portOf(go2rtc.rtmp.listen),
      },
      locked: this.locked(),
      restartPending: inject('server').restartPending,
    };
  }

  public update(patch: SettingsPatchInput): Promise<SettingsUpdate> {
    return queue(() => this.apply(patch));
  }

  public saveGo2Rtc(patch: DeepPartial<Go2RtcConfig>): Promise<boolean> {
    return queue(() => {
      const previous = structuredClone(this.configService.go2rtcConfig);
      this.configService.patchGo2RtcConfig(patch);
      return this.applyStreaming(previous);
    });
  }

  private async apply(patch: SettingsPatchInput): Promise<SettingsUpdate> {
    this.rejectLocked(patch);

    const config = structuredClone(this.configService.config);
    const go2rtc = structuredClone(this.configService.go2rtcConfig);
    editConfig(config, patch);
    editGo2Rtc(go2rtc, patch);

    const proxyAuthPatch = patch.proxy?.proxyAuth;
    const block = proxyAuthPatch === undefined ? this.configService.proxyAuthBlock : mergeProxyAuth(this.configService.proxyAuthBlock, proxyAuthPatch);
    const proxyAuth = this.resolveProxyAuth(block, config, proxyAuthPatch !== undefined);

    // a port change waiting for the restart is not bound yet, the server still holds the old port
    const running = { ...this.configService.config, port: inject('server').boundPort ?? this.configService.config.port };
    await checkListeners(listeners(running, this.configService.proxyAuth, this.configService.go2rtcConfig), listeners(config, proxyAuth, go2rtc));

    const previous = {
      config: structuredClone(this.configService.config),
      go2rtc: structuredClone(this.configService.go2rtcConfig),
      proxyAuth: this.configService.proxyAuth,
    };

    // edit the live objects again, a camera change during the checks must survive
    editConfig(this.configService.config, patch);
    editGo2Rtc(this.configService.go2rtcConfig, patch);

    if (proxyAuthPatch !== undefined) {
      this.configService.writeProxyAuth(block);
    } else if (!isEqual(previous.config, this.configService.config)) {
      this.configService.writeConfig();
    }

    const streamingRestarted = await this.applyStreaming(previous.go2rtc);
    await this.applyLive(previous.config, previous.proxyAuth);

    return { ...this.read(), streamingRestarted };
  }

  private async applyStreaming(previous: Go2RtcConfig): Promise<boolean> {
    const current = this.configService.go2rtcConfig;
    if (isEqual(previous, current)) {
      return false;
    }

    const restart = needsRestart(previous, current);
    if (restart) {
      await this.configService.writeGo2RtcConfigFile();
      await inject('go2rtc').restart();
    } else if (inject('go2rtc').status === RUNTIME_STATUS.STARTED) {
      await this.configService.writeGo2RtcConfigApi();
    } else {
      await this.configService.writeGo2RtcConfigFile();
    }

    if (previous.rtsp.username !== current.rtsp.username || previous.rtsp.password !== current.rtsp.password) {
      restartRemoteWorkloads();
    }
    return restart;
  }

  private async applyLive(previous: IConfig, previousProxyAuth: ProxyAuthSettings | undefined): Promise<void> {
    const config = this.configService.config;
    const server = inject('server');

    if (previous.logger.level !== config.logger.level) {
      inject('logger').setLogLevel(config.logger.level === 'debug' || config.logger.level === 'trace' ? config.logger.level : 'log');
    }
    if (previous.mdns !== config.mdns) {
      await server.applyMdns();
    }
    if (!isEqual(previous.trustedProxies, config.trustedProxies)) {
      server.applyTrustedProxies();
    }

    const insecure = previous.insecurePort !== config.insecurePort;
    const proxyAuth = !isEqual(previousProxyAuth, this.configService.proxyAuth);
    if (insecure || proxyAuth) {
      await server.rebindForwarders({ insecure, proxyAuth });
    }

    if (previous.cloudflaredProtocol !== config.cloudflaredProtocol) {
      inject('remoteAccessManager').restartTunnel();
    }
  }

  private locked(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(this.configService.ENVIRONMENT_VARIABLES)
        .filter(([setting]) => LOCKABLE[setting])
        .map(([setting, variable]) => [LOCKABLE[setting], variable]),
    );
  }

  private rejectLocked(patch: SettingsPatchInput): void {
    const locked = Object.entries(this.locked());
    for (const field of touchedFields(patch)) {
      const variable = locked.find(([lockedField]) => lockedField === field || lockedField.startsWith(`${field}.`))?.[1];
      if (variable) throw new SettingsError(field, `Set by the environment variable ${variable}`);
    }
  }

  private resolveProxyAuth(block: unknown, config: IConfig, edited: boolean): ProxyAuthSettings | undefined {
    const problems: string[] = [];
    const settings = resolveProxyAuth(block, process.env, [config.port, config.insecurePort], (message) => problems.push(message));
    // a save must not switch off a running proxy sign-in on the side
    if (!settings && problems.length && (edited || this.configService.proxyAuth)) {
      throw new SettingsError('proxy.proxyAuth', problems.at(-1)!);
    }
    return settings;
  }
}

function queue<T>(task: () => Promise<T>): Promise<T> {
  const run = updates.then(task);
  updates = run.catch(() => {});
  return run;
}

function needsRestart(before: Go2RtcConfig, after: Go2RtcConfig): boolean {
  return !isEqual(withoutLiveSettings(before), withoutLiveSettings(after));
}

function withoutLiveSettings(go2rtc: Go2RtcConfig): Record<string, unknown> {
  const values = structuredClone(go2rtc) as unknown as Record<string, unknown>;
  for (const setting of LIVE_GO2RTC_SETTINGS) dropKey(values, setting);
  // the SRTP server starts with go2rtc only, a running one changes its port in place
  if (go2rtc.srtp.listen) dropKey(values, 'srtp.listen');
  return values;
}

function restartRemoteWorkloads(): void {
  for (const camera of inject('api').getCameras()) {
    if (camera.frameWorker.isRemoteWorker) camera.frameWorker.restart();
  }
  for (const plugin of inject('pluginManager').plugins.values()) {
    if (plugin.worker.isRemoteWorker) plugin.worker.restart();
  }
}

function editConfig(config: IConfig, { server, logging, proxy }: SettingsPatchInput): void {
  if (server?.port !== undefined) config.port = server.port;
  if (server?.insecurePort === null) delete config.insecurePort;
  else if (server?.insecurePort !== undefined) config.insecurePort = server.insecurePort;
  if (server?.host !== undefined) config.host = server.host;
  if (server?.mdns !== undefined) config.mdns = server.mdns;

  if (logging?.level) config.logger.level = logging.level;

  if (proxy?.trustedProxies) {
    if (proxy.trustedProxies.length) config.trustedProxies = proxy.trustedProxies;
    else delete config.trustedProxies;
  }
  if (proxy?.corsOrigins) config.cors = { ...config.cors, origins: proxy.corsOrigins };
  if (proxy?.cloudflaredProtocol) config.cloudflaredProtocol = proxy.cloudflaredProtocol;
  else if (proxy?.cloudflaredProtocol === '') delete config.cloudflaredProtocol;
}

function editGo2Rtc(go2rtc: Go2RtcConfig, { logging, streaming }: SettingsPatchInput): void {
  if (logging?.streamingLevel) go2rtc.log.level = logging.streamingLevel;

  const { rtsp, onvif, webrtc, srtpPort, rtmpPort } = streaming ?? {};
  if (rtsp?.port !== undefined) go2rtc.rtsp.listen = withPort(go2rtc.rtsp.listen, rtsp.port);
  if (rtsp?.username !== undefined) go2rtc.rtsp.username = rtsp.username;
  if (rtsp?.password !== undefined) go2rtc.rtsp.password = rtsp.password;
  if (rtsp?.defaultQuery !== undefined) go2rtc.rtsp.default_query = rtsp.defaultQuery;

  if (onvif) {
    const enabled = onvif.enabled ?? !!go2rtc.onvif.listen;
    const port = onvif.port ?? portOf(go2rtc.onvif.listen) ?? DEFAULT_ONVIF_PORT;
    go2rtc.onvif.listen = enabled ? withPort(go2rtc.onvif.listen, port) : '';
  }

  if (webrtc?.port !== undefined) {
    const old = `:${portOf(go2rtc.webrtc.listen)}`;
    go2rtc.webrtc.listen = withPort(go2rtc.webrtc.listen, webrtc.port);
    // candidates that announced the old port move along with it
    setCandidates(
      go2rtc,
      webrtc.candidates ?? (go2rtc.webrtc.candidates ?? []).map((candidate) => (candidate.endsWith(old) ? withPort(candidate, webrtc.port!) : candidate)),
    );
  } else if (webrtc?.candidates) {
    setCandidates(go2rtc, webrtc.candidates);
  }

  if (srtpPort !== undefined) go2rtc.srtp.listen = withPort(go2rtc.srtp.listen, srtpPort);
  if (rtmpPort !== undefined) go2rtc.rtmp.listen = withPort(go2rtc.rtmp.listen, rtmpPort);
}

function setCandidates(go2rtc: Go2RtcConfig, candidates: string[]): void {
  if (candidates.length) go2rtc.webrtc.candidates = candidates;
  else delete go2rtc.webrtc.candidates;
}

function mergeProxyAuth(current: unknown, patch: ProxyAuthPatch): Record<string, unknown> | undefined {
  if (!patch) return undefined;
  const block = current && typeof current === 'object' && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === '') delete block[key];
    else block[key] = value;
  }
  return Object.keys(block).length ? block : undefined;
}

function listeners(config: IConfig, proxyAuth: ProxyAuthSettings | undefined, go2rtc: Go2RtcConfig): Listener[] {
  return [
    { field: 'server.port', label: 'camera.ui', port: config.port, host: config.host, protocols: ['tcp'] },
    { field: 'server.insecurePort', label: 'the HTTP port', port: config.insecurePort, host: config.host, protocols: ['tcp'] },
    { field: 'proxy.proxyAuth.port', label: 'the proxy sign-in', port: proxyAuth?.port, host: config.host, protocols: ['tcp'] },
    { field: 'workers.port', label: 'the workers', port: config.workers?.enabled ? config.workers.port : undefined, protocols: ['tcp'] },
    go2rtcListener('streaming.api', 'the streaming engine', go2rtc.api.tls_listen, ['tcp']),
    go2rtcListener('streaming.rtsp.port', 'RTSP', go2rtc.rtsp.listen, ['tcp']),
    go2rtcListener('streaming.onvif.port', 'ONVIF', go2rtc.onvif.listen, ['tcp']),
    go2rtcListener('streaming.webrtc.port', 'WebRTC', go2rtc.webrtc.listen, ['tcp', 'udp']),
    go2rtcListener('streaming.srtpPort', 'SRTP', go2rtc.srtp.listen, ['udp']),
    go2rtcListener('streaming.rtmpPort', 'RTMP', go2rtc.rtmp.listen, ['tcp']),
  ];
}

function go2rtcListener(field: string, label: string, listen: string, protocols: Protocol[]): Listener {
  const host = listen.slice(0, listen.lastIndexOf(':')).replace(/^\[|\]$/g, '');
  return { field, label, port: portOf(listen) ?? undefined, host, protocols };
}

async function checkListeners(before: Listener[], after: Listener[]): Promise<void> {
  const changed = after.filter((listener, index) => listener.port !== undefined && listener.port !== before[index].port);

  for (const listener of changed) {
    const other = after.find((candidate) => candidate !== listener && candidate.port === listener.port);
    if (other) throw new SettingsError(listener.field, `Port ${listener.port} is already used by ${other.label}`);
  }

  for (const { field, port, host, protocols } of changed) {
    for (const protocol of protocols) {
      const error = await bindError(port!, host, protocol);
      if (error) throw new SettingsError(field, bindProblem(error, port!, host));
    }
  }
}

async function bindError(port: number, host: string | undefined, protocol: Protocol): Promise<NodeJS.ErrnoException | undefined> {
  const address = host === '' ? undefined : host;
  try {
    if (protocol === 'tcp') {
      const server = createServer();
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen({ port, host: address, exclusive: true }, resolve);
      });
      await new Promise((resolve) => server.close(resolve));
    } else {
      const socket = createSocket(isIP(address ?? '') === 6 ? 'udp6' : 'udp4');
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind({ port, address, exclusive: true }, resolve);
      }).finally(() => socket.close());
    }
    return undefined;
  } catch (error) {
    return error as NodeJS.ErrnoException;
  }
}

function bindProblem(error: NodeJS.ErrnoException, port: number, host: string | undefined): string {
  switch (error.code) {
    case 'EADDRINUSE':
      return `Port ${port} is in use by another program`;
    case 'EACCES':
      return `Port ${port} needs more rights, pick one above 1023`;
    case 'EADDRNOTAVAIL':
      return `${host} is not an address of this machine`;
    default:
      return error.message;
  }
}

function touchedFields(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => touchedFields(child, prefix ? `${prefix}.${key}` : key));
}

function portOf(listen: string | undefined): number | null {
  return listen ? listenPort(listen) : null;
}

function withPort(listen: string, port: number): string {
  return `${listen.slice(0, listen.lastIndexOf(':') + 1) || ':'}${port}`;
}
