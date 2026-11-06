import { PromiseTimeout } from '@camera.ui/common/utils';
import { API_EVENT } from '@camera.ui/sdk';
import FastifyCors from '@fastify/cors';
import FastifyHelmet from '@fastify/helmet';
import FastifyHttpProxy from '@fastify/http-proxy';
import FastifyMultipart from '@fastify/multipart';
import FastifyStatic from '@fastify/static';
import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUI from '@fastify/swagger-ui';
import Fastify, { LogController } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { connect as connectNet, isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import qs from 'qs';
import { networkInterfaceDefault, networkInterfaces } from 'systeminformation';

import { inject, provide, tryInject } from '../container.js';
import { PROXY_SERVICE_URL, SHARE_SERVICE_URL } from '../services/config/constants.js';
import { ConfigService } from '../services/config/index.js';
import { RUNTIME_STATUS } from '../services/config/types.js';
import { MdnsService } from '../services/mdns/index.js';
import { paint } from '../utils/colors.js';
import { syncInterfaceCache } from '../utils/interface-cache.js';
import { addressList, listsAddress, trustEntry } from '../utils/trusted-addresses.js';
import { sweepExpiredTokens } from './database/tokenSweep.js';
import { IngressAuth } from './ingress.js';
import { HeaderPlugin } from './plugins/header.plugin.js';
import { ProxyPlugin } from './plugins/proxy.plugin.js';
import { PROXY_AUTH_HEADER, ProxyAuth } from './proxy-auth.js';
import { SocketIoPlugin } from './plugins/socket.plugin.js';
import { SystemPlugin } from './plugins/system.plugin.js';
import { normalizeEmbed } from './render-index.js';
import { FastifyRoutes } from './routes/index.js';
import { SharesService } from './services/shares.service.js';
import { CertificateGeneration } from './utils/cert.js';
import { customSecureContext, logCustomCertificate } from './utils/custom-cert.js';
import { parseFormBody } from './utils/form-body.js';

import type { FastifyCorsOptions } from '@fastify/cors';
import type { FastifyHelmetOptions } from '@fastify/helmet';
import type { FastifyHttpProxyOptions } from '@fastify/http-proxy';
import type { FastifyMultipartAttachFieldsToBodyOptions, MultipartFile } from '@fastify/multipart';
import type { FastifyStaticOptions } from '@fastify/static';
import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui';
import type { FastifyBaseLogger, FastifyHttp2SecureOptions, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Server as HttpServer, IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { Http2SecureServer } from 'node:http2';
import type { AddressInfo, BlockList, Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import type { ServerOptions } from 'socket.io';
import type { CameraUiAPI } from '../api.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ProxyOptions } from './plugins/proxy.plugin.js';
import type { ServerRuntime } from './websocket/types.js';

const SHARES_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const TOKEN_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INGRESS_UPGRADE_HEADERS = new Set(['authorization', 'x-cui-embed', 'x-cui-base']);
const HASHED_CARDS_CHUNK = /^ha[\\/][^\\/]+-[\w-]{8}\.js(?:\.br|\.gz)?$/;

type IngressRequest = FastifyRequest & { ingressToken?: string };
type ProxyAuthRequest = FastifyRequest & { proxyToken?: string };

interface UpgradeIdentity {
  token?: string;
  drop: ReadonlySet<string>;
  add: string[];
}

type RewriteRequestHeaders = NonNullable<NonNullable<FastifyHttpProxyOptions['replyOptions']>['rewriteRequestHeaders']>;
type UpgradeIdentify = (address: string | undefined, headers: IncomingHttpHeaders) => Promise<UpgradeIdentity | false | undefined>;

function cacheImmutable(reply: FastifyReply): void {
  reply.header('cache-control', 'public, max-age=31536000, immutable');
  reply.removeHeader('expires');
  reply.removeHeader('pragma');
  reply.removeHeader('surrogate-control');
}

function cacheInterfaceFile(reply: FastifyReply, root: string, path: string): void {
  if (HASHED_CARDS_CHUNK.test(relative(root, path))) {
    cacheImmutable(reply);
  } else {
    reply.header('cache-control', 'no-cache');
  }
}

function stripCspUpgrade(value: string): string {
  return value
    .split(';')
    .filter((directive) => directive.trim().toLowerCase() !== 'upgrade-insecure-requests')
    .join(';');
}

function upgradeRequestHead(req: IncomingMessage, peer: string | undefined, identity: UpgradeIdentity | undefined): string {
  const token = identity?.token;
  let url = req.url ?? '/';
  if (token) {
    const at = url.indexOf('?');
    const params = new URLSearchParams(at === -1 ? '' : url.slice(at + 1));
    params.set('token', token);
    url = `${at === -1 ? url : url.slice(0, at)}?${params.toString()}`;
  }

  const lines = [`${req.method ?? 'GET'} ${url} HTTP/1.1`];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const name = req.rawHeaders[i].toLowerCase();
    if (name === 'x-forwarded-for' || identity?.drop.has(name)) continue;
    lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  }
  lines.push(`X-Forwarded-For: ${[req.headers['x-forwarded-for'], peer].flat().filter(Boolean).join(', ')}`);
  if (token) {
    lines.push(`Authorization: Bearer ${token}`, ...identity.add);
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
}

async function ingressUpgradeIdentity(ingress: IngressAuth, address: string | undefined, headers: IncomingHttpHeaders): Promise<UpgradeIdentity | undefined> {
  const token = await ingress.accessToken(address, headers);
  return token ? { token, drop: INGRESS_UPGRADE_HEADERS, add: ['X-Cui-Embed: hassio'] } : undefined;
}

async function proxyUpgradeIdentity(auth: ProxyAuth, address: string | undefined, headers: IncomingHttpHeaders): Promise<UpgradeIdentity | false> {
  const outcome = await auth.signIn(address, headers).catch(() => ({ refused: '' }));
  if (outcome && 'refused' in outcome) return false;
  if (!outcome) return { drop: auth.ownHeaders, add: [] };
  return { token: outcome.token, drop: new Set([...auth.ownHeaders, 'authorization']), add: ['X-Cui-Auth: proxy'] };
}

const forwarderSockets = new WeakMap<FastifyInstance, Set<Socket>>();

export class Server {
  public isRunning = false;
  public app?: FastifyInstance<Http2SecureServer>;
  public internalApp?: FastifyInstance;
  public insecureApp?: FastifyInstance;
  public proxyAuthApp?: FastifyInstance;

  private api: CameraUiAPI;
  private logger: LoggerService;
  private configService: ConfigService;
  private proxyServer: ProxyServer;

  private _internalPort = 0;
  private loopback?: HttpServer;
  private loopbackPort = 0;
  private sharesCleanupTimer?: NodeJS.Timeout;
  private tokenSweepTimer?: NodeJS.Timeout;
  private stopCertificateWatch?: () => void;
  private mdnsService = new MdnsService();
  private proxyTrust?: BlockList;
  private bound?: { port: number; host?: string };

  private readonly connections = new Set<Socket>();

  constructor() {
    provide('server', this);

    this.api = inject('api');
    this.logger = inject('logger');
    this.configService = inject('configService');
    this.proxyServer = inject('proxy');
  }

  public get internalPort(): number {
    return this._internalPort;
  }

  public get boundPort(): number | undefined {
    return this.bound?.port;
  }

  public get restartPending(): boolean {
    const { port, host } = this.configService.config;
    return !!this.bound && (this.bound.port !== port || this.bound.host !== host);
  }

  public async register(): Promise<void> {
    await syncInterfaceCache(ConfigService.INTERFACE_SOURCE_PATH, this.configService.INTERFACE_CACHE_PATH, ConfigService.VERSION);

    this.app = Fastify(this.serverOptions);
    this.internalApp = Fastify({ bodyLimit: 1e6, logController: new LogController({ disableRequestLogging: true }) });

    // fastify validates a missing body as null, which an optional body schema rejects
    this.app.setValidatorCompiler((route: Parameters<typeof validatorCompiler>[0]) => {
      const validate = validatorCompiler(route);
      return route.httpPart === 'body' ? (data: unknown) => validate(data ?? undefined) : validate;
    });
    this.app.setSerializerCompiler(serializerCompiler);
    this.app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, (body as Buffer).length > 0 ? body : undefined);
    });
    this.app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
      done(null, parseFormBody(body as string));
    });

    this.trackConnections(this.app.server);
    this.trackConnections(this.internalApp.server);

    this.app.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      tryInject('workerManager')?.tunnels.accept(req, socket, head);
    });

    this.watchCertificate();
    this.setupListeners();
    await this.registerPlugins();
    await this.registerRouters();
    await this.registerInternalRouters();
  }

  public async listen(): Promise<void> {
    if (!this.app) {
      throw new Error('Fastify instance not initialized');
    }

    const port = this.configService.config.port;
    let host = this.configService.config.host ?? '::';
    if (host === '::' && process.platform === 'win32') {
      host = '0.0.0.0';
    }

    try {
      await this.app.listen({ host, port });
    } catch (error) {
      // only the default dual-stack bind falls back to IPv4, a configured host is respected
      const code = (error as NodeJS.ErrnoException).code;
      if (host !== '::' || (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL')) {
        throw error;
      }
      this.logger.warn('IPv6 wildcard (::) unavailable, falling back to 0.0.0.0');
      await this.app.listen({ host: '0.0.0.0', port });
    }

    if (this.internalApp) {
      await this.internalApp.listen({ host: '127.0.0.1', port: 0 });
      const addr = this.internalApp.server.address() as AddressInfo | null;
      this._internalPort = addr?.port ?? 0;
      this.logger.debug(`camera.ui internal listener bound to http://127.0.0.1:${this._internalPort}`);
    }

    this.bound = { port, host: this.configService.config.host };
    logCustomCertificate(CertificateGeneration.requiredAddresses());

    await this.startInsecureForwarder();
    await this.startProxyAuthForwarder();

    this.isRunning = true;

    this.startSharesCleanup();
    this.startTokenSweep();
    if (!inject('cameraui').movedAway) this.mdnsService.advertise();
  }

  public async close(): Promise<void> {
    if (this.sharesCleanupTimer) {
      clearInterval(this.sharesCleanupTimer);
      this.sharesCleanupTimer = undefined;
    }
    if (this.tokenSweepTimer) {
      clearInterval(this.tokenSweepTimer);
      this.tokenSweepTimer = undefined;
    }

    this.stopCertificateWatch?.();
    this.stopCertificateWatch = undefined;

    await this.mdnsService.stop();

    const loopback = this.loopback;
    const closing = Promise.allSettled([
      this.app?.close(),
      this.internalApp?.close(),
      this.insecureApp?.close(),
      this.proxyAuthApp?.close(),
      loopback && new Promise<void>((resolve) => loopback.close(() => resolve())),
    ]);

    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    await PromiseTimeout(closing, 2000).catch(() => {});

    this.app = undefined;
    this.internalApp = undefined;
    this.insecureApp = undefined;
    this.proxyAuthApp = undefined;
    this.loopback = undefined;
    this.loopbackPort = 0;
    this._internalPort = 0;
    this.bound = undefined;
  }

  public applyTrustedProxies(): void {
    this.proxyTrust = addressList(this.trustedProxies);
  }

  public async applyMdns(): Promise<void> {
    await this.mdnsService.stop();
    if (!inject('cameraui').movedAway) this.mdnsService.advertise();
  }

  public async rebindForwarders(listeners: { insecure: boolean; proxyAuth: boolean }): Promise<void> {
    if (listeners.insecure) {
      await this.closeForwarder(this.insecureApp);
      this.insecureApp = undefined;
    }
    if (listeners.proxyAuth) {
      await this.closeForwarder(this.proxyAuthApp);
      this.proxyAuthApp = undefined;
    }
    if (listeners.insecure) await this.startInsecureForwarder();
    if (listeners.proxyAuth) await this.startProxyAuthForwarder();
  }

  private async startInsecureForwarder(): Promise<void> {
    const port = this.configService.config.insecurePort;
    if (!port || !Number.isInteger(port) || port <= 0 || port >= 65536) {
      return;
    }

    const host = this.configService.config.host ?? '0.0.0.0';
    const trustIp = this.configService.INGRESS_TRUST_IP;
    const ingress = trustIp ? new IngressAuth(trustIp) : undefined;
    const app = this.createForwarder();

    if (ingress) {
      // this plaintext port signs requests in, only the Home Assistant proxy may connect
      app.server.on('connection', (socket: Socket) => {
        if (!ingress.isTrusted(socket.remoteAddress)) socket.destroy();
      });
      app.addHook('onRequest', async (req) => {
        (req as IngressRequest).ingressToken = await ingress.accessToken(req.ip, req.headers);
      });
    }

    const identify: UpgradeIdentify | undefined = ingress && ((address, headers) => ingressUpgradeIdentity(ingress, address, headers));
    app.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.forwardUpgrade(req, socket as Socket, head, identify);
    });

    await this.forwardRequests(app, (req, headers) => {
      headers['x-forwarded-for'] = [headers['x-forwarded-for'], req.ip].flat().filter(Boolean).join(', ');
      const ingressPath = req.headers['x-ingress-path'];
      if (ingress?.isTrusted(req.ip) && typeof ingressPath === 'string') {
        headers['x-cui-base'] = ingressPath;
      }
      const token = (req as IngressRequest).ingressToken;
      if (token) {
        headers.authorization = `Bearer ${token}`;
        headers['x-cui-embed'] = 'hassio';
      }
      return headers;
    });

    await app.listen({ host, port });
    this.insecureApp = app;
    this.logger.log(paint('green', `camera.ui insecure (http) listener on http://${host}:${port}${ingress ? ' (ingress-trusted)' : ''}`));
  }

  private async startProxyAuthForwarder(): Promise<void> {
    const settings = this.configService.proxyAuth;
    if (!settings) {
      return;
    }

    const host = this.configService.config.host ?? '0.0.0.0';
    const auth = new ProxyAuth(settings);
    const app = this.createForwarder();

    app.server.on('connection', (socket: Socket) => {
      if (!auth.isTrusted(socket.remoteAddress)) socket.destroy();
    });
    app.addHook('onRequest', async (req, reply) => {
      const outcome = await auth.signIn(req.ip, req.headers).catch(() => ({ refused: 'camera.ui could not sign you in.' }));
      if (outcome && 'refused' in outcome) {
        return reply.code(401).header('cache-control', 'no-store').type('text/plain; charset=utf-8').send(outcome.refused);
      }
      (req as ProxyAuthRequest).proxyToken = outcome?.token;
    });

    app.server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      this.forwardUpgrade(req, socket as Socket, head, (address, headers) => proxyUpgradeIdentity(auth, address, headers));
    });

    await this.forwardRequests(app, (req, headers) => {
      for (const name of auth.ownHeaders) delete headers[name];
      headers['x-forwarded-for'] = [headers['x-forwarded-for'], req.ip].flat().filter(Boolean).join(', ');
      const token = (req as ProxyAuthRequest).proxyToken;
      if (token) {
        headers.authorization = `Bearer ${token}`;
        headers[PROXY_AUTH_HEADER] = 'proxy';
      }
      return headers;
    });

    try {
      await app.listen({ host, port: settings.port });
    } catch (error) {
      this.logger.error(`Proxy sign-in could not listen on port ${settings.port}: ${(error as Error).message}`);
      await app.close().catch(() => {});
      return;
    }
    this.proxyAuthApp = app;
    const trusted = settings.trust.length > 0 ? settings.trust.join(', ') : 'the secret';
    this.logger.log(paint('green', `camera.ui proxy sign-in listener on http://${host}:${settings.port}, user from ${settings.header}, trusts ${trusted}`));
  }

  private createForwarder(): FastifyInstance {
    const app = Fastify({ bodyLimit: 1e8, logController: new LogController({ disableRequestLogging: true }) });
    const sockets = new Set<Socket>();
    forwarderSockets.set(app, sockets);
    this.trackConnections(app.server);
    this.trackConnections(app.server, sockets);
    return app;
  }

  private async closeForwarder(app: FastifyInstance | undefined): Promise<void> {
    if (!app) return;
    const closing = app.close();
    // upgraded sockets outlive close(), a changed listener must not keep serving them
    for (const socket of forwarderSockets.get(app) ?? []) socket.destroy();
    await PromiseTimeout(closing, 2000).catch(() => {});
  }

  private async forwardRequests(app: FastifyInstance, rewrite: RewriteRequestHeaders): Promise<void> {
    await app.register(FastifyHttpProxy, {
      upstream: await this.forwarderUpstream(),
      replyOptions: {
        rewriteRequestHeaders: rewrite,
        rewriteHeaders: (headers) => {
          const csp = headers['content-security-policy'];
          if (typeof csp === 'string') {
            headers['content-security-policy'] = stripCspUpgrade(csp);
          }
          return headers;
        },
      },
    });
  }

  private async forwardUpgrade(req: IncomingMessage, socket: Socket, head: Buffer, identify?: UpgradeIdentify): Promise<void> {
    socket.on('error', () => socket.destroy());
    if (req.headers.upgrade?.toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return;
    }

    const identity = await identify?.(socket.remoteAddress, req.headers).catch(() => undefined);
    if (socket.destroyed) return;
    if (identity === false) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return;
    }

    const upstream = connectNet({ host: '127.0.0.1', port: this.loopbackPort });
    const close = () => {
      socket.destroy();
      upstream.destroy();
    };
    socket.on('close', close);
    upstream.on('error', close).on('close', close);

    upstream.once('connect', () => {
      socket.setNoDelay(true);
      upstream.setNoDelay(true);
      upstream.write(upgradeRequestHead(req, socket.remoteAddress, identity));
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
  }

  private async forwarderUpstream(): Promise<string> {
    if (this.loopback) {
      return `http://127.0.0.1:${this.loopbackPort}`;
    }

    const main = this.app?.server;
    if (!main) {
      throw new Error('Fastify instance not initialized');
    }

    // uploads through Home Assistant can outlast node's 5 min request timeout
    const loopback = createServer({ requestTimeout: 0 });
    loopback.on('request', (req, res) => main.emit('request', req, res));
    loopback.on('upgrade', (req, socket, head) => main.emit('upgrade', req, socket, head));
    this.trackConnections(loopback);
    await new Promise<void>((resolve, reject) => {
      loopback.once('error', reject);
      loopback.listen(0, '127.0.0.1', () => resolve());
    });

    this.loopback = loopback;
    this.loopbackPort = (loopback.address() as AddressInfo).port;
    return `http://127.0.0.1:${this.loopbackPort}`;
  }

  private trackConnections(server: { on(event: 'connection', listener: (socket: Socket) => void): void }, sockets = this.connections): void {
    server.on('connection', (socket: Socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
  }

  private watchCertificate(): void {
    this.stopCertificateWatch?.();
    this.stopCertificateWatch = this.configService.onSslChange((ssl) => {
      try {
        this.app?.server.setSecureContext({ cert: ssl.cert, key: ssl.key, ca: ssl.ca });
        this.logger.log('camera.ui serves the renewed host certificate');
      } catch (error) {
        this.logger.warn(`Could not load the renewed host certificate, it is used after the next restart: ${(error as Error).message}`);
      }
    });
  }

  private startSharesCleanup(): void {
    const sharesService = new SharesService();
    const run = () => sharesService.cleanup().catch(() => {});

    run();
    this.sharesCleanupTimer = setInterval(run, SHARES_CLEANUP_INTERVAL_MS);
  }

  private startTokenSweep(): void {
    const tokensDB = inject('dbs').tokensDB;
    const run = () =>
      sweepExpiredTokens(tokensDB)
        .then((removed) => removed && this.logger.debug(`Removed ${removed} expired sessions`))
        .catch(() => {});

    run();
    this.tokenSweepTimer = setInterval(run, TOKEN_SWEEP_INTERVAL_MS);
  }

  private setupListeners(): void {
    if (this.app) {
      this.app.addHook('onListen', async () => {
        const port = this.configService.config.port;
        this.logger.log(paint('green', `camera.ui v${ConfigService.VERSION} is listening on https://localhost:${port}`));

        try {
          const defaultAdapter = await networkInterfaceDefault();
          const ifaces = await networkInterfaces();
          const lan = (Array.isArray(ifaces) ? ifaces : [ifaces]).find((i) => i.iface === defaultAdapter && i.ip4);
          if (lan?.ip4) {
            this.logger.log(paint('green', `camera.ui is reachable on your network at https://${lan.ip4}:${port}`));
          }
        } catch {
          // ignore
        }

        const runtimeInfo: ServerRuntime = {
          'camera.ui': { name: 'camera.ui', status: RUNTIME_STATUS.STARTED },
        };

        this.app!.io.of('/status').emit('process-status', runtimeInfo);
        this.api.emit(API_EVENT.FINISH_LAUNCHING);
      });

      this.app.addHook('preClose', async () => {
        this.logger.debug('camera.ui is shutting down');

        const runtimeInfo: ServerRuntime = {
          'camera.ui': { name: 'camera.ui', status: RUNTIME_STATUS.STOPPED },
        };

        this.app!.io.of('/status').emit('process-status', runtimeInfo);
        this.api.emit(API_EVENT.SHUTDOWN);
      });

      this.app.addHook('onClose', async () => {
        this.logger.debug('camera.ui server closed, cleaning up connections');
      });
    }
  }

  private async registerPlugins(): Promise<void> {
    await this.app?.register(SocketIoPlugin, this.socketOptions);
    await this.app?.register(SystemPlugin);
    await this.app?.register(HeaderPlugin);
    await this.app?.register(FastifyHelmet, this.helmetOptions);
    await this.app?.register(FastifyCors, this.corsOptions);
    await this.app?.register(ProxyPlugin, this.natsProxyOptions);
    await this.app?.register(ProxyPlugin, this.go2rtcProxyOptions);
    await this.app?.register(FastifyMultipart, this.multipartOptions);
    await this.registerInterface();
    await this.app?.register(FastifySwagger, this.swaggerOptions);
    await this.app?.register(FastifySwaggerUI, this.swaggerUiOptions);
  }

  private async registerInterface(): Promise<void> {
    this.app?.addHook('onRequest', async (req) => this.limitEmbedEncoding(req.headers));
    await this.app?.register(FastifyStatic, this.staticOptions);
    await this.app?.register(FastifyStatic, this.staticAssetOptions);
    await this.app?.register(FastifyStatic, this.staticCardsOptions);
  }

  private async registerRouters(): Promise<void> {
    if (this.app) {
      const routes = new FastifyRoutes(this.app);
      await routes.register();
    }
  }

  private async registerInternalRouters(): Promise<void> {
    if (this.internalApp) {
      const routes = new FastifyRoutes(this.internalApp);
      await routes.registerInternal();
    }
  }

  private get corsOptions(): FastifyCorsOptions {
    return {
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
      origin: (origin, cb) => {
        if (!origin) {
          cb(null, true);
          return;
        }

        if (
          origin === `https://127.0.0.1:${this.configService.config.port}` ||
          origin === `http://127.0.0.1:${this.configService.UI_PORT}` ||
          /^https?:\/\/localhost(:\d+)?$/.exec(origin)
        ) {
          cb(null, true);
          return;
        }

        if (origin === 'capacitor://localhost' || origin === 'https://localhost') {
          cb(null, true);
          return;
        }

        if (origin === PROXY_SERVICE_URL || origin === SHARE_SERVICE_URL) {
          cb(null, true);
          return;
        }

        if (origin.endsWith('.trycloudflare.com')) {
          cb(null, true);
          return;
        }

        if (this.isConfiguredOrigin(origin)) {
          cb(null, true);
          return;
        }

        cb(null, false);
      },
    };
  }

  private get natsProxyOptions(): ProxyOptions {
    return {
      upstream: `ws://127.0.0.1:${this.proxyServer.server.wsPort}`,
      prefix: '/api/proxy',
      target: 'nats',
    };
  }

  private get go2rtcProxyOptions(): ProxyOptions {
    const go2rtcAddress = this.configService.go2rtcAddress('ws');

    return {
      upstream: `${go2rtcAddress}/api/ws`,
      prefix: '/api/go2rtc',
      target: 'go2rtc',
      tls: {
        cert: this.configService.ssl.cert,
        key: this.configService.ssl.key,
        ca: this.configService.ssl.ca,
        rejectUnauthorized: false,
      },
    };
  }

  private get helmetOptions(): FastifyHelmetOptions {
    return {
      hsts: false,
      frameguard: false,
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'"],
          styleSrcElem: ["'unsafe-eval'", "'unsafe-inline'", "'self'"],
          scriptSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'blob:', 'data:'],
          childSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'blob:', 'https:'],
          frameSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'"],
          connectSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'ws:', 'wss:', 'https:', 'blob:', 'data:', 'file:', 'filesystem:', 'mediastream:'],
          imgSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'data:', 'blob:', 'https:'],
          mediaSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'data:', 'blob:', 'http:', 'https:'],
          scriptSrcAttr: null,
          fontSrc: null,
          objectSrc: null,
          frameAncestors: null,
          formAction: null,
          baseUri: null,
          upgradeInsecureRequests: [],
          blockAllMixedContent: null,
        },
      },
    };
  }

  private get serverOptions(): FastifyHttp2SecureOptions<Http2SecureServer, FastifyBaseLogger> {
    return {
      bodyLimit: 1e8,
      forceCloseConnections: true,
      trustProxy: (address: string) => listsAddress((this.proxyTrust ??= addressList(this.trustedProxies)), address),
      http2: true,
      https: {
        rejectUnauthorized: false,
        allowHTTP1: true,
        cert: this.configService.ssl.cert,
        key: this.configService.ssl.key,
        ca: this.configService.ssl.ca,
        SNICallback: (servername, callback) => callback(null, customSecureContext(servername)),
      },
      logController: new LogController({ disableRequestLogging: true }),
      routerOptions: {
        querystringParser: this.qsParser.bind(this),
      },
    };
  }

  private get trustedProxies(): string[] {
    const ingress = this.configService.INGRESS_TRUST_IP;
    const trusted = ['127.0.0.0/8', '::1/128'];
    if (ingress && isIP(ingress)) trusted.push(ingress);
    for (const value of this.configService.config.trustedProxies ?? []) {
      const entry = trustEntry(value);
      if (entry) {
        trusted.push(entry);
      } else {
        this.logger.warn(`Ignoring trusted proxy ${JSON.stringify(value)}, it is not an IP address or CIDR range`);
      }
    }
    return trusted;
  }

  private get socketOptions(): Partial<ServerOptions> {
    return {
      cors: {
        origin: '*',
      },
      path: '/api/socket.io',
      maxHttpBufferSize: 1e6,
      pingInterval: 25000,
      pingTimeout: 20000,
      destroyUpgrade: false,
    };
  }

  private get multipartOptions(): FastifyMultipartAttachFieldsToBodyOptions {
    return {
      attachFieldsToBody: true,
      async onFile(part) {
        if (this.routeOptions.config.uploadToDisk) {
          const directory = await mkdtemp(join(tmpdir(), 'cameraui-upload-'));
          const filepath = join(directory, 'upload.bin');
          try {
            await pipeline(part.file, createWriteStream(filepath));
          } catch (error) {
            await rm(directory, { recursive: true, force: true }).catch(() => {});
            throw error;
          }
          (part as MultipartFile & { filepath?: string }).filepath = filepath;
        } else {
          await part.toBuffer();
        }
      },
    };
  }

  private get staticOptions(): FastifyStaticOptions {
    const root = this.configService.INTERFACE_CACHE_PATH;
    return {
      root,
      prefix: '/',
      index: false,
      setHeaders: (reply, path) => cacheInterfaceFile(reply, root, path),
    };
  }

  private get staticAssetOptions(): FastifyStaticOptions {
    return {
      root: join(this.configService.INTERFACE_CACHE_PATH, 'assets'),
      prefix: '/assets/',
      index: false,
      wildcard: false,
      globIgnore: ['**/*.br', '**/*.gz'],
      preCompressed: true,
      decorateReply: false,
      setHeaders: cacheImmutable,
    };
  }

  private get staticCardsOptions(): FastifyStaticOptions {
    const root = this.configService.INTERFACE_CACHE_PATH;
    return {
      root: join(root, 'ha'),
      prefix: '/ha/',
      index: false,
      wildcard: false,
      globIgnore: ['**/*.br', '**/*.gz'],
      preCompressed: true,
      decorateReply: false,
      setHeaders: (reply, path) => cacheInterfaceFile(reply, root, path),
    };
  }

  private limitEmbedEncoding(headers: IncomingHttpHeaders): void {
    const accepted = headers['accept-encoding'];
    if (!accepted || !normalizeEmbed(headers['x-cui-embed']) || headers['x-cui-encoding'] === 'passthrough') return;
    headers['accept-encoding'] = /\bgzip\b/i.test(accepted) ? 'gzip' : 'identity';
  }

  private get swaggerOptions(): FastifyDynamicSwaggerOptions {
    return {
      transform: jsonSchemaTransform,
      openapi: {
        info: {
          title: 'camera.ui API',
          description: 'HTTP API for camera.ui.',
          version: ConfigService.VERSION,
        },
        components: {
          securitySchemes: {
            passwordAuth: {
              type: 'oauth2',
              flows: {
                password: {
                  tokenUrl: '/api/auth/token',
                  scopes: {},
                },
              },
            },
          },
        },
        security: [{ passwordAuth: [] }],
      },
    };
  }

  private get swaggerUiOptions(): FastifySwaggerUiOptions {
    return {
      routePrefix: '/api/swagger',
      uiConfig: {
        docExpansion: 'list',
        persistAuthorization: true,
      },
    };
  }

  private qsParser(str: string) {
    return qs.parse(str, {
      decoder(str: string, defaultDecoder: qs.defaultDecoder, charset: string, type: 'key' | 'value') {
        if (type === 'value' && /^(?:-(?:[1-9](?:\d{0,2}(?:,\d{3})+|\d*))|(?:0|(?:[1-9](?:\d{0,2}(?:,\d{3})+|\d*))))(?:.\d+|)$/.test(str)) {
          return parseFloat(str);
        }

        const keywords: any = {
          true: true,
          false: false,
          null: null,
          undefined: undefined,
        };
        if (type === 'value' && str in keywords) {
          return keywords[str];
        }

        return defaultDecoder(str, defaultDecoder, charset);
      },
    });
  }

  private isConfiguredOrigin(origin: string): boolean {
    return (this.configService.config.cors?.origins ?? []).some((candidate) => this.normalizeOrigin(candidate) === origin);
  }

  private normalizeOrigin(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      const trimmed = value.trim().replace(/\/+$/, '');
      return trimmed || null;
    }
  }
}
