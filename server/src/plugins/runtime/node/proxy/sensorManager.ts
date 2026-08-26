import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { getDetectionTypes } from '../../../../sensors/types.js';
import { limitRegistration } from './limiter.js';
import { watchReconnect } from './reconnect.js';
import { SensorProxy } from './sensor.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { BasePlugin, ModelSpec, PluginInfo, RegisteredSensorInfo, Sensor, SensorHistoryEntry, SensorManager, SensorType } from '@camera.ui/sdk';
import type { DetectionCoordinatorInterface } from '../../../../rpc/interfaces/detection.js';
import type {
  SensorAddedEvent,
  SensorAssignmentChangedEvent,
  SensorConnectedChangedEvent,
  SensorDeletedEvent,
  SensorEventMessage,
  SensorExposedChangedEvent,
  SensorRegistryInterface,
  StoredSensorData,
} from '../../../../rpc/interfaces/sensor.js';
import type { StorageController } from '../storageController.js';

const DETECTION_SENSOR_TYPES: ReadonlySet<SensorType> = new Set(getDetectionTypes());

export class SensorManagerProxy implements SensorManager {
  #proxy: RPCClient;
  #storageController: StorageController;
  #plugin: PluginInfo;
  #logger: Logger;
  #pluginInstance?: BasePlugin;

  #owned = new Map<string, Sensor<any>>();
  #cleanups = new Map<string, () => Promise<void>>();
  #external = new Map<string, Sensor<any>>();
  #consumed = new Map<string, SensorProxy>();

  #globalUnsubscribe?: () => void;
  #stopReconnectWatch?: () => void;

  constructor(proxy: RPCClient, storageController: StorageController, plugin: PluginInfo, logger: Logger) {
    this.#proxy = proxy;
    this.#storageController = storageController;
    this.#plugin = plugin;
    this.#logger = logger;
  }

  public setPlugin(plugin: BasePlugin): void {
    this.#pluginInstance = plugin;
  }

