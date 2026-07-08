import { DeviceStorage } from './storage.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { JsonSchema, PluginInfo, SensorType } from '@camera.ui/sdk';
import type { PluginConfigDb } from './configDb.js';
import type { PluginAPI } from './pluginApi.js';

// Stable storage key for sensor instance storage.
function sensorStorageKey(cameraId: string, sensorType: SensorType, pluginId: string, sensorName: string): string {
  return `${cameraId}:sensor:${sensorType}:${pluginId}:${sensorName}`;
}

export class StorageController {
  #api: PluginAPI;
  #proxy: RPCClient;
  #plugin: PluginInfo;
  #pluginDb: PluginConfigDb;
  #storages = new Map<string, DeviceStorage<any>>();

  constructor(api: PluginAPI, proxy: RPCClient, plugin: PluginInfo, pluginDb: PluginConfigDb) {
    this.#api = api;
    this.#proxy = proxy;
    this.#plugin = plugin;
    this.#pluginDb = pluginDb;
  }

  public createCameraStorage<T extends Record<string, any> = Record<string, any>>(cameraId: string, schemas: JsonSchema[] = []): DeviceStorage<T> {
    let cameraStorage = this.#storages.get(cameraId);

    if (!cameraStorage) {
      cameraStorage = new DeviceStorage<T>(this.#api, this.#proxy, this.#plugin, this.#pluginDb, { kind: 'camera', cameraId }, schemas);
      this.#storages.set(cameraId, cameraStorage);
    } else {
      cameraStorage.updateSchema(schemas);
    }

    return cameraStorage as DeviceStorage<T>;
  }

  public createPluginStorage<T extends Record<string, any> = Record<string, any>>(schemas: JsonSchema[] = []): DeviceStorage<T> {
    let pluginStorage = this.#storages.get('storage');

    if (!pluginStorage) {
      pluginStorage = new DeviceStorage<T>(this.#api, this.#proxy, this.#plugin, this.#pluginDb, { kind: 'plugin' }, schemas);
      this.#storages.set('storage', pluginStorage);
    } else {
      pluginStorage.updateSchema(schemas);
    }

    return pluginStorage as DeviceStorage<T>;
  }

  public getCameraStorage<T extends Record<string, any> = Record<string, any>>(deviceId: string): DeviceStorage<T> | undefined {
    return this.#storages.get(deviceId) as DeviceStorage<T> | undefined;
  }

  public getPluginStorage<T extends Record<string, any> = Record<string, any>>(): DeviceStorage<T> | undefined {
    return this.#storages.get('storage') as DeviceStorage<T> | undefined;
  }

  public createSensorStorage<T extends Record<string, any> = Record<string, any>>(
    cameraId: string,
    sensorType: SensorType,
    pluginId: string,
    sensorName: string,
    sensorId: string,
    schemas: JsonSchema[] = [],
  ): DeviceStorage<T> {
    const storageKey = sensorStorageKey(cameraId, sensorType, pluginId, sensorName);
    let storage = this.#storages.get(storageKey);

    if (!storage) {
      // storageKey is only the in-memory registry key; persistence addresses
      // the canonical sensors.<camId>.<type>.<name> path. sensorId is the
      // runtime UUID for the RPC namespace.
      storage = new DeviceStorage<T>(this.#api, this.#proxy, this.#plugin, this.#pluginDb, { kind: 'sensor', cameraId, sensorType, sensorName }, schemas, sensorId);
      this.#storages.set(storageKey, storage);
      storage.updateSchema(schemas);
    } else {
      storage.updateSchema(schemas);
    }

    return storage as DeviceStorage<T>;
  }

  public getSensorStorage<T extends Record<string, any> = Record<string, any>>(
    cameraId: string,
    sensorType: SensorType,
    pluginId: string,
    sensorName: string,
  ): DeviceStorage<T> | undefined {
    const storageKey = sensorStorageKey(cameraId, sensorType, pluginId, sensorName);
    return this.#storages.get(storageKey) as DeviceStorage<T> | undefined;
  }

  public async createStorage(type: 'camera', deviceId: string): Promise<DeviceStorage<any>>;
  public async createStorage(type: 'plugin'): Promise<DeviceStorage<any>>;
  public async createStorage(
    type: 'sensor',
    cameraId: string,
    sensorType: SensorType,
    pluginId: string,
    sensorName: string,
    sensorId: string,
  ): Promise<DeviceStorage<any>>;
  public async createStorage(
    type: 'camera' | 'plugin' | 'sensor',
    deviceIdOrCameraId?: string,
    sensorTypeOrUndefined?: SensorType,
    pluginId?: string,
    sensorName?: string,
    sensorId?: string,
  ): Promise<DeviceStorage<any>> {
    let storage: DeviceStorage<any> | undefined;

    if (type === 'camera') {
      if (!deviceIdOrCameraId) {
        throw new Error('deviceId is required for camera storage creation');
      }
      storage = this.createCameraStorage(deviceIdOrCameraId);
    } else if (type === 'sensor') {
      if (!deviceIdOrCameraId || !sensorTypeOrUndefined || !pluginId || !sensorName || !sensorId) {
        throw new Error('cameraId, sensorType, pluginId, sensorName and sensorId are required for sensor storage creation');
      }
      storage = this.createSensorStorage(deviceIdOrCameraId, sensorTypeOrUndefined, pluginId, sensorName, sensorId);
    } else {
      storage = this.createPluginStorage();
    }

    await storage.registerStorage();
    return storage;
  }

  public async removeStorage(type: 'camera', deviceId: string): Promise<void>;
  public async removeStorage(type: 'plugin'): Promise<void>;
  public async removeStorage(type: 'sensor', cameraId: string, sensorType: SensorType, pluginId: string, sensorName: string): Promise<void>;
  public async removeStorage(
    type: 'camera' | 'plugin' | 'sensor',
    deviceIdOrCameraId?: string,
    sensorTypeOrUndefined?: SensorType,
    pluginId?: string,
    sensorName?: string,
  ): Promise<void> {
    let storageKey: string;

    if (type === 'sensor') {
      if (!deviceIdOrCameraId || !sensorTypeOrUndefined || !pluginId || !sensorName) {
        throw new Error('cameraId, sensorType, pluginId and sensorName are required for sensor storage removal');
      }
      storageKey = sensorStorageKey(deviceIdOrCameraId, sensorTypeOrUndefined, pluginId, sensorName);
    } else if (type === 'camera') {
      if (!deviceIdOrCameraId) {
        throw new Error('deviceId is required for camera storage removal');
      }
      storageKey = deviceIdOrCameraId;
    } else {
      storageKey = 'storage';
    }

    const deviceStorage = this.#storages.get(storageKey);
    await deviceStorage?.destroy();
    await deviceStorage?.unregisterStorage();
    this.#storages.delete(storageKey);
  }

  /** Internal method to close all storages */
  public async close(): Promise<void> {
    for (const storage of this.#storages.values()) {
      await storage.close();
    }
  }
}
