import { container } from 'tsyringe';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { getSensorDiscovery } from '../../../sensors/discovery.js';
import { UsersService } from '../../services/users.service.js';

import type { DiscoveredSensor } from '@camera.ui/sdk';
import type { Namespace, Server, Socket } from 'socket.io';
import type { ProxyServer } from '../../../rpc/index.js';
import type { DiscoveredSensorListItem, SensorDiscoveryEvents, SensorDiscoveryGenericEvent } from '../../../rpc/interfaces/sensor.js';
import type { JwtTokenDecoded } from '../../types/index.js';
import type { SocketNsp } from '../types.js';

export class SensorsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/sensors';

  private proxyServer: ProxyServer;
  private usersService: UsersService;
  private closeSubscription?: () => void;

  constructor(io: Server) {
    this.proxyServer = container.resolve<ProxyServer>('proxy');
    this.usersService = new UsersService();

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', this.onConnection.bind(this));

    this.subscribeToDiscoveryEvents();
  }

  public destroy(): void {
    this.closeSubscription?.();
  }

  private onConnection(socket: Socket): void {
    socket.on('sensors:subscribe', (_payload: unknown, callback?: (data: { success: boolean; sensors?: DiscoveredSensorListItem[]; isScanning?: boolean }) => void) => {
      const socketWithSub = socket as Socket & { sensorsSubscribed?: boolean };
      socketWithSub.sensorsSubscribed ??= true;

      const sensors = getSensorDiscovery().subscribe();
      callback?.({ success: true, sensors, isScanning: getSensorDiscovery().isScanningNow() });
    });

    socket.on('sensors:unsubscribe', (_payload: unknown, callback?: (data: { success: boolean }) => void) => {
      const socketWithSub = socket as Socket & { sensorsSubscribed?: boolean };
      if (socketWithSub.sensorsSubscribed) {
        socketWithSub.sensorsSubscribed = false;
        getSensorDiscovery().unsubscribe();
      }
      callback?.({ success: true });
    });

    socket.on('sensors:rescan', async (_payload: unknown, callback?: (data: { success: boolean; error?: string }) => void) => {
      try {
        await getSensorDiscovery().forceRescan();
        callback?.({ success: true });
      } catch (error: unknown) {
        callback?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('sensors:adopt', async (payload: { pluginId: string; sensor: DiscoveredSensor }, callback?: (data: { success: boolean; error?: string }) => void) => {
      try {
        await getSensorDiscovery().adopt(payload.pluginId, payload.sensor);
        callback?.({ success: true });
      } catch (error: unknown) {
        callback?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    socket.on('disconnect', () => {
      if ((socket as Socket & { sensorsSubscribed?: boolean }).sensorsSubscribed) {
        getSensorDiscovery().unsubscribe();
      }
    });
  }

  private async subscribeToDiscoveryEvents(): Promise<void> {
    const namespaces = NamespaceManager.sensorDiscoveryNamespaces();

    this.closeSubscription = await this.proxyServer.proxy.subscribe<SensorDiscoveryGenericEvent<keyof SensorDiscoveryEvents>>(
      namespaces.sensorDiscoverySubject,
      (event) => {
        this.broadcastEvent(event.type, event.data);
      },
    );
  }

  private broadcastEvent<K extends keyof SensorDiscoveryEvents>(eventType: K, data: SensorDiscoveryEvents[K]): void {
    for (const [, socket] of this.nsp.sockets) {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      if (!decodedToken) continue;

      const user = this.usersService.findByName(decodedToken.username);
      if (!user) continue;
      if (user.role !== 'admin' && user.role !== 'master') continue;

      // discovered lists go only to subscribed sockets
      if (eventType === 'sensors:discovered' && !(socket as Socket & { sensorsSubscribed?: boolean }).sensorsSubscribed) continue;

      socket.emit(eventType, data);
    }
  }
}
