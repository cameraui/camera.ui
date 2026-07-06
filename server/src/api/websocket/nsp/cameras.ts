import { container } from 'tsyringe';

import { NamespaceManager } from '../../../rpc/namespaces.js';
import { UsersService } from '../../services/users.service.js';

import type { Namespace, Server, Socket } from 'socket.io';
import type { LoggerService } from '../../../services/logger/index.js';
import type { ProxyServer } from '../../../rpc/index.js';
import type { DeviceListItem, DiscoveryManagerProxyEvents, DiscoveryManagerProxyGenericEvent } from '../../../rpc/interfaces/discovery.js';
import type { DBCamera, DBHiddenDevice } from '../../database/types.js';
import type { JwtTokenDecoded } from '../../types/index.js';
import type { SocketNsp } from '../types.js';

export class CamerasNamespace {
  public nsp: Namespace;
  public nspName: SocketNsp = '/cameras';

  private logger: LoggerService;
  private proxyServer: ProxyServer;
  private usersService: UsersService;
  private closeSubscription?: () => void;

  constructor(io: Server) {
    this.logger = container.resolve<LoggerService>('logger');
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
    socket.on('cameras:subscribe', (_payload: unknown, callback?: (data: { success: boolean; devices?: DeviceListItem[] }) => void) => {
      this.handleSubscribe(socket, callback);
    });

    socket.on('cameras:unsubscribe', (_payload: unknown, callback?: (data: { success: boolean }) => void) => {
      this.handleUnsubscribe(socket, callback);
    });

    socket.on('cameras:rescan', (_payload: unknown, callback?: (data: { success: boolean; error?: string }) => void) => {
      this.handleRescan(socket, callback);
    });

    socket.on('cameras:get-schema', (payload: { discoveredId: string }, callback?: (data: { success: boolean; schema?: unknown[]; error?: string }) => void) => {
      this.handleGetSchema(socket, payload, callback);
    });

    socket.on(
      'cameras:connect',
      (
        payload: { discoveredId: string; credentials: Record<string, unknown> },
        callback?: (data: { success: boolean; cameraId?: string; cameraName?: string; error?: string }) => void,
      ) => {
        this.handleConnect(socket, payload, callback);
      },
    );

    socket.on(
      'cameras:prepare',
      (payload: { discoveredId: string; credentials: Record<string, unknown> }, callback?: (data: { success: boolean; draft?: DBCamera; error?: string }) => void) => {
        this.handlePrepare(socket, payload, callback);
      },
    );

    socket.on(
      'cameras:confirm',
      (payload: { draft: DBCamera; discoveredId?: string }, callback?: (data: { success: boolean; cameraId?: string; cameraName?: string; error?: string }) => void) => {
        this.handleConfirm(socket, payload, callback);
      },
    );

    socket.on(
      'cameras:hide-device',
      (payload: { device: DBHiddenDevice }, callback?: (data: { success: boolean; hiddenDevices?: DBHiddenDevice[]; error?: string }) => void) => {
        this.handleHideDevice(socket, payload, callback);
      },
    );

    socket.on(
      'cameras:unhide-device',
      (payload: { deviceId: string }, callback?: (data: { success: boolean; hiddenDevices?: DBHiddenDevice[]; error?: string }) => void) => {
        this.handleUnhideDevice(socket, payload, callback);
      },
    );

    socket.on('disconnect', () => {
      if ((socket as Socket & { camerasSubscribed?: boolean }).camerasSubscribed) {
        this.proxyServer.discoveryManager.unsubscribe();
      }
    });
  }

  private async subscribeToDiscoveryEvents(): Promise<void> {
    const namespaces = NamespaceManager.discoveryManagerNamespaces();

    this.closeSubscription = await this.proxyServer.proxy.subscribe<DiscoveryManagerProxyGenericEvent<keyof DiscoveryManagerProxyEvents>>(
      namespaces.discoveryManagerSubject,
      (event) => {
        this.broadcastEvent(event.type, event.data);
      },
    );
  }

  private broadcastEvent<K extends keyof DiscoveryManagerProxyEvents>(eventType: K, data: DiscoveryManagerProxyEvents[K]): void {
    const sockets = this.nsp.sockets;

    for (const [, socket] of sockets) {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      if (!decodedToken) continue;

      const user = this.usersService.findByName(decodedToken.username);
      if (!user) continue;

      if (user.role !== 'admin' && user.role !== 'master') continue;

      const isSubscribed = (socket as Socket & { camerasSubscribed?: boolean }).camerasSubscribed;

      // device updates (discovered/list) go only to subscribed sockets
      if (eventType === 'cameras:discovered') {
        if (!isSubscribed) continue;
      }

      socket.emit(eventType, data);
    }
  }

