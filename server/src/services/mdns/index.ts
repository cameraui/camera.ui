import { getResponder } from '@homebridge/ciao';
import { container } from 'tsyringe';

import { ConfigService } from '../config/index.js';

import type { CiaoService, Responder } from '@homebridge/ciao';
import type { Database } from '../../api/database/index.js';
import type { LoggerService } from '../logger/index.js';

export class MdnsService {
  private configService: ConfigService;
  private logger: LoggerService;
  private responder?: Responder;
  private service?: CiaoService;

  constructor() {
    this.configService = container.resolve<ConfigService>('configService');
    this.logger = container.resolve<LoggerService>('logger');
  }

  public async advertise(): Promise<void> {
    if (this.configService.config.mdns === false || this.service) return;

    try {
      const dbs = container.resolve<Database>('dbs');
      const instanceId = dbs.settingsDB.get('settings')?.instanceId ?? '';

      this.responder = getResponder();
      this.service = this.responder.createService({
        name: 'camera-ui',
        type: 'camera-ui',
        port: this.configService.config.port,
        txt: {
          version: ConfigService.VERSION,
          id: instanceId,
          https: '1',
        },
      });

      this.service.on('name-change', () => {});

      await this.service.advertise();
      this.logger.debug('mDNS: advertising _camera-ui._tcp on the local network');
    } catch (error: any) {
      // advertising is best-effort, a busy mDNS stack must not block the server
      this.logger.warn(`mDNS: failed to advertise service: ${error.message}`);
      await this.stop();
    }
  }

  public async stop(): Promise<void> {
    try {
      await this.service?.destroy();
      await this.responder?.shutdown();
    } catch {
      // ignore
    }
    this.service = undefined;
    this.responder = undefined;
  }
}
