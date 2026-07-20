import { PromiseTimeout } from '@camera.ui/common/utils';
import { API_EVENT } from '@camera.ui/sdk';
import FastifyCors from '@fastify/cors';
import FastifyFormbody from '@fastify/formbody';
import FastifyHelmet from '@fastify/helmet';
import FastifyHttpProxy from '@fastify/http-proxy';
import FastifyMultipart from '@fastify/multipart';
import FastifyStatic from '@fastify/static';
import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUI from '@fastify/swagger-ui';
import { green } from 'ansicolor';
import Fastify, { LogController } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import qs from 'qs';
import { networkInterfaceDefault, networkInterfaces } from 'systeminformation';
import { container } from 'tsyringe';

import { PROXY_SERVICE_URL, SHARE_SERVICE_URL } from '../services/config/constants.js';
import { ConfigService } from '../services/config/index.js';
import { RUNTIME_STATUS } from '../services/config/types.js';
import { MdnsService } from '../services/mdns/index.js';
import { syncInterfaceCache } from '../utils/interface-cache.js';
import { IngressSession } from './ingress.js';
import { HeaderPlugin } from './plugins/header.plugin.js';
import { ProxyPlugin } from './plugins/proxy.plugin.js';
import { SocketIoPlugin } from './plugins/socket.plugin.js';
import { SystemPlugin } from './plugins/system.plugin.js';
import { FastifyRoutes } from './routes/index.js';
import { SharesService } from './services/shares.service.js';

