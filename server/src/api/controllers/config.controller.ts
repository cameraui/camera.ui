import { dump } from 'js-yaml';

import { inject } from '../../container.js';
import { SettingsError, SettingsService } from '../services/settings.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { Go2RtcConfig, IConfig } from '../../services/config/types.js';
import type { AuthLoginRequest, ConfigPatchRequest, ConfigRequest, Go2RtcConfigPatchRequest, SettingsPatchRequest } from '../types/index.js';

export class ConfigController {
  private configService: ConfigService;
  private go2rtcApi: Go2RtcApi;
  private settingsService: SettingsService;

  constructor(private app: FastifyInstance) {
    this.configService = inject('configService');
    this.go2rtcApi = inject('go2rtcApi');
    this.settingsService = new SettingsService();
  }

  public showSettings(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      return reply.code(200).send(this.settingsService.read());
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async patchSettings(req: FastifyRequest<AuthLoginRequest & SettingsPatchRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const invalid = req.validationError?.validation[0];
    if (invalid) {
      return reply.code(400).send({ statusCode: 400, message: invalid.message, field: invalid.instancePath.slice(1).replaceAll('/', '.') });
    }

    try {
      return reply.code(200).send(await this.settingsService.update(req.body));
    } catch (error: any) {
      if (error instanceof SettingsError) {
        return reply.code(400).send({ statusCode: 400, message: error.message, field: error.field });
      }
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
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
      const streamingRestarted = await this.settingsService.saveGo2Rtc(req.body);
      return reply.code(200).send({ streamingRestarted });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }
}
