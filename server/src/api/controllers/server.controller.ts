import { fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { APP_SERVER_NAME, isEqual } from '@camera.ui/common/utils';
import { createReadStream, readFile, truncate } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { getVersionsAndDistTags } from '../../utils/npm/index.js';
import { ServerService } from '../services/server.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { DBServer } from '../database/types.js';
import type { AuthLoginRequest, FilesParamsRequest, Go2RtcInfo, NatsInfo, ServerInfo, ServerPatchRequest, ServerUpdateRequest } from '../types/index.js';
import type { SocketService } from '../websocket/index.js';
import type { ServerNamespace } from '../websocket/nsp/server.js';

const SYSTEM_LOG_SOURCES = new Set(['server', 'go2rtc', 'nats', 'tunnel']);

export class ServerController {
  private configService: ConfigService;
  private go2rtcApi: Go2RtcApi;
  private proxy: ProxyServer;
  private logger: LoggerService;
  private socketService: SocketService;

  private service: ServerService;

  constructor(private app: FastifyInstance) {
    this.configService = container.resolve<ConfigService>('configService');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
    this.proxy = container.resolve<ProxyServer>('proxy');
    this.logger = container.resolve<LoggerService>('logger');
    this.socketService = container.resolve<SocketService>('socketService');

    this.service = new ServerService();
  }

  public async updateServer(req: FastifyRequest<AuthLoginRequest & ServerUpdateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      this.logger.log(`Updating server: ${APP_SERVER_NAME}@${req.body.version}`);

      await this.service.install(req.body.version);

      this.logger.log(`Server updated: ${APP_SERVER_NAME}@${ConfigService.VERSION}`);

      const serverNsp = this.socketService.namespaces.get('/server');
      (serverNsp as ServerNamespace).checkServer();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async getServerInfo(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const info = this.service.info();
      const networkAddresses = fetchViableNetworkAddresses();

      const serverInfo: ServerInfo = {
        availableAddresses: networkAddresses,
        serverAddresses: info.serverAddresses ?? [],
      };

      return reply.code(200).send(serverInfo);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchServerInfo(req: FastifyRequest<AuthLoginRequest & ServerPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const oldServer = JSON.parse(JSON.stringify(this.service.info())) as DBServer;
      const serverInfo = await this.service.patch(req.body);

      const serverAddressesChanged = isEqual(oldServer.serverAddresses, serverInfo.serverAddresses, true) !== true;
      if (serverAddressesChanged) {
        await this.configService.updateGo2RtcWebRtcFilter(serverInfo.serverAddresses, oldServer.serverAddresses, true);
      }

      return reply.code(200).send(serverInfo);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async checkVersion(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const data = await getVersionsAndDistTags(APP_SERVER_NAME);

      return reply.code(200).send(data);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async natsInfo(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const nats: NatsInfo = {
        // servers: this.proxy.server.endpoints.filter((endpoint) => endpoint.startsWith('nats://')),
        auth: this.proxy.auth.server,
      };

      return reply.code(200).send(nats);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async go2rtcInfo(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const go2rtcAddress = this.configService.go2rtcAddress('api');
      const port = parseInt(go2rtcAddress.split(':')[2], 10);

      const go2rtc: Go2RtcInfo = {
        url: go2rtcAddress,
        wsURL: `${go2rtcAddress}/api/ws`,
        port,
        auth: {
          username: this.configService.go2rtcConfig.api.username,
          password: this.configService.go2rtcConfig.api.password,
        },
        info: await this.go2rtcApi.applicationRoute.info(),
      };

      return reply.code(200).send(go2rtc);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public clearLog(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const source = (req.query as { source?: string } | undefined)?.source;
      const logFile = this.resolveLogFile(source);

      truncate(logFile, (error) => {
        if (error) {
          return reply.code(500).send({
            statusCode: 500,
            message: error.message,
          });
        }

        this.app.io.of('/logs').emit('clear-log', source ?? 'all');

        return reply.code(204).send();
      });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public downloadLog(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      const source = (req.query as { source?: string } | undefined)?.source;
      const logFile = this.resolveLogFile(source);
      const filename = source && source !== 'all' ? `${source}.log.txt` : 'camera.ui.log.txt';

      const buffer = new Readable();
      buffer._read = () => {};

      const readStream = createReadStream(logFile);

      readStream.on('data', (data) => {
        buffer.push(data.toString('utf8').replace(/\x1b\[[0-9;]*m/g, ''));
      });

      readStream.on('end', () => {
        buffer.push(null);
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', `attachment; filename=${filename}`);

      return reply.code(200).send(buffer);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async downloadCert(_req: FastifyRequest<AuthLoginRequest & FilesParamsRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      readFile(this.configService.config.ssl.caFile, (error, fileBuffer) => {
        if (error) {
          this.logger.error(error);
        }

        reply.send(error ?? fileBuffer);
      });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', 'attachment; filename=cert.pem');

      return reply;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async restart(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      reply.code(204).send();
      setTimeout(() => req.system.close(), 500);
      return reply;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async reset(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      this.configService.reset();
      req.system.close();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async restartGo2rtc(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      await req.system.restartGo2rtc();
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private resolveLogFile(source?: string): string {
    if (source && SYSTEM_LOG_SOURCES.has(source)) {
      return join(this.configService.LOGS_PATH, `system-${source}.log`);
    }
    return this.configService.LOG_FILE;
  }
}
