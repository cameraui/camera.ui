import fp from 'fastify-plugin';
import { container } from 'tsyringe';
import { WebSocket, WebSocketServer } from 'ws';

import { AuthService } from '../services/auth.service.js';
import { UsersService } from '../services/users.service.js';
import { NatsSubFirewall } from './natsSubFirewall.js';

import type { FastifyInstance, FastifyPluginAsync, HookHandlerDoneFunction } from 'fastify';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { ClientOptions, RawData } from 'ws';
import type { ProxyServer } from '../../rpc/index.js';
import type { AuthConfig } from '../../rpc/interfaces/config.js';
import type { LoggerService } from '../../services/logger/index.js';

export interface ProxyTLSOptions {
  cert: string | Buffer;
  key: string | Buffer;
  ca: string | Buffer;
  rejectUnauthorized?: boolean;
}

export interface ProxyOptions {
  upstream: string;
  prefix: string;
  target: 'nats' | 'go2rtc';
  tls?: ProxyTLSOptions;
}

function isValidCloseCode(code: number): boolean {
  return (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) || (code >= 3000 && code <= 4999);
}

class WebSocketProxy {
  private wss: WebSocketServer;
  private upstream: string;
  private upstreamHost: string;
  private prefix: string;
  private target: 'nats' | 'go2rtc';
  private tlsConfig?: ProxyTLSOptions;
  private authService: AuthService;
  private usersService: UsersService;
  private proxy: ProxyServer;
  private logger: LoggerService;

  constructor(fastify: FastifyInstance, options: ProxyOptions) {
    this.proxy = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
    this.authService = new AuthService();
    this.usersService = new UsersService();

    this.upstream = options.upstream;
    this.upstreamHost = new URL(options.upstream).host;
    this.prefix = options.prefix;
    this.target = options.target;
    this.tlsConfig = options.tls;

    this.wss = new WebSocketServer({
      noServer: true,
      perMessageDeflate: false,
    });

    fastify.server.on('upgrade', async (request, socket, head) => {
      if (request.url?.startsWith(this.prefix)) {
        await this.handleUpgrade(request, socket, head);
      }
    });
  }

  public close(): void {
    this.wss.removeAllListeners();
    this.wss.close();
  }

