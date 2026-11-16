import { isEqual } from '@camera.ui/common/utils';
import { PluginInterface } from '@camera.ui/sdk';

import { NamespaceManager } from '../../../../rpc/namespaces.js';
import { getDetectionTypes } from '../../../../sensors/types.js';
import { limitRegistration } from './limiter.js';
import { watchReconnect } from './reconnect.js';
import { SensorProxy } from './sensor.js';

import type { Logger } from '@camera.ui/common';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { AdoptedSensor, BasePlugin, ModelSpec, PluginInfo, Sensor, SensorDiscoveryProvider, SensorHistoryEntry, SensorManager, SensorType } from '@camera.ui/sdk';
import type { SensorJSON } from '@camera.ui/sdk/internal';
import type { DetectionCoordinatorInterface } from '../../../../rpc/interfaces/detection.js';
import type {
  SensorAddedEvent,
  SensorAdoptedEvent,
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

function syncAssignedCameras(target: Sensor<any, any, any> | SensorProxy, cameraIds: string[]): void {
  if (isEqual(target.assignedCameraIds, cameraIds, true)) return;
  target._setAssignedCameras(cameraIds);
}

function toAdopted(data: StoredSensorData): AdoptedSensor {
  return { id: data.id, nativeId: data.nativeId!, address: data.address, name: data.name, type: data.type };
}

export class SensorManagerProxy implements SensorManager {
  #proxy: RPCClient;
  #storageController: StorageController;
  #plugin: PluginInfo;
  #logger: Logger;
  #pluginInstance?: BasePlugin & Partial<SensorDiscoveryProvider>;

  #owned = new Map<string, Sensor<any>>();
  #cleanups = new Map<string, () => Promise<void>>();
  #external = new Map<string, Sensor<any>>();
  #consumed = new Map<string, SensorProxy>();
  #unsent = new Map<string, Set<string>>();

  #globalUnsubscribe?: () => void;
  #stopReconnectWatch?: () => void;
  #eventChain: Promise<void> = Promise.resolve();

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

  get #providesAdopted(): boolean {
    return this.#plugin.contract.interfaces.includes(PluginInterface.SensorDiscovery);
  }

  public async init(): Promise<void> {
    if (!this.#consumesSomething && !this.#providesAdopted) return;

    await this.#ensureGlobalSubscription();
    if (!this.#consumesSomething) return;

    const run = this.#eventChain.then(() => this.#configureConsumed());
    this.#eventChain = run.catch(() => {});
    await run;
  }

  public async configureAdoptedSensors(): Promise<void> {
    const plugin = this.#pluginInstance;
    if (!this.#providesAdopted || !plugin?.configureAdoptedSensors) return;

    let records: AdoptedSensor[];
    try {
      records = (await this.#registryProxy.getSensors(this.#plugin.id)).filter((data) => this.#isOwnAdopted(data)).map(toAdopted);
    } catch (error) {
      this.#logger.warn('Could not load the adopted sensors:', error);
      return;
    }

    let sensors: Sensor<any, any, any>[];
    try {
      sensors = await plugin.configureAdoptedSensors(records);
    } catch (error) {
      this.#logger.warn('configureAdoptedSensors failed:', error);
      return;
    }

    const byNativeId = new Map(records.map((record) => [record.nativeId, record]));
    const bound = new Set<string>();
    await Promise.all(
      sensors.map(async (sensor) => {
        const record = sensor.nativeId ? byNativeId.get(sensor.nativeId) : undefined;
        if (!record) {
          this.#logger.warn(`Sensor "${sensor.name}" returned by configureAdoptedSensors has no adopted record (nativeId ${sensor.nativeId ?? 'missing'}), ignored`);
          return;
        }
        if (bound.has(record.nativeId) || this.#owned.has(record.id)) return;
        bound.add(record.nativeId);
        await this.#bindAdopted(sensor, record);
      }),
    );

    const missing = records.length - bound.size;
    if (missing > 0) this.#logger.warn(`${missing} adopted sensor(s) got no runtime sensor from the plugin, they stay disconnected`);
  }

  public async getSensorHistory(sensorIds: string[], from: number, to: number): Promise<SensorHistoryEntry[]> {
    return await this.#registryProxy.getSensorHistory(sensorIds, from, to);
  }

  /** @internal */
  public async _trackCameraSensor(sensor: Sensor<any, any, any>): Promise<void> {
    await this.#ensureGlobalSubscription();
    this.#external.set(sensor.id, sensor);
  }

  /** @internal */
  public _untrackCameraSensor(sensorId: string): void {
    this.#external.delete(sensorId);
    this.#unsent.delete(sensorId);
  }

  /** @internal */
  public _settleWrite(sensor: Sensor<any, any, any>, properties: Record<string, unknown>, sent: boolean): void {
    if (DETECTION_SENSOR_TYPES.has(sensor.type)) return;
    const keys = this.#unsent.get(sensor.id) ?? new Set<string>();
    for (const key of Object.keys(properties)) {
      if (sent) keys.delete(key);
      else keys.add(key);
    }
    if (keys.size > 0) this.#unsent.set(sensor.id, keys);
    else this.#unsent.delete(sensor.id);
  }

  public async reattach(): Promise<void> {
    // re-registering carries the current values, camera sensors included
    this.#unsent.clear();
    for (const sensor of [...this.#owned.values()]) {
      const registration = await this.#registryProxy.registerSensor(this.#registrationJson(sensor), this.#plugin.id);
      sensor._setAssignedCameras(registration.assignedCameraIds);
    }
    await this.#resync();
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

    // cleanups wait for their running calls, in sequence they overrun the stop deadline
    await Promise.all(Array.from(this.#cleanups.values(), (cleanup) => cleanup()));
    this.#cleanups.clear();

    for (const sensor of this.#owned.values()) {
      sensor._cleanup();
    }
    this.#owned.clear();
  }

  async #adoptOwn(record: AdoptedSensor): Promise<void> {
    const plugin = this.#pluginInstance;
    if (!plugin?.onSensorAdopted) return;

    let sensor: Sensor<any, any, any>;
    try {
      sensor = await plugin.onSensorAdopted(record);
    } catch (error) {
      this.#logger.warn(`onSensorAdopted failed for "${record.name}":`, error);
      return;
    }
    if (sensor.nativeId !== record.nativeId) {
      this.#logger.warn(`Sensor "${sensor.name}" returned by onSensorAdopted carries nativeId ${sensor.nativeId ?? 'missing'}, expected ${record.nativeId}, ignored`);
      return;
    }
    await this.#bindAdopted(sensor, record);
  }

  async #bindAdopted(sensor: Sensor<any, any, any>, record: AdoptedSensor): Promise<void> {
    try {
      await limitRegistration(() => this.#bind(sensor, record.id));
    } catch (error) {
      this.#logger.warn(`Binding adopted sensor "${record.name}" failed:`, error);
    }
  }

  #unbind(sensorId: string): Sensor<any, any, any> | undefined {
    const sensor = this.#owned.get(sensorId);
    if (!sensor) return undefined;
    this.#cleanups
      .get(sensorId)?.()
      .catch(() => {});
    this.#cleanups.delete(sensorId);
    this.#owned.delete(sensorId);
    this.#unsent.delete(sensorId);
    sensor._cleanup();
    return sensor;
  }

  async #bind(sensor: Sensor<any, any, any>, recordId: string): Promise<void> {
    // producers need the global stream too, their detection fan-out reads assignedCameraIds
    await this.#ensureGlobalSubscription();

    sensor._setPluginId(this.#plugin.id);
    sensor._setId(recordId);

    const storage = this.#storageController.createSensorStorage(this.#plugin.id, sensor.id, sensor.storageSchema ?? []);
    await storage.registerStorage();
    sensor._setStorage(storage);

    const sensorJSON = this.#registrationJson(sensor);
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

        for (const cameraId of sensor.assignedCameraIds) {
          const detectionNs = NamespaceManager.frameWorkerDetectionNamespaces(cameraId);
          const coordinator = this.#proxy.createProxy<DetectionCoordinatorInterface>(detectionNs.detectionRpc);
          coordinator.reportSensorWrite(sensor.id, sensor.type, properties).catch(() => {});
        }
        return;
      }
      await this.#registryProxy.updatePropertyValues(sensor.id, properties);
    };
    // fire-and-forget for the sensor author, a failed RPC must not become an unhandled rejection
    sensor._init((properties) => {
      pushProperties(properties).then(
        () => this._settleWrite(sensor, properties, true),
        (error) => {
          this._settleWrite(sensor, properties, false);
          this.#logger.debug(`Property write for sensor ${sensor.id} failed:`, error);
        },
      );
    });

    sensor._initCapabilities((capabilities) => {
      this.#registryProxy.updateCapabilities(sensor.id, capabilities).catch((error) => this.#logger.debug(`Capability write for sensor ${sensor.id} failed:`, error));
    });

    sensor._initSource((patch) => {
      this.#registryProxy.updateSource(sensor.id, patch).catch((error) => this.#logger.debug(`Source write for sensor ${sensor.id} failed:`, error));
    });

    const rpcCleanup = await this.#proxy.registerHandler(sensorNamespace, sensor, {
      withoutDecorators: true,
      concurrency: (sensor as { _rpcConcurrency?: Record<string, number> })._rpcConcurrency,
    });

    const eventNs = NamespaceManager.sensorEventNamespaces(sensor.id);
    // frame-fed owners skip the echo of their per-frame detection writes
    const eventSubject = registration.stateSubject && sensorJSON.requiresFrames ? eventNs.sensorStateSubject : eventNs.sensorSubject;
    const unsubscribeEvents = await this.#proxy.subscribe<{ type: string; data: unknown }>(eventSubject, (event) => {
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

  #registrationJson(sensor: Sensor<any, any, any>): SensorJSON {
    const sensorJSON = sensor.toJSON();
    sensorJSON.requiresFrames = sensor._requiresFrames === true;
    const modelSpec: ModelSpec | undefined = (sensor as { modelSpec?: ModelSpec }).modelSpec;
    if (modelSpec) {
      sensorJSON.modelSpec = modelSpec;
    }
    return sensorJSON;
  }

  async #configureConsumed(): Promise<void> {
    try {
      await this.#syncSensors();
    } catch {
      // registry not reachable yet, sensors arrive via events
    }

    await this.#pluginInstance?.configureSensors?.(Array.from(this.#consumed.values()));
  }

  async #ensureGlobalSubscription(): Promise<void> {
    if (this.#globalUnsubscribe) return;

    this.#stopReconnectWatch ??= watchReconnect(
      this.#proxy,
      async () => {
        await this.#sendUnsent();
        await this.#resync();
      },
      (error) => this.#logger.debug('Sensor reconnect watch ended:', error),
      { debounce: true },
    );

    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.#globalUnsubscribe = await this.#proxy.subscribe<SensorEventMessage>(ns.sensorsSubject, (message) => {
      this.#eventChain = this.#eventChain
        .then(() => this.#onGlobalSensorEvent(message))
        .catch((error: unknown) => {
          this.#logger.warn('Sensor event handling failed:', error);
        });
    });
  }

  async #sendUnsent(): Promise<void> {
    for (const [sensorId, keys] of [...this.#unsent]) {
      const sensor = this.#owned.get(sensorId) ?? this.#external.get(sensorId);
      if (!sensor) {
        this.#unsent.delete(sensorId);
        continue;
      }
      const properties = Object.fromEntries([...keys].map((key) => [key, sensor.getValue(key)]));
      try {
        await this.#registryProxy.updatePropertyValues(sensorId, properties);
        this._settleWrite(sensor, properties, true);
      } catch {
        // still unreachable, the next announce tries again
      }
    }
  }

  #resync(): Promise<void> {
    this.#eventChain = this.#eventChain.then(async () => {
      try {
        for (const proxySensor of await this.#syncSensors()) {
          await this.#pluginInstance?.onSensorAdded?.(proxySensor);
        }
      } catch (error) {
        this.#logger.debug('Sensor resync failed:', error);
      }
    });
    return this.#eventChain;
  }

  async #syncSensors(): Promise<SensorProxy[]> {
    const marks = new Map(Array.from(this.#consumed, ([sensorId, proxySensor]) => [sensorId, proxySensor._eventMarks()]));
    const sensors = await this.#registryProxy.getSensors(this.#plugin.id);

    const added: Promise<SensorProxy>[] = [];
    for (const data of sensors) {
      const own = this.#owned.get(data.id) ?? this.#external.get(data.id);
      const held = this.#consumed.get(data.id);
      if (own) {
        syncAssignedCameras(own, data.assignedCameraIds);
      } else if (!this.#isConsumable(data)) {
        if (held && !data.exposed) this.#releaseConsumed(data.id);
      } else if (!held) {
        added.push(this.#addConsumed(data));
      } else {
        held._setConnected(data.connected);
        syncAssignedCameras(held, data.assignedCameraIds);
        if (data.connected) {
          held._applyRefreshedState({ type: data.type, properties: data.properties, capabilities: data.capabilities, displayName: data.displayName }, marks.get(data.id));
        }
      }
    }
    return Promise.all(added);
  }

  async #resyncConsumed(sensorId: string): Promise<void> {
    const proxySensor = this.#consumed.get(sensorId);
    if (!proxySensor) return;

    const marks = proxySensor._eventMarks();
    try {
      const state = await this.#registryProxy.getSensorState(sensorId);
      if (state) proxySensor._applyRefreshedState(state, marks);
    } catch {
      // owner or registry unreachable, the next re-announce carries the state
    }
  }

  #isOwnAdopted(data: StoredSensorData): boolean {
    return data.pluginId === this.#plugin.id && !data.boundCameraId && !!data.nativeId;
  }

  #isConsumable(data: StoredSensorData): boolean {
    if (this.#owned.has(data.id) || data.pluginId === this.#plugin.id) return false;
    if (!data.exposed) return false;
    return this.#plugin.contract.consumes.includes(data.type);
  }

  async #addConsumed(data: StoredSensorData): Promise<SensorProxy> {
    const ownerNamespace = NamespaceManager.sensorProviderNamespaces(data.pluginId, data.id).sensorRpc;
    const proxySensor = new SensorProxy(data, this.#proxy, ownerNamespace);
    this.#consumed.set(data.id, proxySensor);
    await proxySensor._subscribeToEvents();
    if (data.connected) await this.#resyncConsumed(data.id);
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
          // a re-announce is authoritative, our cache may be stale
          consumed._applyRefreshedState(event.state);
          return;
        }
        if (!this.#isConsumable(event.sensor)) return;
        const proxySensor = await this.#addConsumed(event.sensor);
        await this.#pluginInstance?.onSensorAdded?.(proxySensor);
        break;
      }
      case 'sensor:adopted': {
        const event = message.data as SensorAdoptedEvent;
        if (!this.#isOwnAdopted(event.sensor) || this.#owned.has(event.sensor.id)) break;
        this.#adoptOwn(toAdopted(event.sensor));
        break;
      }
      case 'sensor:deleted': {
        const event = message.data as SensorDeletedEvent;
        const unbound = this.#unbind(event.sensorId);
        if (unbound?.nativeId && this.#providesAdopted) {
          this.#pluginInstance?.onSensorUnadopted?.(unbound.nativeId).catch((error) => this.#logger.warn(`onSensorUnadopted failed for ${unbound.nativeId}:`, error));
        }
        this.#releaseConsumed(event.sensorId);
        break;
      }
      case 'sensor:connected:changed': {
        const event = message.data as SensorConnectedChangedEvent;
        const proxySensor = this.#consumed.get(event.sensorId);
        if (!proxySensor) break;
        proxySensor._setConnected(event.connected);
        if (event.connected) {
          // the owner was away, what it published meanwhile never reached us
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
        const proxySensor = await this.#addConsumed(data);
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
