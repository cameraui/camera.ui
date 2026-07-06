import { APP_SERVER_NAME, mergeWith } from '@camera.ui/common/utils';
import { userInfo } from 'node:os';
import { satisfies } from 'semver';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { getTerminalCols, InstallLogger } from '../utils/install-logger.js';

import type { Server } from 'socket.io';
import type { CameraUi } from '../../main.js';
import type { Database } from '../database/index.js';
import type { DBServer } from '../database/types.js';
import type { SocketService } from '../websocket/index.js';

export class ServerService {
  private dbs: Database;
  private io: Server;
  private socketService: SocketService;
  private cameraui: CameraUi;

  private installInProgress = false;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.socketService = container.resolve<SocketService>('socketService');
    this.cameraui = container.resolve<CameraUi>('cameraui');
    this.io = this.socketService.io;
  }

  public info(): DBServer {
    return this.dbs.serverDB.get('server')!;
  }

  public async patch(infoData: Partial<DBServer> = {}): Promise<DBServer> {
    const info = this.info();

    infoData.serverAddresses = infoData.serverAddresses?.filter((address) => address !== '');

    mergeWith(info, infoData, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }
    });

    await this.dbs.serverDB.put('server', info);

    return info;
  }

  public async install(version = 'latest'): Promise<void> {
    const log = new InstallLogger(
      (message) => this.io.of('/logs').emit('stdout/server', message),
      () => getTerminalCols('server'),
    );

    log.header(`Update · ${APP_SERVER_NAME}@${version}`, { user: userInfo().username });

    if (this.installInProgress) {
      log.error('Update already in progress.');
      throw new Error('Update already in progress.');
    }

    this.installInProgress = true;

    if (!satisfies(process.version, `>=${ConfigService.MIN_NODE_VERSION}`)) {
      log.warn(`Node.js v${ConfigService.MIN_NODE_VERSION} or higher is required for ${APP_SERVER_NAME}.`);
      log.warn(`You may experience issues while running on Node.js ${process.version}.`);
      log.blank();
    }

    try {
      log.block('Updating server');

      const updateStream = await this.cameraui.requestUpdate(version);
      for await (const output of updateStream) {
        log.feed(output);
      }
      log.flush();

      log.success(`${APP_SERVER_NAME}@${version} updated — restart to apply`);
    } catch (error: any) {
      log.error(`Update of ${APP_SERVER_NAME}@${version} failed: ${error.message}`);
      throw error;
    } finally {
      this.installInProgress = false;
    }
  }
}
