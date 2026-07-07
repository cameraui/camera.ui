import { EventEmitter } from 'node:events';
import { container } from 'tsyringe';

import { CamerasService } from './api/services/cameras.service.js';
import { PluginsService } from './api/services/plugins.service.js';
import { CameraController } from './camera/controller.js';

import type { API_EVENT, Camera, PluginAssignments } from '@camera.ui/sdk';
import type { InternalEventBus } from './internal-bus.js';
import type { ProxyServer } from './rpc/index.js';
import type { LoggerService } from './services/logger/index.js';

export declare interface CameraUiAPI {
  on(event: API_EVENT, listener: () => void): this;
  emit(event: API_EVENT): boolean;
}

export class CameraUiAPI extends EventEmitter {
  public readonly cameraControllers = new Map<string, CameraController>();

  private _camerasService?: CamerasService;
  private _pluginsService?: PluginsService;

  constructor() {
    super();

    container.registerInstance('api', this);
  }

  public async configureCameras(): Promise<void> {
    // Clean up cameras that reference non-existent plugins (e.g., renamed/removed plugins)
    await this.camerasService.cleanupNonExistentPlugins();

    const cameras = this.camerasService.listTransformed();
    await Promise.all(cameras.map((camera) => this.addCamera(camera)));
  }

  public async addCamera(camera: Camera): Promise<CameraController> {
    let cameraController = this.cameraControllers.get(camera._id);

    if (!cameraController) {
      const logger = container.resolve<LoggerService>('logger');
      const cameraLogger = logger.createCameraLogger(camera._id, camera.name);

      cameraController = new CameraController(camera, cameraLogger);
      await cameraController.init();

      this.cameraControllers.set(camera._id, cameraController);

      try {
        const bus = container.resolve<InternalEventBus>('internalBus');
        bus.emitEvent('camera:added', { cameraId: camera._id, cameraName: camera.name });
      } catch {
        // ignore
      }

      try {
        const proxyServer = container.resolve<ProxyServer>('proxy');
        proxyServer.discoveryManager.notifyCameraUpdated(camera._id);
      } catch {
        // proxy may not be ready during initial boot
      }
    }

    return cameraController;
  }

  public getCamera(cameraIdOrName: string): CameraController | undefined {
    let cameraController = this.cameraControllers.get(cameraIdOrName);

    if (!cameraController) {
      const cameras = Array.from(this.cameraControllers.values());
      cameraController = cameras.find((cc) => cc.name === cameraIdOrName);
    }

    return cameraController;
  }

  public getCameras(pluginId?: string): CameraController[] {
    const cameraController = Array.from(this.cameraControllers.values());

    if (pluginId) {
      return cameraController.filter((cc) => cc.pluginInfo?.id === pluginId);
    }

    return cameraController;
  }

  public updateCamera(camera: Camera): void {
    const proxyServer = container.resolve<ProxyServer>('proxy');
    const cameraController = this.cameraControllers.get(camera._id);
    cameraController?.updateCamera(camera);

    proxyServer.discoveryManager.notifyCameraUpdated(camera._id);
  }

  public async removeCamera(camera: Camera, assignments: PluginAssignments): Promise<void> {
    const proxyServer = container.resolve<ProxyServer>('proxy');
    const cameraController = this.cameraControllers.get(camera._id);

    if (cameraController) {
      await cameraController.stop();

      const pluginIds = new Set<string>();

      for (const [_sensorType, plugin] of Object.entries(assignments)) {
        if (Array.isArray(plugin)) {
          for (const p of plugin) {
            const foundPlugin = this.pluginsService.getPluginByName(p.name);
            if (foundPlugin) {
              pluginIds.add(foundPlugin.id);
            }
          }
        } else if (plugin && typeof plugin === 'object' && 'name' in plugin) {
          const foundPlugin = this.pluginsService.getPluginByName(plugin.name);
          if (foundPlugin) {
            pluginIds.add(foundPlugin.id);
          }
        }
      }

      // deselectCamera skips owner plugins, so notify the owner directly below
      await Promise.allSettled(Array.from(pluginIds).map((pluginId) => this.deselectCamera(pluginId, camera)));

      if (camera.pluginInfo?.id && this.pluginCanReceiveEvents(camera.pluginInfo.id)) {
        await proxyServer.deviceManager.requestDeviceManagerEvent(camera.pluginInfo.id, 'cameraReleased', { cameraId: camera._id });
      }

      try {
        const bus = container.resolve<InternalEventBus>('internalBus');
        bus.emitEvent('camera:removed', { cameraId: camera._id, cameraName: camera.name });
      } catch {
        // ignore
      }

      this.cameraControllers.delete(camera._id);

      proxyServer.discoveryManager.notifyCameraDeleted(camera._id, camera.pluginInfo?.id);
    }
  }

  public async selectCamera(pluginId: string, camera: Camera): Promise<void> {
    if (camera.pluginInfo?.id === pluginId) {
      return;
    }

    const proxyServer = container.resolve<ProxyServer>('proxy');

    if (!this.cameraControllers.get(camera._id)) {
      this.addCamera(camera);
    }

    if (this.pluginCanReceiveEvents(pluginId)) {
      await proxyServer.deviceManager.requestDeviceManagerEvent(pluginId, 'cameraAdded', { camera });
    }
  }

  public async deselectCamera(pluginId: string, camera: Camera): Promise<void> {
    if (camera.pluginInfo?.id === pluginId) {
      return;
    }

    const proxyServer = container.resolve<ProxyServer>('proxy');
    if (this.pluginCanReceiveEvents(pluginId)) {
      await proxyServer.deviceManager.requestDeviceManagerEvent(pluginId, 'cameraReleased', { cameraId: camera._id });
    }

    const cameraController = this.cameraControllers.get(camera._id);
    cameraController?.removePluginSensors(pluginId);
  }

  private pluginCanReceiveEvents(pluginId: string): boolean {
    const plugin = this.pluginsService.getPluginById(pluginId);
    return !!plugin && !plugin.disabled && plugin.worker.isRunning();
  }

  // Lazy-instantiated services. CameraUiAPI is constructed before Database, so
  // eager construction would crash at boot — these getters defer until first use.
  private get camerasService(): CamerasService {
    return (this._camerasService ??= new CamerasService());
  }

  private get pluginsService(): PluginsService {
    return (this._pluginsService ??= new PluginsService());
  }
}
