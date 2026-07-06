import { EventEmitter } from 'node:events';
import { container } from 'tsyringe';

import { RemoteService } from '../../api/services/remote.service.js';

import type { Logger } from '@camera.ui/common';
import type { ProxyServer } from '../../rpc/index.js';
import type { PushService } from '../push.js';
import type { TunnelStatus } from '../types.js';

interface CloudBaseResponse {
  success: boolean;
}

interface CloudStatusResponse extends CloudBaseResponse {
  data: {
    status: 'connected' | 'disconnected';
    connected_at?: number;
  };
}

const STATUS_SUBJECT = 'tunnel.client.status';
const SHUTDOWN_SUBJECT = 'tunnel.client.shutdown';
const FORCE_RECONNECT_SUBJECT = 'tunnel.client.force-reconnect';

const CLOUD_RETRY_OPTIONS = {
  noResponderRetry: { maxRetries: 5, delays: [500, 1000, 2000, 3000, 3000] },
};

export class ProxyService extends EventEmitter {
  private remoteService: RemoteService;
  private proxyServer: ProxyServer;

  constructor(
    private pushService: PushService,
    private logger: Logger,
  ) {
    super();

    this.remoteService = new RemoteService();
    this.proxyServer = container.resolve<ProxyServer>('proxy');

    this.pushService.on('notification', (message) => {
      if (message.data?.type === 'server_deleted') {
        this.handleServerDeleted();
      } else if (message.data?.type === 'force_reconnect') {
        this.handleForceReconnect();
      }
    });
  }

  public async getStatus(): Promise<TunnelStatus> {
    try {
      const response = await this.proxyServer.proxy.request<{}, CloudStatusResponse>(STATUS_SUBJECT, {}, CLOUD_RETRY_OPTIONS);
      const data = response.data;

      return {
        connected: data.status === 'connected',
        connectedAt: data.connected_at,
      };
    } catch {
      return { connected: false };
    }
  }

  public async disconnect(): Promise<void> {
    try {
      this.logger.log('Stopping cloud tunnel agent...');
      await this.proxyServer.proxy.request<{}, CloudBaseResponse>(SHUTDOWN_SUBJECT, {}, CLOUD_RETRY_OPTIONS);
    } catch {
      // ignore — agent may already be down
    }
  }

  private async handleServerDeleted(): Promise<void> {
    this.logger.log('Server was deleted from camera.ui cloud, cleaning up...');

    await this.disconnect();
    await this.remoteService.clearCloudServer();

    this.logger.log('Cloud server credentials removed');
  }

  private async handleForceReconnect(): Promise<void> {
    try {
      this.logger.log('Force-reconnect requested by camera.ui cloud');
      await this.proxyServer.proxy.request<{}, CloudBaseResponse>(FORCE_RECONNECT_SUBJECT, {}, CLOUD_RETRY_OPTIONS);
    } catch (error) {
      this.logger.error('Failed to forward force-reconnect to agent:', error);
    }
  }
}
