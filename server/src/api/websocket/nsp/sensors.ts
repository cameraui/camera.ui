import { inject } from '../../../container.js';
import { NamespaceManager } from '../../../rpc/namespaces.js';
import { getSensorDiscovery } from '../../../sensors/discovery.js';
import { UsersService } from '../../services/users.service.js';

import type { DiscoveredSensor } from '@camera.ui/sdk';
import type { Namespace, Server, Socket } from 'socket.io';
import type { ProxyServer } from '../../../rpc/index.js';
import type {
  DiscoveredSensorListItem,
  SensorDiscoveryEvents,
  SensorDiscoveryGenericEvent,
  SensorEventMessage,
  SensorSourceChangedEvent,
  SensorsNamespaceEvents,
} from '../../../rpc/interfaces/sensor.js';
import type { DBHiddenSensor } from '../../database/types.js';
import type { JwtTokenDecoded } from '../../types/index.js';
import type { SocketNsp } from '../types.js';

interface HiddenSensorsResult {
  success: boolean;
  hiddenSensors?: DBHiddenSensor[];
  error?: string;
}

export class SensorsNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/sensors';

  private proxyServer: ProxyServer;
  private usersService: UsersService;
  private closeDiscoverySubscription?: () => void;
  private closeRegistrySubscription?: () => void;

  constructor(io: Server) {
    this.proxyServer = inject('proxy');
    this.usersService = new UsersService();

    this.nsp = io.of(this.nspName);
    this.nsp.on('connection', this.onConnection.bind(this));

    this.subscribeToDiscoveryEvents();
    this.subscribeToRegistryEvents();
  }

  public destroy(): void {
    this.closeDiscoverySubscription?.();
    this.closeRegistrySubscription?.();
  }

  private onConnection(socket: Socket): void {
    socket.on(
      'sensors:subscribe',
      (
        _payload: unknown,
        callback?: (data: { success: boolean; sensors?: DiscoveredSensorListItem[]; isScanning?: boolean; hiddenSensors?: DBHiddenSensor[] }) => void,
      ) => {
        const socketWithSub = socket as Socket & { sensorsSubscribed?: boolean };
        const discovery = getSensorDiscovery();
        const sensors = socketWithSub.sensorsSubscribed ? discovery.list() : discovery.subscribe();
        socketWithSub.sensorsSubscribed = true;

        const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
        const hiddenSensors = decodedToken ? this.usersService.getHiddenSensors(decodedToken.username) : [];

        callback?.({ success: true, sensors, isScanning: discovery.isScanningNow(), hiddenSensors });
      },
    );

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

    socket.on('sensors:hide', (payload: { sensors: DBHiddenSensor[] }, callback?: (data: HiddenSensorsResult) => void) => {
      this.handleHiddenSensors(socket, payload, callback, (username, sensors) => this.usersService.hideSensors(username, sensors));
    });

    socket.on('sensors:unhide', (payload: { sensors: DBHiddenSensor[] }, callback?: (data: HiddenSensorsResult) => void) => {
      this.handleHiddenSensors(socket, payload, callback, (username, sensors) => this.usersService.unhideSensors(username, sensors));
    });

    socket.on('disconnect', () => {
      if ((socket as Socket & { sensorsSubscribed?: boolean }).sensorsSubscribed) {
        getSensorDiscovery().unsubscribe();
      }
    });
  }

  private async handleHiddenSensors(
    socket: Socket,
    payload: { sensors: DBHiddenSensor[] },
    callback: ((data: HiddenSensorsResult) => void) | undefined,
    apply: (username: string, sensors: DBHiddenSensor[]) => Promise<DBHiddenSensor[]>,
  ): Promise<void> {
    const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
    if (!decodedToken) {
      callback?.({ success: false, error: 'Unauthorized' });
      return;
    }

    try {
      const hiddenSensors = await apply(decodedToken.username, hiddenSensorList(payload?.sensors));
      callback?.({ success: true, hiddenSensors });
    } catch (error: unknown) {
      callback?.({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private async subscribeToDiscoveryEvents(): Promise<void> {
    const namespaces = NamespaceManager.sensorDiscoveryNamespaces();

    this.closeDiscoverySubscription = await this.proxyServer.proxy.subscribe<SensorDiscoveryGenericEvent<keyof SensorDiscoveryEvents>>(
      namespaces.sensorDiscoverySubject,
      (event) => {
        this.broadcastEvent(event.type, event.data);
      },
    );
  }

  private async subscribeToRegistryEvents(): Promise<void> {
    const namespaces = NamespaceManager.sensorRegistryNamespaces();

    this.closeRegistrySubscription = await this.proxyServer.proxy.subscribe<SensorEventMessage>(namespaces.sensorsSubject, (event) => {
      if (event.type === 'sensor:source:changed') this.broadcastEvent('sensor:source:changed', event.data as SensorSourceChangedEvent);
    });
  }

  private broadcastEvent<K extends keyof SensorsNamespaceEvents>(eventType: K, data: SensorsNamespaceEvents[K]): void {
    for (const [, socket] of this.nsp.sockets) {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      if (!decodedToken) continue;

      const user = this.usersService.findByName(decodedToken.username);
      if (!user) continue;
      if (user.role !== 'admin' && user.role !== 'master') continue;

      if (eventType === 'sensors:discovered' && !(socket as Socket & { sensorsSubscribed?: boolean }).sensorsSubscribed) continue;

      socket.emit(eventType, data);
    }
  }
}

function hiddenSensorList(value: unknown): DBHiddenSensor[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is DBHiddenSensor => typeof entry?.pluginName === 'string' && typeof entry?.id === 'string')
    .map(({ pluginName, id }) => ({ pluginName, id }));
}
