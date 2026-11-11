import { mergeWith } from '@camera.ui/common/utils';
import { hostname } from 'node:os';

import { inject, tryInject } from '../../container.js';
import { dbRemoteSchema } from '../database/record-schemas.js';

import type { CloudApi } from '../../remote/api/index.js';
import type { DeepPartial } from '../../types.js';
import type { Database } from '../database/index.js';
import type { DBCloud, DBRemote } from '../database/types.js';
import type { RemoteRegistrationStatus } from '../types/index.js';

export class RemoteService {
  private dbs: Database;

  constructor() {
    this.dbs = inject('dbs');
  }

  private get cloudApi(): CloudApi {
    return inject('cloudApi');
  }

  public info(): DBRemote {
    return this.dbs.remoteDB.get('remote') ?? dbRemoteSchema.parse({});
  }

  public async patch(infoData: DeepPartial<DBRemote> = {}): Promise<DBRemote> {
    const info = await this.dbs.commit(this.dbs.remoteDB, 'remote', (current) => {
      const record = current ?? dbRemoteSchema.parse({});

      mergeWith(record, infoData, (source: any, target: any) => {
        if (Array.isArray(source)) {
          return target;
        }
      });

      return record;
    });

    return info ?? this.info();
  }

  public isCloudConnected(): boolean {
    const oauth = this.getCloud().oauth;
    return !!oauth && !oauth.needs_reauth;
  }

  public getCloud(): DBCloud {
    return this.dbs.cloudDB.get('cloud') ?? {};
  }

  public serverName(): string {
    return this.getCloud().name ?? hostname();
  }

  public async patchCloud(patch: Partial<DBCloud>): Promise<DBCloud> {
    const before = this.getCloud().oauth?.grant_id;
    const cloud = (await this.dbs.commit(this.dbs.cloudDB, 'cloud', (current) => ({ ...(current ?? {}), ...patch }))) ?? {};
    this.emitCloudCredsChangedIfNeeded(before, cloud.oauth?.grant_id);
    return cloud;
  }

  public async clearCloudServer(): Promise<void> {
    const before = this.getCloud().oauth?.grant_id;

    await this.dbs.commit(this.dbs.cloudDB, 'cloud', (current) => {
      const cloud = current ?? {};
      delete cloud.oauth;

      return cloud;
    });

    this.emitCloudCredsChangedIfNeeded(before, undefined);
  }

  public async initPairing(name?: string): Promise<{
    userCode: string;
    verificationUri: string;
    verificationUriComplete: string;
    expiresIn: number;
    pollInterval: number;
  }> {
    const cloud = this.getCloud();
    const serverName = name?.trim() ?? this.serverName();

    const requestedServerId = cloud.oauth?.needs_reauth ? cloud.oauth.server_id : undefined;
    const resp = await this.cloudApi.oauthRoute.startDeviceFlow(requestedServerId);

    await this.patchCloud({
      name: serverName,
      pending_pair: {
        device_code: resp.device_code,
        user_code: resp.user_code,
        interval: resp.interval,
        expires_at: Date.now() + resp.expires_in * 1000,
      },
    });

    return {
      userCode: resp.user_code,
      verificationUri: resp.verification_uri,
      verificationUriComplete: resp.verification_uri_complete,
      expiresIn: resp.expires_in,
      pollInterval: resp.interval,
    };
  }

  public async pollPairing(enabled: boolean, registrationId: string, _name?: string): Promise<{ state: 'pending' | 'confirmed' | 'expired' | 'denied' | 'slow_down' }> {
    const pending = this.getCloud().pending_pair;
    if (!pending) {
      return { state: 'expired' };
    }
    if (Date.now() > pending.expires_at) {
      await this.clearPendingPair();
      return { state: 'expired' };
    }

    const result = await this.cloudApi.oauthRoute.pollDeviceFlow(pending.device_code);
    switch (result.state) {
      case 'pending':
        return { state: 'pending' };
      case 'slow_down':
        return { state: 'slow_down' };
      case 'expired':
        await this.clearPendingPair();
        return { state: 'expired' };
      case 'denied':
        await this.clearPendingPair();
        return { state: 'denied' };
      case 'approved':
        await this.clearPendingPair();
        await this.syncTunnelClientRuntime(true);
        try {
          await this.syncServer(enabled, registrationId);
        } catch {
          // non-fatal
        }
        return { state: 'confirmed' };
      default:
        throw new Error(result.error ?? 'Pair poll failed');
    }
  }

  public async clearPendingPair(): Promise<void> {
    await this.dbs.commit(this.dbs.cloudDB, 'cloud', (current) => {
      if (!current?.pending_pair) {
        return undefined;
      }

      delete current.pending_pair;

      return current;
    });
  }

  public async updateCloudServer(enabled: boolean): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return; // not paired
    }
    await this.cloudApi.serverRoute.update({ name: this.serverName(), disabled: !enabled });
  }

  public async unregisterCloudServer(): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return;
    }

    await this.cloudApi.serverRoute.unregister().catch(() => {});
    await this.cloudApi.oauthRoute.revoke();
  }

  public async getRegistrationStatus(): Promise<RemoteRegistrationStatus> {
    const cloud = this.getCloud();

    return {
      isRegistered: !!cloud.oauth,
      needsReauth: !!cloud.oauth?.needs_reauth,
      serverName: this.serverName(),
    };
  }

  public async updateCloudServerName(name: string): Promise<void> {
    const previousName = this.getCloud().name;

    await this.dbs.commit(this.dbs.cloudDB, 'cloud', (current) => ({ ...(current ?? {}), name }));

    if (!(await this.cloudApi.credentialStore.peek())) {
      return; // not registered
    }

    const remoteAccessManager = inject('remoteAccessManager');
    const status = remoteAccessManager.getStatus();

    try {
      await this.cloudApi.serverRoute.update({ name, disabled: !status.enabled });
    } catch (err) {
      await this.dbs.commit(this.dbs.cloudDB, 'cloud', (current) => ({ ...(current ?? {}), name: previousName }));
      throw err;
    }
  }

  private async syncServer(enabled: boolean, registrationId?: string): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return;
    }
    await this.cloudApi.serverRoute.update({
      name: this.serverName(),
      disabled: !enabled,
      ...(registrationId ? { fcm_token: registrationId } : {}),
    });
  }

  private emitCloudCredsChangedIfNeeded(beforeID: string | undefined, afterID: string | undefined): void {
    if (beforeID === afterID) return;
    inject('proxy').coreManager.publishCoreManagerEvent('cloudAccountChanged', {
      connected: !!afterID,
    });
    this.syncTunnelClientRuntime(!!afterID);
    tryInject('remoteAccessManager')?.reconcileDirect();
  }

  private async syncTunnelClientRuntime(connected: boolean): Promise<void> {
    try {
      const tunnelClient = inject('tunnelClient');
      if (connected && !tunnelClient.isRunning) {
        await tunnelClient.start();
      } else if (!connected && tunnelClient.isRunning) {
        await tunnelClient.stop();
      } else if (connected && tunnelClient.isRunning) {
        await tunnelClient.restart();
      }
    } catch {
      // best-effort, the next start picks up the right state
    }
  }
}
