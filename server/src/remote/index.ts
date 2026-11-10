import { API_EVENT } from '@camera.ui/sdk';

import { RemoteService } from '../api/services/remote.service.js';
import { inject, provide } from '../container.js';
import { RemoteNotices } from './notices.js';
import { PushService } from './push.js';
import { RemoteAccessService } from './services/index.js';
import { ProxyService } from './tunnel/index.js';
import { TurnRelay } from './turnRelay.js';

import type { Logger } from '@camera.ui/common';
import type { CameraUiAPI } from '../api.js';
import type { DBRemoteDirectMode } from '../api/database/types.js';
import type { ConfigService } from '../services/config/index.js';
import type { ManagedTunnelStatus } from './services/cloudflare-managed.js';
import type { RemoteAccessStatus, RemoteTestResult, TunnelStatus } from './types.js';

export class RemoteAccessManager {
  public readonly turnRelay: TurnRelay;

  private api: CameraUiAPI;
  private logger: Logger;
  private configService: ConfigService;

  private remoteService: RemoteService;
  private proxyService: ProxyService;
  private pushService: PushService;
  private remoteAccessService: RemoteAccessService;
  private notices: RemoteNotices;

  constructor() {
    provide('remoteAccessManager', this);

    this.api = inject('api');
    this.configService = inject('configService');
    const loggerService = inject('logger');

    this.logger = loggerService.createSystemLogger('Remote');

    this.remoteService = new RemoteService();
    this.pushService = new PushService(this.logger);
    this.pushService.on('connected', () => this.deliverPushToken());
    this.proxyService = new ProxyService(this.pushService, this.logger);
    this.remoteAccessService = new RemoteAccessService(this.logger, this.proxyService);
    this.notices = new RemoteNotices(() => this.remoteAccessService.reachableFromOutside());
    this.turnRelay = new TurnRelay(this.remoteService, this.logger);

    this.api.setMaxListeners(this.api.getMaxListeners() + 1);
    this.api.once(API_EVENT.SHUTDOWN, () => {
      this.stop();
    });
  }

  public get pushToken(): string | undefined {
    return this.pushService.registrationId;
  }

  public async start(): Promise<void> {
    this.syncPush();
    this.notices.start();
    await this.remoteAccessService.start();
  }

  public stop(): void {
    this.notices.stop();
    this.remoteAccessService.stop();
    this.pushService.disconnect();
    this.proxyService.disconnect();
  }

  public async update(): Promise<void> {
    await this.remoteAccessService.update();
  }

  public async reconcileDirect(): Promise<void> {
    this.syncPush();
    await this.remoteAccessService.reconcile();
  }

  public async restartTunnel(): Promise<void> {
    await this.remoteAccessService.restartTunnel();
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

  private syncPush(): void {
    if (this.remoteService.getCloud().oauth) {
      this.pushService.connectInBackground();
    }
  }

  private async deliverPushToken(): Promise<void> {
    const token = this.pushService.registrationId;
    const cloudApi = inject('cloudApi');
    const creds = await cloudApi.credentialStore.peek();
    if (!token || !creds || creds.needs_reauth) {
      return;
    }

    try {
      await cloudApi.serverRoute.update({ disabled: !this.remoteAccessService.getStatus().enabled, fcm_token: token });
    } catch (error: any) {
      this.logger.warn('Could not send the push token to the cloud:', error?.message ?? error);
    }
  }
}
