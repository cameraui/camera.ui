import { inject } from '../../container.js';

import type { CastCommand, CastTarget } from '../../manager/castManager.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { Database } from '../database/index.js';

export class CastService {
  private proxyServer: ProxyServer;
  private dbs: Database;

  constructor() {
    this.proxyServer = inject('proxy');
    this.dbs = inject('dbs');
  }

  public listTargets(): CastTarget[] {
    return this.proxyServer.castManager.listTargets();
  }

  public cast(deviceId: string, command: CastCommand): Promise<boolean> {
    return this.proxyServer.castManager.cast(deviceId, command);
  }

  public liveBlocked(command: CastCommand): boolean {
    return command.startMs === undefined && this.dbs.camerasDB.get(command.cameraId)?.privacy.enabled === true;
  }
}
