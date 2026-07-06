import { dump } from 'js-yaml';
import { container } from 'tsyringe';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { Go2RtcConfig, IConfig } from '../../services/config/types.js';
import type { AuthLoginRequest, ConfigPatchRequest, ConfigRequest, Go2RtcConfigPatchRequest } from '../types/index.js';

export class ConfigController {
  private configService: ConfigService;
  private go2rtcApi: Go2RtcApi;

  constructor(private app: FastifyInstance) {
    this.configService = container.resolve<ConfigService>('configService');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
  }

  public showConfig(req: FastifyRequest<AuthLoginRequest & ConfigRequest>, reply: FastifyReply): FastifyReply {
    try {
      const header = req.query.json ? 'application/json' : 'text/yaml';
      const config: string | IConfig = req.query.json ? this.configService.config : dump(this.configService.config, { lineWidth: -1, noRefs: true });

      reply.header('Content-Type', header);

      return reply.code(200).send(config);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public showGo2RtcConfig(req: FastifyRequest<AuthLoginRequest & ConfigRequest>, reply: FastifyReply): FastifyReply {
    try {
      const header = req.query.json ? 'application/json' : 'text/yaml';
      const config: string | Go2RtcConfig = req.query.json ? this.configService.go2rtcConfig : dump(this.configService.go2rtcConfig, { lineWidth: -1, noRefs: true });

      reply.header('Content-Type', header);

      return reply.code(200).send(config);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async downloadConfig(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      reply.header('Content-Type', 'text/yaml');

      await reply.sendFile(this.configService.CONFIG_FILE);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async downloadGo2RtcConfig(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      reply.header('Content-Type', 'text/yaml');

      await reply.sendFile(this.configService.GO2RTC_CONFIG_FILE);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public patchConfig(req: FastifyRequest<AuthLoginRequest & ConfigPatchRequest>, reply: FastifyReply): FastifyReply | void {
    try {
      this.configService.writeConfig(req.body);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchGo2RtcConfig(req: FastifyRequest<AuthLoginRequest & Go2RtcConfigPatchRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      await this.configService.writeGo2RtcConfigApi(req.body);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
