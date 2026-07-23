import { mergeWith } from '@camera.ui/common/utils';
import { hostname } from 'node:os';
import { container } from 'tsyringe';

import { dbRemoteSchema } from '../database/record-schemas.js';

import type { CloudApi } from '../../remote/api/index.js';
import type { RemoteAccessManager } from '../../remote/index.js';
import type { TunnelClient } from '../../remote/tunnel/client.js';
import type { ProxyServer } from '../../rpc/index.js';
import type { DeepPartial } from '../../types.js';
import type { Database } from '../database/index.js';
import type { DBCloud, DBRemote } from '../database/types.js';
import type { RemoteRegistrationStatus } from '../types/index.js';

export class RemoteService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  private get proxyServer(): ProxyServer {
    return container.resolve<ProxyServer>('proxy');
  }

  private get cloudApi(): CloudApi {
    return container.resolve<CloudApi>('cloudApi');
  }

  public info(): DBRemote {
    return this.dbs.remoteDB.get('remote') ?? dbRemoteSchema.parse({});
  }

  public async patch(infoData: DeepPartial<DBRemote> = {}): Promise<DBRemote> {
    const info = this.info();

    mergeWith(info, infoData, (source: any, target: any) => {
      if (Array.isArray(source)) {
        return target;
      }
    });

    await this.dbs.remoteDB.put('remote', info);

    return info;
  }

  public isCloudConnected(): boolean {
    const oauth = this.getCloud().oauth;
    return !!oauth && !oauth.needs_reauth;
  }

  public getCloud(): DBCloud {
    return this.dbs.cloudDB.get('cloud') ?? {};
  }

  public async patchCloud(patch: Partial<DBCloud>): Promise<DBCloud> {
    const before = this.getCloud().oauth?.grant_id;
    const cloud = { ...this.getCloud(), ...patch };
    await this.dbs.cloudDB.put('cloud', cloud);
    this.emitCloudCredsChangedIfNeeded(before, cloud.oauth?.grant_id);
    return cloud;
  }

  public async clearCloudServer(): Promise<void> {
    const cloud = this.getCloud();
    const before = cloud.oauth?.grant_id;
    delete cloud.oauth;
    await this.dbs.cloudDB.put('cloud', cloud);
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
    const serverName = name?.trim() ?? cloud.name ?? hostname();

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
          // Non-fatal.
        }
        return { state: 'confirmed' };
      default:
        throw new Error(result.error ?? 'Pair poll failed');
    }
  }

  public async clearPendingPair(): Promise<void> {
    const cloud = this.getCloud();
    if (!cloud.pending_pair) {
      return;
    }
    delete cloud.pending_pair;
    await this.dbs.cloudDB.put('cloud', cloud);
  }

  public async updateCloudServer(enabled: boolean): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return; // not paired
    }
    await this.cloudApi.serverRoute.update({ name: this.getCloud().name ?? hostname(), disabled: !enabled });
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
      serverName: cloud.name ?? hostname(),
    };
  }

  public async updateCloudServerName(name: string): Promise<void> {
    const cloud = this.getCloud();
    const previousName = cloud.name;

    cloud.name = name;
    await this.dbs.cloudDB.put('cloud', cloud);

    if (!(await this.cloudApi.credentialStore.peek())) {
      return; // not registered
    }

    const remoteAccessManager = container.resolve<RemoteAccessManager>('remoteAccessManager');
    const status = remoteAccessManager.getStatus();

    try {
      await this.cloudApi.serverRoute.update({ name, disabled: !status.enabled });
    } catch (err) {
      cloud.name = previousName;
      await this.dbs.cloudDB.put('cloud', cloud);
      throw err;
    }
  }

  private async syncServer(enabled: boolean, registrationId?: string): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return;
    }
    await this.cloudApi.serverRoute.update({
      name: this.getCloud().name ?? hostname(),
      disabled: !enabled,
      ...(registrationId ? { fcm_token: registrationId } : {}),
    });
  }

  private emitCloudCredsChangedIfNeeded(beforeID: string | undefined, afterID: string | undefined): void {
    if (beforeID === afterID) return;
    this.proxyServer.coreManager.publishCoreManagerEvent('cloudAccountChanged', {
      connected: !!afterID,
    });
    this.syncTunnelClientRuntime(!!afterID);
    this.reconcileDirectAccess();
  }

  private reconcileDirectAccess(): void {
    try {
      void container.resolve<RemoteAccessManager>('remoteAccessManager').reconcileDirect();
    } catch {
      // ignore
    }
  }

  private async syncTunnelClientRuntime(connected: boolean): Promise<void> {
    try {
      const tunnelClient = container.resolve<TunnelClient>('tunnelClient');
      if (connected && !tunnelClient.isRunning) {
        await tunnelClient.start();
      } else if (!connected && tunnelClient.isRunning) {
        await tunnelClient.stop();
      } else if (connected && tunnelClient.isRunning) {
        await tunnelClient.restart();
      }
    } catch {
      // Best-effort sync. Failure here is non-fatal — the agent will pick
      // up the correct state on the next server restart.
    }
  }
}
