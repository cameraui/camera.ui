import { buildHttpsUrl, fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { APP_SERVER_NAME, mergeWith } from '@camera.ui/common/utils';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { satisfies } from 'semver';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { getTerminalCols, InstallLogger } from '../utils/install-logger.js';
import { updatesService } from './updates.service.js';

import type { Server } from 'socket.io';
import type { CameraUi } from '../../main.js';
import type { RemoteAccessManager } from '../../remote/index.js';
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

  public networkEndpoints(): { internalAddresses: string[]; externalAddresses: string[]; ca?: string } {
    const configService = container.resolve<ConfigService>('configService');
    const allAddresses = fetchViableNetworkAddresses();
    const selectedAddresses = this.info().serverAddresses ?? [];
    const port = configService.config.port;

    const internalAddresses = allAddresses
      .filter((addr) => selectedAddresses.length === 0 || selectedAddresses.includes(addr.address))
      .map((addr) => buildHttpsUrl(addr.address, port));

    // one more local candidate, never a go2rtc filter entry: those compare against
    // IP literals, a hostname there would gather no candidate at all
    const localUrl = this.info().localUrl?.trim();
    if (localUrl) internalAddresses.unshift(localUrl);

    const remoteStatus = container.resolve<RemoteAccessManager>('remoteAccessManager').getStatus();
    const externalAddresses: string[] = [];
    if (remoteStatus.externalUrl) externalAddresses.push(remoteStatus.externalUrl);

    return { internalAddresses, externalAddresses, ca: this.caCertificate() };
  }

  private caCertificate(): string | undefined {
    const caFile = container.resolve<ConfigService>('configService').ROOT_CERT_FILE;
    if (!caFile) return undefined;
    try {
      const pem = readFileSync(caFile, 'utf8');
      return pem.includes('BEGIN CERTIFICATE') ? pem : undefined;
    } catch {
      return undefined;
    }
  }

  public async patch(infoData: Partial<DBServer> = {}): Promise<DBServer> {
    infoData.serverAddresses = infoData.serverAddresses?.filter((address) => address !== '');

    const info = await this.dbs.commit(this.dbs.serverDB, 'server', (current) => {
      const record = current ?? this.info();

      mergeWith(record, infoData, (source: any, target: any) => {
        if (Array.isArray(source)) {
          return target;
        }
      });

      return record;
    });

    return info ?? this.info();
  }

  public async install(version = 'latest', opts: { internal?: boolean } = {}): Promise<void> {
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

    const source = opts.internal ? ('run' as const) : ('manual' as const);
    updatesService().notifyServerInstall('start', { version, source });

    try {
      log.block('Updating server');

      const updateStream = await this.cameraui.requestUpdate(version);
      for await (const output of updateStream) {
        log.feed(output);
      }
      log.flush();

      log.success(`${APP_SERVER_NAME}@${version} updated — restart to apply`);
      updatesService().notifyServerInstall('success', { version, source });
    } catch (error: any) {
      log.error(`Update of ${APP_SERVER_NAME}@${version} failed: ${error.message}`);
      updatesService().notifyServerInstall('error', { version, error: error.message, source });
      throw error;
    } finally {
      this.installInProgress = false;
    }
  }
}
