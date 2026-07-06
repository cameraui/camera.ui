import { PushReceiver } from '@eneris/push-receiver';
import { EventEmitter } from 'node:events';

import { RemoteService } from '../api/services/remote.service.js';

import type { Types } from '@eneris/push-receiver/dist/client.js';

export class PushService extends EventEmitter {
  private remoteService: RemoteService;
  private pushReceiver: PushReceiver;
  private registrationIdPromise = Promise.withResolvers<string>();

  private _connected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    super();

    this.remoteService = new RemoteService();

    this.pushReceiver = new PushReceiver({
      ...this.getPushReceiverConfig(),
      firebase: {
        apiKey: 'AIzaSyDItp2IsB99y12LFz8tYu9xJvuu81CwT5o',
        authDomain: 'camera-ui-auth.firebaseapp.com',
        projectId: 'camera-ui-auth',
        storageBucket: 'camera-ui-auth.firebasestorage.app',
        messagingSenderId: '572971064517',
        appId: '1:572971064517:web:d56fbf6fb7ad3d501864ac',
        measurementId: 'G-LTBRW89JEH',
      },
      heartbeatIntervalMs: 15 * 60 * 1000,
    });

    this.pushReceiver.onCredentialsChanged(({ newCredentials }) => {
      const config = this.getPushReceiverConfig();
      config.credentials = newCredentials;
      this.savePushReceiverConfig(config);

      if (newCredentials.fcm?.token) {
        this.registrationIdPromise.resolve(newCredentials.fcm.token);
      }
    });

    this.pushReceiver.onNotification(({ message }) => {
      const config = this.getPushReceiverConfig();
      config.persistentIds = this.pushReceiver.persistentIds;
      this.savePushReceiverConfig(config);
      this.emit('notification', message);
    });

    this.registrationIdPromise.promise.catch(() => {});
  }

  public get connected(): boolean {
    return this._connected;
  }

  public async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.pushReceiver.connect();
    await this.connectionPromise;
    this.connectionPromise = null;
    this._connected = true;
  }

  public async getRegistrationId(): Promise<string> {
    if (!this._connected) {
      await this.connect();
    }

    const config = this.getPushReceiverConfig();
    if (config.credentials?.fcm?.token) {
      return config.credentials.fcm.token;
    }

    return this.registrationIdPromise.promise;
  }

  public disconnect(): void {
    if (!this._connected) {
      return;
    }

    this._connected = false;
    this.registrationIdPromise.reject(new Error('Disconnected from PushReceiver'));

    this.pushReceiver.destroy();
  }

  private getPushReceiverConfig(): Partial<Types.ClientConfig> {
    return this.remoteService.getCloud().push ?? {};
  }

  private async savePushReceiverConfig(config: Partial<Types.ClientConfig>): Promise<void> {
    const existing = this.remoteService.getCloud().push ?? {};
    await this.remoteService.patchCloud({
      push: { ...existing, ...config },
    });
  }
}
