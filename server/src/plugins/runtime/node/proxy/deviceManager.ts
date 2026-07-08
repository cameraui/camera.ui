import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { CameraDeviceProxy } from './cameraDevice.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { BasePlugin, Camera, DeviceManager, DiscoveredCamera, PluginInfo } from '@camera.ui/sdk';
import type { DeviceManagerInterface, DeviceManagerListenerMessagePayload } from '../../../../rpc/interfaces/device.js';
import type { DiscoveryManagerInterface } from '../../../../rpc/interfaces/discovery.js';
import type { DeviceManagerNamespaces, DiscoveryManagerNamespaces, PluginNamespaces } from '../../../../rpc/namespaces.js';
import type { StorageController } from '../storageController.js';

export class DeviceManagerProxy implements DeviceManager {
  #proxy: RPCClient;
  #storageController: StorageController;
  #logger: Logger;
  #pluginInfo: PluginInfo;
  #pluginInstance?: BasePlugin;

  #initialized = false;

  #closeRequests?: () => void;
  #namespaces: DeviceManagerNamespaces & PluginNamespaces & DiscoveryManagerNamespaces;

  #devices = new Map<string, CameraDeviceProxy>();

  constructor(proxy: RPCClient, storageController: StorageController, pluginInfo: PluginInfo, logger: Logger) {
    this.#proxy = proxy;
    this.#storageController = storageController;
    this.#logger = logger;
    this.#pluginInfo = pluginInfo;
    this.#namespaces = {
      ...NamespaceManager.deviceManagerNamespaces(),
      ...NamespaceManager.pluginNamespaces(this.#pluginInfo.id),
      ...NamespaceManager.discoveryManagerNamespaces(),
    };
  }

  public setPlugin(plugin: BasePlugin): void {
    this.#pluginInstance = plugin;
  }

  public async init(): Promise<void> {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;
    this.#closeRequests = await this.#proxy.onRequest<DeviceManagerListenerMessagePayload>(this.#namespaces.pluginDeviceManagerSubject, this.#onEventMessage.bind(this));
  }

  public async getCamera(cameraIdOrName: string): Promise<CameraDeviceProxy | undefined> {
    let cameraDevice = await this.#getCameraDevice(cameraIdOrName);

    if (!cameraDevice) {
      const camera = await this.#deviceManagerProxy.getCamera(cameraIdOrName, this.#pluginInfo.id);

      if (camera) {
        cameraDevice = await this.#getCameraDevice(camera);
      }
    }

    return cameraDevice;
  }

  public async pushDiscoveredCameras(cameras: DiscoveredCamera[]): Promise<void> {
    await this.#discoveryManagerProxy.pushDiscoveredCameras(this.#pluginInfo.id, cameras);
  }

  public async configureCameras(cameraDevices: CameraDeviceProxy[]): Promise<void> {
    await Promise.all(cameraDevices.map((cameraDevice) => this.#getCameraDevice(cameraDevice)));
  }

  /** Internal method to close the device manager and clean up resources */
  public async close(): Promise<void> {
    this.#initialized = false;
    this.#closeRequests?.();

    for (const device of this.#devices.values()) {
      await device.cleanup();
    }
    this.#devices.clear();
  }

  get #deviceManagerProxy(): Promisify<DeviceManagerInterface> {
    return this.#proxy.createProxy<DeviceManagerInterface>(this.#namespaces.deviceManagerRpc);
  }

  get #discoveryManagerProxy(): Promisify<DiscoveryManagerInterface> {
    return this.#proxy.createProxy<DiscoveryManagerInterface>(this.#namespaces.discoveryManagerRpc);
  }

  async #onEventMessage(event: DeviceManagerListenerMessagePayload): Promise<void> {
    if (!this.#pluginInstance) {
      this.#logger.warn('Plugin instance not set, cannot handle lifecycle event');
      return;
    }

    switch (event.type) {
      case 'cameraAdded': {
        const { camera } = event.data as { camera: Camera };
        if (this.#devices.has(camera._id)) {
          break;
        }
        const cameraDevice = await this.#getCameraDevice(camera);
        await this.#pluginInstance.onCameraAdded(cameraDevice);
        break;
      }
      case 'cameraReleased': {
        const { cameraId } = event.data as { cameraId: string };
        await this.#pluginInstance.onCameraReleased(cameraId);
        const cameraDevice = this.#devices.get(cameraId);
        await cameraDevice?.cleanup();
        await this.#removeCameraStorage(cameraId);
        this.#devices.delete(cameraId);
        break;
      }
    }
  }

  #getCameraDevice(camera: Camera): Promise<CameraDeviceProxy>;
  #getCameraDevice(cameraDevice: CameraDeviceProxy): Promise<CameraDeviceProxy>;
  #getCameraDevice(identifier: string): Promise<CameraDeviceProxy | undefined>;
  async #getCameraDevice(cameraOrIdentifier: Camera | CameraDeviceProxy | string): Promise<CameraDeviceProxy | undefined> {
    let cameraDevice: CameraDeviceProxy | undefined;

    if (typeof cameraOrIdentifier === 'string') {
      cameraDevice = Array.from(this.#devices.values()).find((cameraDevice) => cameraDevice.id === cameraOrIdentifier || cameraDevice.name === cameraOrIdentifier);
    } else if (cameraOrIdentifier instanceof CameraDeviceProxy) {
      cameraDevice = cameraOrIdentifier;

      if (this.#devices.has(cameraDevice.id)) {
        cameraDevice = this.#devices.get(cameraDevice.id)!;
      } else {
        this.#devices.set(cameraDevice.id, cameraDevice);
      }
    } else {
      const camera = cameraOrIdentifier;

      if (this.#devices.has(camera._id)) {
        cameraDevice = this.#devices.get(camera._id)!;
      } else {
        const cameraLogger = this.#logger.createLogger({ suffix: camera.name, targetId: camera._id, targetType: 'camera' });
        cameraDevice = new CameraDeviceProxy(this.#proxy, this.#storageController, camera, this.#pluginInfo, cameraLogger);
        this.#devices.set(camera._id, cameraDevice);
      }
    }

    if (cameraDevice) {
      await this.#createCameraStorage(cameraDevice.id);
      await cameraDevice?.init();
    }

    return cameraDevice;
  }

  async #createCameraStorage(cameraId: string): Promise<void> {
    await this.#storageController.createStorage('camera', cameraId);
  }

  async #removeCameraStorage(cameraId: string): Promise<void> {
    await this.#storageController.removeStorage('camera', cameraId);
  }
}