  private async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    try {
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token') ?? '';

      const dbToken = this.authService.findByAccessToken(token);
      if (!dbToken) {
        this.wss.handleUpgrade(request, socket, head, (clientWs) => {
          clientWs.close(4401, 'unauthorized: token expired');
        });
        return;
      }

      let targetUrl = this.upstream;
      let natsCreds: AuthConfig = this.proxy.auth.server;
      let firewallConnId: string | null = null;

      if (this.target === 'go2rtc') {
        const src = url.searchParams.get('src') ?? '';
        if (dbToken.stream_scope && src !== dbToken.stream_scope) {
          this.wss.handleUpgrade(request, socket, head, (clientWs) => {
            clientWs.close(4403, 'forbidden: src out of scope');
          });
          return;
        }
        targetUrl += `?src=${src}`;

        if (dbToken.user_id.startsWith('share_')) {
          targetUrl += `&tag=${encodeURIComponent(dbToken.user_id)}`;
        }
      } else if (this.target === 'nats') {
        if (dbToken.stream_scope || dbToken.user_id.startsWith('share_')) {
          this.wss.handleUpgrade(request, socket, head, (clientWs) => {
            clientWs.close(4403, 'forbidden: token not allowed on rpc bus');
          });
          return;
        }

        const user = this.usersService.findById(dbToken.user_id);
        const isAdmin = user?.role === 'admin' || user?.role === 'master';
        natsCreds = isAdmin ? this.proxy.auth.server : this.proxy.auth.viewer;

        if (!isAdmin) {
          const connId = url.searchParams.get('connId') ?? '';
          if (!/^[A-Za-z0-9_-]{8,128}$/.test(connId)) {
            this.wss.handleUpgrade(request, socket, head, (clientWs) => {
              clientWs.close(4400, 'bad request: missing or invalid connId');
            });
            return;
          }
          firewallConnId = connId;
        }
      }

      const wsOptions: ClientOptions = {
        perMessageDeflate: false,
        headers: { host: this.upstreamHost },
        ca: this.tlsConfig?.ca,
        cert: this.tlsConfig?.cert,
        key: this.tlsConfig?.key,
        rejectUnauthorized: this.tlsConfig?.rejectUnauthorized,
      };

      const serverWs = new WebSocket(targetUrl, wsOptions);

      await new Promise<void>((resolve, reject) => {
        serverWs.once('open', resolve);
        serverWs.once('error', reject);
      });

      this.wss.handleUpgrade(request, socket, head, (clientWs) => {
        this.proxyWebSockets(clientWs, serverWs, natsCreds, firewallConnId);
      });
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private proxyWebSockets(client: WebSocket, server: WebSocket, natsCreds: AuthConfig, firewallConnId: string | null): void {
    if (firewallConnId) {
      const firewall = new NatsSubFirewall(firewallConnId, {
        forward: (chunk) => {
          if (server.readyState === WebSocket.OPEN) server.send(chunk, { binary: true });
        },
        close: (reason) => {
          this.logger.warn(`RPC firewall closed connection (connId ${firewallConnId}): ${reason}`);
          if (client.readyState === WebSocket.OPEN) client.close(4403, `forbidden: ${reason}`.slice(0, 123));
          if (server.readyState === WebSocket.OPEN) server.close(1000);
        },
        rewriteConnect: (connectData) => this.applyNatsCreds(connectData, natsCreds),
      });

      client.on('message', (data) => {
        if (server.readyState !== WebSocket.OPEN) return;
        firewall.push(this.toBuffer(data));
      });
    } else {
      let connectHandled = false;

      client.on('message', (data, isBinary) => {
        if (server.readyState !== WebSocket.OPEN) return;

        if (!connectHandled && this.target === 'nats') {
          connectHandled = true;
          try {
            const msg = this.extractMessage(data);
            if (msg.startsWith('CONNECT ')) {
              const connectData = this.applyNatsCreds(JSON.parse(msg.slice(8)), natsCreds);
              server.send(Buffer.from(`CONNECT ${JSON.stringify(connectData)}\r\n`), { binary: isBinary });
              return;
            }
          } catch {
            // Not a parseable CONNECT — forward as-is
          }
        }

        server.send(data, { binary: isBinary });
      });
    }

    client.on('ping', (data) => server.readyState === WebSocket.OPEN && server.ping(data));
    client.on('pong', (data) => server.readyState === WebSocket.OPEN && server.pong(data));

    client.on('close', (code, reason) => {
      if (server.readyState === WebSocket.OPEN) {
        server.close(isValidCloseCode(code) ? code : 1000, reason);
      }
    });

    client.on('error', () => {
      if (server.readyState === WebSocket.OPEN) server.close(1011);
    });

    server.on('message', (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) return;
      client.send(data, { binary: isBinary });
    });

    server.on('ping', (data) => client.readyState === WebSocket.OPEN && client.ping(data));
    server.on('pong', (data) => client.readyState === WebSocket.OPEN && client.pong(data));

    server.on('close', (code, reason) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(isValidCloseCode(code) ? code : 1000, reason);
      }
    });

    server.on('error', () => {
      if (client.readyState === WebSocket.OPEN) client.close(1011);
    });
  }

  private extractMessage(data: RawData): string {
    if (Buffer.isBuffer(data)) return data.toString('utf-8');
    if (Array.isArray(data)) return Buffer.concat(data).toString('utf-8');
    if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8');
    throw new Error('Unsupported data type');
  }

  private toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) return data;
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.from(data);
  }

  private applyNatsCreds(connectData: Record<string, unknown>, natsCreds: AuthConfig): Record<string, unknown> {
    connectData.user = natsCreds.user;
    connectData.pass = natsCreds.password;
    // TLS handled at transport layer, not in CONNECT message
    delete connectData.tls;
    return connectData;
  }
}

export const ProxyPlugin: FastifyPluginAsync<ProxyOptions> = fp(async (app: FastifyInstance, options: ProxyOptions) => {
  if (!options.upstream) {
    throw new Error('upstream must be specified');
  }

  const ws = new WebSocketProxy(app, options);

  app.addHook('preClose', (done: HookHandlerDoneFunction) => {
    ws.close();
    done();
  });
});
