import { buildHttpsUrl, fetchViableNetworkAddresses } from '@camera.ui/common/network';
import { APP_SERVER_NAME, IS_ELECTRON, mergeWith } from '@camera.ui/common/utils';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { satisfies } from 'semver';

import { inject } from '../../container.js';
import { instanceLanguage } from '../../i18n/index.js';
import { ConfigService } from '../../services/config/index.js';
import { assertServerUpdateSpace } from '../../utils/disk-space.js';
import { getTerminalCols, InstallLogger } from '../utils/install-logger.js';
import { updatesService } from './updates.service.js';

import type { Database } from '../database/index.js';
import type { DBServer } from '../database/types.js';
import type { LanguageAbbreviations } from '../schemas/users.schema.js';

export class ServerService {
  private dbs: Database;

  private installInProgress = false;

  constructor() {
    this.dbs = inject('dbs');
  }

  public info(): DBServer {
    return this.dbs.serverDB.get('server')!;
  }

  public networkEndpoints(): { internalAddresses: string[]; externalAddresses: string[]; ca?: string } {
    const configService = inject('configService');
    const allAddresses = fetchViableNetworkAddresses();
    const selectedAddresses = this.info().serverAddresses ?? [];
    const port = configService.config.port;

    const internalAddresses = allAddresses
      .filter((addr) => (selectedAddresses.length === 0 ? addr.isPrivate : selectedAddresses.includes(addr.address)))
      .map((addr) => buildHttpsUrl(addr.address, port));

    // a local candidate only, go2rtc filters compare IP literals and a hostname gathers nothing
    const localUrl = this.info().localUrl?.trim();
    if (localUrl) internalAddresses.unshift(localUrl);

    const remoteStatus = inject('remoteAccessManager').getStatus();
    const externalAddresses: string[] = [];
    if (remoteStatus.externalUrl) externalAddresses.push(remoteStatus.externalUrl);

    return { internalAddresses, externalAddresses, ca: this.caCertificate() };
  }

  private caCertificate(): string | undefined {
    const caFile = inject('configService').ROOT_CERT_FILE;
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

  public async setLanguage(language: LanguageAbbreviations): Promise<void> {
    if (language === instanceLanguage()) return;
    await this.dbs.commit(this.dbs.settingsDB, 'settings', (current) => current && { ...current, language });

    inject('proxy').coreManager?.publishCoreManagerEvent('languageChanged', { language });
    const assistant = inject('assistantManager');
    if (!assistant.settings().language) assistant.announceAccess();
  }

  public async install(version = 'latest', opts: { internal?: boolean } = {}): Promise<void> {
    const log = new InstallLogger(
      (message) => inject('socketService').io.of('/logs').emit('stdout/server', message),
      () => getTerminalCols('server'),
    );

    log.header(`Update · ${APP_SERVER_NAME}@${version}`, { user: userInfo().username });

    if (this.installInProgress) {
      log.error('Update already in progress.');
      throw new Error('Update already in progress.');
    }

    if (!IS_ELECTRON) {
      try {
        assertServerUpdateSpace(inject('configService').HOME_PATH);
      } catch (error: any) {
        log.error(error.message);
        throw error;
      }
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

      const updateStream = await inject('cameraui').requestUpdate(version);
      for await (const output of updateStream) {
        log.feed(output);
      }
      log.flush();

      log.success(`${APP_SERVER_NAME}@${version} updated, restart to apply`);
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