  private handleSubscribe(
    socket: Socket,
    callback?: (data: { success: boolean; devices?: DeviceListItem[]; isScanning?: boolean; hiddenDevices?: DBHiddenDevice[] }) => void,
  ): void {
    const socketWithSub = socket as Socket & { camerasSubscribed?: boolean };
    socketWithSub.camerasSubscribed ??= true;

    const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
    const hiddenDevices = decodedToken ? this.usersService.getHiddenDevices(decodedToken.username) : [];

    const devices = this.proxyServer.discoveryManager.subscribe();
    const isScanning = this.proxyServer.discoveryManager.isScanningNow();
    callback?.({ success: true, devices, isScanning, hiddenDevices });
  }

  private handleUnsubscribe(socket: Socket, callback?: (data: { success: boolean }) => void): void {
    const socketWithSub = socket as Socket & { camerasSubscribed?: boolean };

    if (socketWithSub.camerasSubscribed) {
      socketWithSub.camerasSubscribed = false;
      this.proxyServer.discoveryManager.unsubscribe();
    }

    callback?.({ success: true });
  }

  private async handleRescan(_socket: Socket, callback?: (data: { success: boolean; error?: string }) => void): Promise<void> {
    try {
      await this.proxyServer.discoveryManager.forceRescan();
      callback?.({ success: true });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handleGetSchema(
    _socket: Socket,
    payload: { discoveredId: string },
    callback?: (data: { success: boolean; schema?: unknown[]; error?: string }) => void,
  ): Promise<void> {
    try {
      const schema = await this.proxyServer.discoveryManager.getConnectionSchema(payload.discoveredId);
      callback?.({ success: true, schema });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handleConnect(
    _socket: Socket,
    payload: { discoveredId: string; credentials: Record<string, unknown> },
    callback?: (data: { success: boolean; cameraId?: string; cameraName?: string; error?: string }) => void,
  ): Promise<void> {
    try {
      const result = await this.proxyServer.discoveryManager.connect(payload.discoveredId, payload.credentials);
      callback?.({ success: true, cameraId: result.cameraId, cameraName: result.cameraName });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handlePrepare(
    _socket: Socket,
    payload: { discoveredId: string; credentials: Record<string, unknown> },
    callback?: (data: { success: boolean; draft?: DBCamera; error?: string }) => void,
  ): Promise<void> {
    try {
      const draft = await this.proxyServer.discoveryManager.prepareCamera(payload.discoveredId, payload.credentials);
      callback?.({ success: true, draft });
    } catch (error: unknown) {
      this.logger.error(`Failed to prepare discovered camera "${payload.discoveredId}":`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handleConfirm(
    _socket: Socket,
    payload: { draft: DBCamera; discoveredId?: string },
    callback?: (data: { success: boolean; cameraId?: string; cameraName?: string; error?: string }) => void,
  ): Promise<void> {
    try {
      const result = await this.proxyServer.discoveryManager.confirmCamera(payload.draft, payload.discoveredId);
      callback?.({ success: true, cameraId: result.cameraId, cameraName: result.cameraName });
    } catch (error: unknown) {
      this.logger.error(`Failed to confirm discovered camera "${payload.discoveredId ?? 'unknown'}":`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handleHideDevice(
    socket: Socket,
    payload: { device: DBHiddenDevice },
    callback?: (data: { success: boolean; hiddenDevices?: DBHiddenDevice[]; error?: string }) => void,
  ): Promise<void> {
    try {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      if (!decodedToken) {
        callback?.({ success: false, error: 'Unauthorized' });
        return;
      }

      const hiddenDevices = await this.usersService.hideDevice(decodedToken.username, payload.device);
      callback?.({ success: true, hiddenDevices });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }

  private async handleUnhideDevice(
    socket: Socket,
    payload: { deviceId: string },
    callback?: (data: { success: boolean; hiddenDevices?: DBHiddenDevice[]; error?: string }) => void,
  ): Promise<void> {
    try {
      const decodedToken = socket.decodedToken as JwtTokenDecoded | undefined;
      if (!decodedToken) {
        callback?.({ success: false, error: 'Unauthorized' });
        return;
      }

      const hiddenDevices = await this.usersService.unhideDevice(decodedToken.username, payload.deviceId);
      callback?.({ success: true, hiddenDevices });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      callback?.({ success: false, error: errorMessage });
    }
  }
}
