import { API_EVENT } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { PushService } from './push.js';
import { RemoteAccessService } from './services/index.js';
import { ProxyService } from './tunnel/index.js';

import type { Logger } from '@camera.ui/common';
import type { CameraUiAPI } from '../api.js';
import type { DBRemoteDirectMode } from '../api/database/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ManagedTunnelStatus } from './services/cloudflare-managed.js';
import type { RemoteAccessStatus, RemoteTestResult, TunnelStatus } from './types.js';

export class RemoteAccessManager {
  private api: CameraUiAPI;
  private logger: Logger;
  private configService: ConfigService;

  private proxyService: ProxyService;
  private pushService: PushService;
  private remoteAccessService: RemoteAccessService;

  constructor() {
    container.registerInstance('remoteAccessManager', this);

    this.api = container.resolve<CameraUiAPI>('api');
    this.configService = container.resolve<ConfigService>('configService');
    const loggerService = container.resolve<LoggerService>('logger');

    this.logger = loggerService.createSystemLogger('Remote');

    this.pushService = new PushService();
    this.proxyService = new ProxyService(this.pushService, this.logger);
    this.remoteAccessService = new RemoteAccessService(this.logger, this.proxyService);

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.stop();
    });
  }

  public async start(): Promise<void> {
    await this.pushService.connect();
    this.remoteAccessService.start();
  }

  public stop(): void {
    this.remoteAccessService.stop();
    this.pushService.disconnect();
    this.proxyService.disconnect();
  }

  public async update(): Promise<void> {
    await this.remoteAccessService.update();
  }

  public async reconcileDirect(): Promise<void> {
    await this.remoteAccessService.reconcile();
  }

  public async getRegistrationId(): Promise<string> {
    return this.pushService.getRegistrationId();
  }

  public getStatus(): RemoteAccessStatus {
    return this.remoteAccessService.getStatus();
  }

  public async getTunnelStatus(): Promise<TunnelStatus> {
    return this.proxyService.getStatus();
  }

  public async testMode(mode: DBRemoteDirectMode): Promise<RemoteTestResult> {
    return this.remoteAccessService.test(mode);
  }

  public cloudflareManagedStatus(): ManagedTunnelStatus {
    return this.remoteAccessService.managedStatus();
  }

  public cloudflareManagedConnect(hostname: string): void {
    this.remoteAccessService.managedConnect(hostname);
  }

  public async cloudflareManagedCancel(): Promise<void> {
    await this.remoteAccessService.managedCancel();
  }

  public async cloudflareManagedDisconnect(): Promise<void> {
    await this.remoteAccessService.managedDisconnect();
  }

  public async cloudflareManagedLogout(): Promise<void> {
    await this.remoteAccessService.managedLogout();
  }
}
