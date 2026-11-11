import { fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { getResponder } from '@homebridge/ciao';

import { RemoteService } from '../../api/services/remote.service.js';
import { inject } from '../../container.js';
import { ConfigService } from '../config/index.js';

import type { CiaoService, Responder } from '@homebridge/ciao';
import type { LoggerService } from '../logger/index.js';

export class MdnsService {
  private configService: ConfigService;
  private logger: LoggerService;
  private responder?: Responder;
  private service?: CiaoService;

  constructor() {
    this.configService = inject('configService');
    this.logger = inject('logger');
  }

  public async advertise(): Promise<void> {
    if (this.configService.config.mdns === false || this.service) return;

    try {
      const dbs = inject('dbs');
      const instanceId = dbs.settingsDB.get('settings')?.instanceId ?? '';

      // docker/vm bridge addresses must not end up in the announcement
      const addresses = fetchViableNetworkAddresses().map((viable) => viable.address);

      this.responder = getResponder();
      this.service = this.responder.createService({
        name: 'camera-ui',
        type: 'camera-ui',
        port: this.configService.config.port,
        restrictedAddresses: addresses.length ? addresses : undefined,
        txt: {
          version: ConfigService.VERSION,
          id: instanceId,
          name: new RemoteService().serverName(),
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