  get #registryProxy(): Promisify<SensorRegistryInterface> {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    return this.#proxy.createProxy<SensorRegistryInterface>(ns.sensorsRpc);
  }

  get #consumesSomething(): boolean {
    return (this.#plugin.contract.consumes?.length ?? 0) > 0;
  }

  public async init(): Promise<void> {
    if (!this.#consumesSomething) return;

    await this.#ensureGlobalSubscription();

    try {
      const sensors = await this.#registryProxy.getSensors(this.#plugin.id);
      for (const data of sensors) {
        if (!this.#isConsumable(data)) continue;
        this.#addConsumed(data);
      }
    } catch {
      // registry not reachable yet, sensors arrive via events
    }

    await this.#pluginInstance?.configureSensors?.(Array.from(this.#consumed.values()));
  }

  public addSensor(sensor: Sensor<any, any, any>): Promise<void> {
    return limitRegistration(() => this.#addSensor(sensor));
  }

  public async removeSensor(sensor: Sensor<any, any, any>): Promise<void> {
    try {
      await this.#registryProxy.unregisterSensor(sensor.id);
    } catch (error) {
      this.#logger.warn(`Failed to unregister sensor ${sensor.id}:`, error);
    }

    await this.#cleanups.get(sensor.id)?.();
    this.#cleanups.delete(sensor.id);

    this.#owned.delete(sensor.id);
    sensor._cleanup();
  }

  public getSensors(): Sensor<any, any, any>[] {
    return Array.from(this.#owned.values());
  }

  public async getRegisteredSensors(): Promise<RegisteredSensorInfo[]> {
    const stored = await this.#registryProxy.getSensors(this.#plugin.id);
    return stored.filter((s) => s.pluginId === this.#plugin.id).map((s) => ({ id: s.id, nativeId: s.nativeId, type: s.type, name: s.name, connected: s.connected }));
  }

  public async getSensorHistory(sensorIds: string[], from: number, to: number): Promise<SensorHistoryEntry[]> {
    return await this.#registryProxy.getSensorHistory(sensorIds, from, to);
  }

  /** @internal Keeps a camera-registered sensor's assignedCameraIds in sync with the global stream. */
  public async _trackCameraSensor(sensor: Sensor<any, any, any>): Promise<void> {
    await this.#ensureGlobalSubscription();
    this.#external.set(sensor.id, sensor);
  }

  /** @internal */
  public _untrackCameraSensor(sensorId: string): void {
    this.#external.delete(sensorId);
  }

  public async close(): Promise<void> {
    this.#globalUnsubscribe?.();
    this.#globalUnsubscribe = undefined;
    this.#stopReconnectWatch?.();
    this.#stopReconnectWatch = undefined;

    for (const proxySensor of this.#consumed.values()) {
      proxySensor._unsubscribeFromEvents();
    }
    this.#consumed.clear();

    this.#external.clear();

    for (const cleanup of this.#cleanups.values()) {
      await cleanup();
    }
    this.#cleanups.clear();

    for (const sensor of this.#owned.values()) {
      sensor._cleanup();
    }
    this.#owned.clear();
  }

  async #addSensor(sensor: Sensor<any, any, any>): Promise<void> {
    // producers need the global stream too: assignment changes must reach
    // owned sensors, their detection fan-out reads assignedCameraIds
    await this.#ensureGlobalSubscription();

    sensor._setPluginId(this.#plugin.id);

    const sensorJSON = sensor.toJSON();
    sensorJSON.requiresFrames = sensor._requiresFrames === true;

    // resolve the durable id first and wire storage with it, so registration
    // data (modelSpec) can read sensor storage
    const sensorId = await this.#registryProxy.resolveSensor(sensorJSON, this.#plugin.id);
    sensor._setId(sensorId);
    sensorJSON.id = sensorId;

    const storage = this.#storageController.createSensorStorage(this.#plugin.id, sensor.id, sensor.storageSchema ?? []);
    await storage.registerStorage();
    sensor._setStorage(storage);

    const modelSpec: ModelSpec | undefined = (sensor as { modelSpec?: ModelSpec }).modelSpec;
    if (modelSpec) {
      sensorJSON.modelSpec = modelSpec;
    }

    const registration = await this.#registryProxy.registerSensor(sensorJSON, this.#plugin.id);
    sensor._setAssignedCameras(registration.assignedCameraIds);

    const sensorNamespace = NamespaceManager.sensorProviderNamespaces(this.#plugin.id, sensor.id).sensorRpc;

    const pushProperties = async (properties: Record<string, unknown>): Promise<void> => {
      if (DETECTION_SENSOR_TYPES.has(sensor.type)) {
        // the spec belongs to the registry, it reaches the coordinators from there
        const { modelSpec, ...rest } = properties;
        if (modelSpec) {
          await this.#registryProxy.updateModelSpec(sensor.id, modelSpec as ModelSpec);
          if (Object.keys(rest).length === 0) return;
          properties = rest;
        }

        // external detection provider: fan the write into every assigned camera's coordinator
        for (const cameraId of sensor.assignedCameraIds) {
          const detectionNs = NamespaceManager.frameWorkerDetectionNamespaces(cameraId);
          const coordinator = this.#proxy.createProxy<DetectionCoordinatorInterface>(detectionNs.detectionRpc);
          coordinator.reportSensorWrite(sensor.id, sensor.type, properties).catch(() => {});
        }
        return;
      }
      await this.#registryProxy.updatePropertyValues(sensor.id, properties);
    };
    // writes are fire-and-forget for the sensor author, a failed RPC must not
    // surface as an unhandled rejection
    sensor._init((properties) => {
      pushProperties(properties).catch((error) => this.#logger.debug(`Property write for sensor ${sensor.id} failed:`, error));
    });

    sensor._initCapabilities((capabilities) => {
      this.#registryProxy.updateCapabilities(sensor.id, capabilities).catch((error) => this.#logger.debug(`Capability write for sensor ${sensor.id} failed:`, error));
    });

    const rpcCleanup = await this.#proxy.registerHandler(sensorNamespace, sensor, { withoutDecorators: true });

    const eventNs = NamespaceManager.sensorEventNamespaces(sensor.id);
    const unsubscribeEvents = await this.#proxy.subscribe<{ type: string; data: unknown }>(eventNs.sensorSubject, (event) => {
      if (event.type === 'property:changed') {
        const changeEvent = event.data as { property: string; value: unknown; timestamp?: number };
        sensor._onBackendPropertyChanged(changeEvent.property, changeEvent.value, changeEvent.timestamp);
      }
    });

    this.#owned.set(sensor.id, sensor);
    this.#cleanups.set(sensor.id, async () => {
      unsubscribeEvents();
      await rpcCleanup();
    });

    sensor._setActive(true);
  }

  async #ensureGlobalSubscription(): Promise<void> {
    if (this.#globalUnsubscribe) return;

    this.#stopReconnectWatch ??= watchReconnect(
      this.#proxy,
      () => this.#resyncAllConsumed(),
      (error) => this.#logger.debug('Sensor reconnect watch ended:', error),
    );

    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.#globalUnsubscribe = await this.#proxy.subscribe<SensorEventMessage>(ns.sensorsSubject, (message) => {
      this.#onGlobalSensorEvent(message).catch((error: unknown) => {
        this.#logger.warn('Sensor event handling failed:', error);
      });
    });
  }

  async #resyncAllConsumed(): Promise<void> {
    for (const sensorId of [...this.#consumed.keys()]) {
      await this.#resyncConsumed(sensorId);
    }
  }

  async #resyncConsumed(sensorId: string): Promise<void> {
    const proxySensor = this.#consumed.get(sensorId);
    if (!proxySensor) return;

    try {
      const state = await this.#registryProxy.getSensorState(sensorId);
      if (state) proxySensor._applyRefreshedState(state);
    } catch {
      // owner or registry unreachable, the next re-announce carries the state
    }
  }

  #isConsumable(data: StoredSensorData): boolean {
    if (this.#owned.has(data.id) || data.pluginId === this.#plugin.id) return false;
    if (!data.exposed) return false;
    return this.#plugin.contract.consumes.includes(data.type);
  }

  #addConsumed(data: StoredSensorData): SensorProxy {
    const ownerNamespace = NamespaceManager.sensorProviderNamespaces(data.pluginId, data.id).sensorRpc;
    const proxySensor = new SensorProxy(data, this.#proxy, ownerNamespace);
    proxySensor._subscribeToEvents();
    this.#consumed.set(data.id, proxySensor);
    return proxySensor;
  }

  #releaseConsumed(sensorId: string): void {
    const proxySensor = this.#consumed.get(sensorId);
    if (!proxySensor) return;

    proxySensor._unsubscribeFromEvents();
    this.#consumed.delete(sensorId);
    this.#pluginInstance?.onSensorReleased?.(sensorId).catch(() => {});
  }

  async #onGlobalSensorEvent(message: SensorEventMessage): Promise<void> {
    switch (message.type) {
      case 'sensor:added': {
        const event = message.data as SensorAddedEvent;
        this.#owned.get(event.sensor.id)?._setAssignedCameras(event.sensor.assignedCameraIds);
        this.#external.get(event.sensor.id)?._setAssignedCameras(event.sensor.assignedCameraIds);
        const consumed = this.#consumed.get(event.sensor.id);
        if (consumed) {
          // re-announced while we already hold it: the payload is authoritative, our cache may be stale
          consumed._applyRefreshedState(event.state);
          return;
        }
        if (!this.#isConsumable(event.sensor)) return;
        const proxySensor = this.#addConsumed(event.sensor);
        await this.#pluginInstance?.onSensorAdded?.(proxySensor);
        break;
      }
      case 'sensor:deleted': {
        const event = message.data as SensorDeletedEvent;
        this.#releaseConsumed(event.sensorId);
        break;
      }
      case 'sensor:connected:changed': {
        const event = message.data as SensorConnectedChangedEvent;
        const proxySensor = this.#consumed.get(event.sensorId);
        if (!proxySensor) break;
        proxySensor._setConnected(event.connected);
        if (event.connected) {
          // the owner was away, whatever it published in the meantime never reached us
          this.#resyncConsumed(event.sensorId);
        }
        break;
      }
      case 'sensor:exposed:changed': {
        const event = message.data as SensorExposedChangedEvent;
        if (!event.exposed) {
          this.#releaseConsumed(event.sensorId);
          return;
        }
        if (this.#consumed.has(event.sensorId)) return;
        const data = await this.#registryProxy.getSensorRpc(event.sensorId, this.#plugin.id);
        if (!data || !this.#isConsumable(data)) return;
        const proxySensor = this.#addConsumed(data);
        await this.#pluginInstance?.onSensorAdded?.(proxySensor);
        break;
      }
      case 'sensor:assignment:changed': {
        const event = message.data as SensorAssignmentChangedEvent;

        for (const target of [this.#owned.get(event.sensorId), this.#external.get(event.sensorId), this.#consumed.get(event.sensorId)]) {
          if (!target) continue;
          const cameras = new Set(target.assignedCameraIds);
          if (event.assigned) cameras.add(event.cameraId);
          else cameras.delete(event.cameraId);
          target._setAssignedCameras([...cameras]);
        }
        break;
      }
    }
  }
}