import type { FastifyCorsOptions } from '@fastify/cors';
import type { FastifyHelmetOptions } from '@fastify/helmet';
import type { FastifyMultipartAttachFieldsToBodyOptions, MultipartFile } from '@fastify/multipart';
import type { FastifyStaticOptions } from '@fastify/static';
import type { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import type { FastifySwaggerUiOptions } from '@fastify/swagger-ui';
import type { FastifyBaseLogger, FastifyHttp2SecureOptions, FastifyInstance, FastifyRequest } from 'fastify';
import type { Http2SecureServer } from 'node:http2';
import type { AddressInfo, Socket } from 'node:net';
import type { ServerOptions } from 'socket.io';
import type { CameraUiAPI } from '../api.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ProxyOptions } from './plugins/proxy.plugin.js';
import type { ServerRuntime } from './websocket/types.js';

const SHARES_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

type IngressRequest = FastifyRequest & { ingressToken?: string };

function stripCspUpgrade(value: string): string {
  return value
    .split(';')
    .filter((directive) => directive.trim().toLowerCase() !== 'upgrade-insecure-requests')
    .join(';');
}

export class Server {
  public isRunning = false;
  public app?: FastifyInstance<Http2SecureServer>;
  public internalApp?: FastifyInstance;
  public insecureApp?: FastifyInstance;

  private api: CameraUiAPI;
  private logger: LoggerService;
  private configService: ConfigService;
  private proxyServer: ProxyServer;

  private _internalPort = 0;
  private sharesCleanupTimer?: NodeJS.Timeout;
  private mdnsService = new MdnsService();

  private readonly connections = new Set<Socket>();

  constructor() {
    container.registerInstance('server', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.logger = container.resolve<LoggerService>('logger');
    this.configService = container.resolve<ConfigService>('configService');
    this.proxyServer = container.resolve<ProxyServer>('proxy');
  }

  public get internalPort(): number {
    return this._internalPort;
  }

  public async register(): Promise<void> {
    await syncInterfaceCache(ConfigService.INTERFACE_SOURCE_PATH, this.configService.INTERFACE_CACHE_PATH, ConfigService.VERSION);

    this.app = Fastify(this.serverOptions);
    this.internalApp = Fastify({ bodyLimit: 1e6, logController: new LogController({ disableRequestLogging: true }) });

    this.app.setValidatorCompiler(validatorCompiler);
    this.app.setSerializerCompiler(serializerCompiler);
    this.trackConnections(this.app.server);
    this.trackConnections(this.internalApp.server);
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
      // Only the default dual-stack bind (::) auto-falls back to IPv4 when IPv6
      // is disabled (EAFNOSUPPORT); an explicitly configured host is respected.
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

    await this.startInsecureForwarder();

    this.isRunning = true;

    this.startSharesCleanup();
    this.mdnsService.advertise();
  }

  public async close(): Promise<void> {
    if (this.sharesCleanupTimer) {
      clearInterval(this.sharesCleanupTimer);
      this.sharesCleanupTimer = undefined;
    }

    await this.mdnsService.stop();

    const closing = Promise.allSettled([this.app?.close(), this.internalApp?.close(), this.insecureApp?.close()]);

    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();

    await PromiseTimeout(closing, 2000).catch(() => {});

    this.app = undefined;
    this.internalApp = undefined;
    this.insecureApp = undefined;
    this._internalPort = 0;
  }

  private async startInsecureForwarder(): Promise<void> {
    const port = this.configService.config.insecurePort;
    if (!port || !Number.isInteger(port) || port <= 0 || port >= 65536) {
      return;
    }

    const host = this.configService.config.host ?? '0.0.0.0';
    const trustIp = this.configService.INGRESS_TRUST_IP;
    const ingress = trustIp ? new IngressSession() : undefined;
    const app = Fastify({ bodyLimit: 1e8, logController: new LogController({ disableRequestLogging: true }) });
    this.trackConnections(app.server);

    if (ingress && trustIp) {
      app.addHook('onRequest', async (req) => {
        if (req.ip.replace(/^::ffff:/, '') === trustIp) {
          (req as IngressRequest).ingressToken = await ingress.getAccessToken();
        }
      });
    }

    await app.register(FastifyHttpProxy, {
      upstream: `https://127.0.0.1:${this.configService.config.port}`,
      websocket: true,
      undici: { connect: { rejectUnauthorized: false } },
      replyOptions: {
        rewriteRequestHeaders: (req, headers) => {
          const token = (req as IngressRequest).ingressToken;
          if (token) {
            headers.authorization = `Bearer ${token}`;
            headers['x-cui-embed'] = 'homeassistant';
            const ingressPath = req.headers['x-ingress-path'];
            if (typeof ingressPath === 'string') headers['x-cui-base'] = ingressPath;
          }
          return headers;
        },
        rewriteHeaders: (headers) => {
          const csp = headers['content-security-policy'];
          if (typeof csp === 'string') {
            headers['content-security-policy'] = stripCspUpgrade(csp);
          }
          return headers;
        },
      },
      wsClientOptions: {
        rejectUnauthorized: false,
        queryString: (search, _reqUrl, req) => {
          const params = new URLSearchParams(search);
          const token = (req as IngressRequest).ingressToken;
          if (token) params.set('token', token);
          return params.toString();
        },
      },
    });

    await app.listen({ host, port });
    this.insecureApp = app;
    this.logger.log(green(`camera.ui insecure (http) listener on http://${host}:${port}${ingress ? ' (ingress-trusted)' : ''}`));
  }

  private trackConnections(server: { on(event: 'connection', listener: (socket: Socket) => void): void }): void {
    server.on('connection', (socket: Socket) => {
      this.connections.add(socket);
      socket.once('close', () => this.connections.delete(socket));
    });
  }

  private startSharesCleanup(): void {
    const sharesService = new SharesService();
    const run = () => sharesService.cleanup().catch(() => {});

    run();
    this.sharesCleanupTimer = setInterval(run, SHARES_CLEANUP_INTERVAL_MS);
  }

  private setupListeners(): void {
    if (this.app) {
      this.app.addHook('onListen', async () => {
        const port = this.configService.config.port;
        this.logger.log(green(`camera.ui v${ConfigService.VERSION} is listening on https://localhost:${port}`));

        try {
          const defaultAdapter = await networkInterfaceDefault();
          const ifaces = await networkInterfaces();
          const lan = (Array.isArray(ifaces) ? ifaces : [ifaces]).find((i) => i.iface === defaultAdapter && i.ip4);
          if (lan?.ip4) {
            this.logger.log(green(`camera.ui is reachable on your network at https://${lan.ip4}:${port}`));
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
    await this.app?.register(FastifyFormbody);
    await this.app?.register(FastifyMultipart, this.multipartOptions);
    await this.app?.register(FastifyStatic, this.staticOptions);
    await this.app?.register(FastifySwagger, this.swaggerOptions);
    await this.app?.register(FastifySwaggerUI, this.swaggerUiOptions);
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
      upstream: `wss://localhost:${this.proxyServer.server.wsPort}`,
      prefix: '/api/proxy',
      target: 'nats',
      tls: {
        cert: this.configService.ssl.cert,
        key: this.configService.ssl.key,
        ca: this.configService.ssl.ca,
        rejectUnauthorized: false,
      },
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
          // fontSrc: ["'unsafe-eval'", "'unsafe-inline'", "'self'", 'data:'],
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

  // private get rateLimitOptions(): RateLimitPluginOptions {
  //   return {
  //     max: 300,
  //     timeWindow: 30 * 1000,
  //     hook: 'preHandler',
  //   };
  // }

  private get serverOptions(): FastifyHttp2SecureOptions<Http2SecureServer, FastifyBaseLogger> {
    return {
      bodyLimit: 1e8,
      forceCloseConnections: true,
      trustProxy: true,
      http2: true,
      https: {
        rejectUnauthorized: false,
        allowHTTP1: true,
        cert: this.configService.ssl.cert,
        key: this.configService.ssl.key,
        ca: this.configService.ssl.ca,
      },
      logController: new LogController({ disableRequestLogging: true }),
      routerOptions: {
        querystringParser: this.qsParser.bind(this),
      },
    };
  }

  private get socketOptions(): Partial<ServerOptions> {
    return {
      cors: {
        origin: '*',
      },
      path: '/api/socket.io',
      maxHttpBufferSize: 1e7,
      pingInterval: 25000,
      pingTimeout: 20000,
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
    return {
      root: this.configService.INTERFACE_CACHE_PATH,
      prefix: '/',
      index: false,
    };
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
