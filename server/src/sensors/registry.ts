import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { canProvideSensorsToAnyCameras, SensorType } from '@camera.ui/sdk';
import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { CamerasService } from '../api/services/cameras.service.js';
import { FloorPlanService } from '../api/services/floorplan.service.js';
import { PluginsService } from '../api/services/plugins.service.js';
import { NamespaceManager } from '../rpc/namespaces.js';
import { ServerSensor } from '../sensors/sensor.js';
import {
  DETECTION_SENSOR_TYPES,
  isVirtualSensorType,
  SENSOR_TYPE_CONFIG,
  VIRTUAL_SENSOR_DEFAULT_CAPABILITIES,
  VIRTUAL_SENSOR_DEFAULT_PROPERTIES,
  VIRTUAL_SENSOR_OWNER_ID,
  VIRTUAL_SENSOR_OWNER_NAME,
} from '../sensors/types.js';
import { disposeVirtualSensorHost, registerVirtualSensorHost } from './virtual.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { ModelSpec, PluginContract, SensorLike } from '@camera.ui/sdk';
import type { SensorJSON } from '@camera.ui/sdk/internal';
import type { CameraUiAPI } from '../api.js';
import type { Database } from '../api/database/index.js';
import type { DBSensorHistoryEntry } from '../api/database/types.js';
import type { DBSensor } from '../api/database/types.js';
import type { InternalEvent, InternalEventBus, InternalEventPayload } from '../internal-bus.js';
import type { CoordinatorSensorInfo, DetectionCoordinatorInterface } from '../rpc/interfaces/detection.js';
import type { RegisterSensorOptions, SensorRefreshedState, SensorRegistration, StoredSensorData } from '../rpc/interfaces/sensor.js';
import type { SensorContext } from '../sensors/sensor.js';

const HISTORY_MAX_ENTRIES = 500;

function stamp(timestamp: number): string {
  return String(Math.max(timestamp, 0)).padStart(15, '0');
}
const HISTORY_COALESCE_MS = 1000;

export interface GetSensorsOptions {
  connectedOnly?: boolean;
  cameraId?: string;
  pluginId?: string;
}

interface SensorRuntime {
  capabilities: string[];
  requiresFrames?: boolean;
  modelSpec?: ModelSpec;
}

@RPCClass
export class SensorRegistry {
  private readonly records = new Map<string, DBSensor>();
  private readonly runtime = new Map<string, SensorRuntime>();
  private readonly propertyValues = new Map<string, unknown>();
  private readonly coordinators = new Map<string, Promisify<DetectionCoordinatorInterface>>();

  private readonly pluginsService: PluginsService;
  private readonly context: SensorContext;
  private readonly disposables: (() => void | Promise<void>)[] = [];
  private readonly operationQueues = new Map<string, Promise<void>>();
  private historyWrites = 0;
  private readonly historyLastEntry = new Map<string, { key: string; timestamp: number }>();

  constructor(
    private readonly proxy: RPCClient,
    private readonly logger: Logger,
  ) {
    this.pluginsService = new PluginsService();

    this.context = {
      logger: this.logger,
      propertyValues: this.propertyValues,
      assignedCameraIds: (sensorId) => this.records.get(sensorId)?.assignedCameraIds ?? [],
      cameraDetectionSettings: (cameraId) => this.dbs.camerasDB.get(cameraId)?.detectionSettings.sensor,
      getCoordinator: (cameraId) => this.coordinatorFor(cameraId),
      publishSensorEvent: (sensorId, event) => {
        const ns = NamespaceManager.sensorEventNamespaces(sensorId);
        this.safePublish(ns.sensorSubject, event);
      },
      emitBus: (event, payload) => this.emitBus(event, payload),
      createPluginSensorRpc: (pluginId, sensorId) => {
        const ns = NamespaceManager.sensorProviderNamespaces(pluginId, sensorId).sensorRpc;
        return this.proxy.createProxy<SensorLike>(ns);
      },
      persistDisplayName: (sensorId, displayName) => this.persistRecord(sensorId, (record) => (record.displayName = displayName)),
      persistState: (sensorId, delta) => this.persistRecord(sensorId, (record) => (record.state = { ...record.state, ...delta })),
      appendHistory: (sensorId, delta) => this.appendHistory(sensorId, delta),
    };

    container.registerInstance('sensorRegistry', this);
  }

  private get dbs(): Database {
    return container.resolve<Database>('dbs');
  }

  public async init(): Promise<void> {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    const closeHandler = await this.proxy.registerHandler(ns.sensorsRpc, this, { isolatedConnection: true });
    this.disposables.push(closeHandler);

    const bus = container.resolve<InternalEventBus>('internalBus');
    const onCameraRemoved = (payload: unknown): void => {
      const { cameraId } = payload as { cameraId?: string };
      if (cameraId) this.onCameraRemoved(cameraId);
    };
    bus.onEvent('camera:removed', onCameraRemoved);
    this.disposables.push(() => bus.offEvent('camera:removed', onCameraRemoved));

    for (const { key, value } of this.dbs.sensorsDB.getRange()) {
      const record = value;
      this.records.set(String(key), record);
      this.seedPropertyValues(record._id, record.state ?? {});

      if (record.pluginInfo.id === VIRTUAL_SENSOR_OWNER_ID) {
        this.runtime.set(record._id, { capabilities: this.virtualCapabilities(record.type) });
        await registerVirtualSensorHost(this, record._id, record.type);
      }

      this.announceAdded(record);
    }
  }

  public async destroy(): Promise<void> {
    for (const dispose of this.disposables.reverse()) {
      try {
        await dispose();
      } catch (error) {
        this.logger.warn('Sensor registry disposal failed:', error);
      }
    }
    this.disposables.length = 0;

    this.records.clear();
    this.runtime.clear();
    this.propertyValues.clear();
    this.coordinators.clear();
    this.historyLastEntry.clear();
  }

  @RPCMethod
  public registerSensor(sensor: SensorJSON, pluginId: string, options?: RegisterSensorOptions): SensorRegistration {
    this.validateContract(sensor, pluginId, options);

    let record = this.reconcile(sensor, pluginId);
    const created = !record;

    if (!record) {
      record = {
        _id: randomUUID(),
        nativeId: sensor.nativeId,
        pluginInfo: { id: pluginId, name: this.getPluginContract(pluginId)?.name ?? pluginId },
        type: sensor.type,
        name: sensor.name,
        assignedCameraIds: options?.assignCameraId ? [options.assignCameraId] : [],
        boundCameraId: options?.assignCameraId,
        exposed: sensor.exposed ?? true,
        hidden: sensor.hidden,
        origin: sensor.origin,
        state: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.records.set(record._id, record);
    } else if (this.runtime.has(record._id)) {
      this.logger.debug(`Sensor "${sensor.name}" (${sensor.type}) of plugin "${pluginId}" re-registered, replacing runtime binding`);
      this.runtime.delete(record._id);
    }

    record.name = sensor.name;
    record.origin ??= sensor.origin;

    // camera.addSensor re-registration re-binds (also backfills migrated records)
    if (options?.assignCameraId) {
      record.boundCameraId = options.assignCameraId;
      // camera-bound means assigned to its camera, restore an assignment a plugin toggle removed
      if (!record.assignedCameraIds.includes(options.assignCameraId)) {
        record.assignedCameraIds.push(options.assignCameraId);
        this.announceAssignment(record, options.assignCameraId, true);
      }
    }
    record.updatedAt = Date.now();
    this.persistRecord(record._id, () => {});

    this.runtime.set(record._id, {
      capabilities: sensor.capabilities ? [...new Set(sensor.capabilities)] : [],
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
    });

    // fresh plugin state wins over persisted last-known state
    this.seedPropertyValues(record._id, { ...record.state, ...sensor.properties });
    this.context.persistState(record._id, sensor.properties);

    this.logger.debug(`Sensor registered: "${record.displayName ?? record.name}" (${record.type}) by plugin "${pluginId}"${created ? ' [new]' : ''}`);
    if (created) {
      this.announceAdded(record);
      if (options?.assignCameraId) {
        this.autoEnableDoorbellTrigger(record, options.assignCameraId).catch((error: unknown) =>
          this.logger.warn('Failed to enable doorbell sensor as detection trigger:', error),
        );
      }
    }
    this.announceConnected(record, true);

    for (const cameraId of record.assignedCameraIds) {
      this.enqueue(cameraId, () => this.pushSensorToCoordinator(record, cameraId));
    }

    return {
      id: record._id,
      assignedCameraIds: [...record.assignedCameraIds],
      active: true,
    };
  }

  @RPCMethod
  public resolveSensor(sensor: SensorJSON, pluginId: string, options?: RegisterSensorOptions): string {
    this.validateContract(sensor, pluginId, options);

    let record = this.reconcile(sensor, pluginId);
    if (!record) {
      record = {
        _id: randomUUID(),
        nativeId: sensor.nativeId,
        pluginInfo: { id: pluginId, name: this.getPluginContract(pluginId)?.name ?? pluginId },
        type: sensor.type,
        name: sensor.name,
        assignedCameraIds: options?.assignCameraId ? [options.assignCameraId] : [],
        boundCameraId: options?.assignCameraId,
        exposed: sensor.exposed ?? true,
        hidden: sensor.hidden,
        origin: sensor.origin,
        state: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.records.set(record._id, record);
      this.persistRecord(record._id, () => {});
      this.announceAdded(record);
      if (options?.assignCameraId) {
        this.autoEnableDoorbellTrigger(record, options.assignCameraId).catch((error: unknown) =>
          this.logger.warn('Failed to enable doorbell sensor as detection trigger:', error),
        );
      }
    }

    return record._id;
  }

  @RPCMethod
  public unregisterSensor(sensorId: string): void {
    const record = this.records.get(sensorId);
    if (!record || !this.runtime.has(sensorId)) return;

    this.logger.debug(`Sensor disconnected: "${record.displayName ?? record.name}" (${record.type})`);
    this.disconnectSensor(sensorId);
  }

  public removePluginSensors(pluginId: string): void {
    for (const record of this.records.values()) {
      if (record.pluginInfo.id === pluginId && this.runtime.has(record._id)) {
        this.disconnectSensor(record._id);
      }
    }
  }

  public async deleteSensor(sensorId: string): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record) return;

    // a connected plugin sensor re-registers with a fresh id, delete is for leftovers
    if (this.runtime.has(sensorId) && record.pluginInfo.id !== VIRTUAL_SENSOR_OWNER_ID) {
      throw new Error(`Sensor "${record.displayName ?? record.name}" is still provided by plugin "${record.pluginInfo.name}"`);
    }

    if (this.runtime.has(sensorId)) this.disconnectSensor(sensorId);
    if (record.pluginInfo.id === VIRTUAL_SENSOR_OWNER_ID) await disposeVirtualSensorHost(sensorId);
    this.records.delete(sensorId);
    await this.dbs.sensorsDB.remove(sensorId);
    this.pruneHistory(sensorId, 0);
    await new FloorPlanService().dropSensors([sensorId]);

    this.logger.debug(`Sensor deleted: "${record.displayName ?? record.name}" (${record.type})`);
  }

  public async createVirtualSensor(input: { type: SensorType; name: string; assignCameraId?: string }): Promise<DBSensor> {
    const duplicate = this.getRecords().find((r) => r.pluginInfo.id === VIRTUAL_SENSOR_OWNER_ID && r.type === input.type && r.name === input.name);
    if (duplicate) {
      throw new Error(`A virtual ${input.type} sensor named "${input.name}" already exists`);
    }

    const defaults = isVirtualSensorType(input.type) ? VIRTUAL_SENSOR_DEFAULT_PROPERTIES[input.type] : {};
    const record: DBSensor = {
      _id: randomUUID(),
      pluginInfo: { id: VIRTUAL_SENSOR_OWNER_ID, name: VIRTUAL_SENSOR_OWNER_NAME },
      type: input.type,
      name: input.name,
      assignedCameraIds: input.assignCameraId ? [input.assignCameraId] : [],
      exposed: true,
      state: { ...defaults },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.records.set(record._id, record);
    await this.dbs.sensorsDB.put(record._id, record);

    this.runtime.set(record._id, { capabilities: this.virtualCapabilities(record.type) });
    this.seedPropertyValues(record._id, record.state ?? {});
    await registerVirtualSensorHost(this, record._id, record.type);

    this.logger.debug(`Virtual sensor created: ${record.name} (${record.type})`);
    this.announceAdded(record);
    if (input.assignCameraId) {
      this.autoEnableDoorbellTrigger(record, input.assignCameraId).catch((error: unknown) =>
        this.logger.warn('Failed to enable doorbell sensor as detection trigger:', error),
      );
    }
    for (const cameraId of record.assignedCameraIds) {
      this.enqueue(cameraId, () => this.pushSensorToCoordinator(record, cameraId));
    }

    return record;
  }

  public async assignCamera(sensorId: string, cameraId: string): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record) throw new Error(`Sensor ${sensorId} not found`);
    if (record.assignedCameraIds.includes(cameraId)) return;

    if (SENSOR_TYPE_CONFIG[record.type].cameraBound && record.assignedCameraIds.length > 0) {
      throw new Error(`Sensor type "${record.type}" is camera-bound and already assigned`);
    }

    record.assignedCameraIds.push(cameraId);
    this.persistRecord(sensorId, () => {});
    this.announceAssignment(record, cameraId, true);
    this.autoEnableDoorbellTrigger(record, cameraId).catch((error: unknown) => this.logger.warn('Failed to enable doorbell sensor as detection trigger:', error));
    if (this.runtime.has(sensorId)) this.enqueue(cameraId, () => this.pushSensorToCoordinator(record, cameraId));
  }

  public async unassignCamera(sensorId: string, cameraId: string): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record?.assignedCameraIds.includes(cameraId)) return;

    record.assignedCameraIds = record.assignedCameraIds.filter((id) => id !== cameraId);
    this.persistRecord(sensorId, () => {});
    this.announceAssignment(record, cameraId, false);
    this.enqueue(cameraId, () => this.removeSensorFromCoordinator(sensorId, cameraId));
  }

  public async setAssignedCameras(sensorId: string, cameraIds: string[]): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record) throw new Error(`Sensor ${sensorId} not found`);

    const target = new Set(cameraIds);
    const current = new Set(record.assignedCameraIds);

    if (record.boundCameraId) {
      const unchanged = target.size === current.size && [...target].every((id) => current.has(id));
      if (unchanged) return;
      throw new Error(`Sensor "${record.displayName ?? record.name}" was registered on its camera by plugin "${record.pluginInfo.id}", its assignment cannot be changed`);
    }

    for (const cameraId of current) {
      if (!target.has(cameraId)) await this.unassignCamera(sensorId, cameraId);
    }
    for (const cameraId of target) {
      if (!current.has(cameraId)) await this.assignCamera(sensorId, cameraId);
    }
  }

  public async setHidden(sensorId: string, hidden: boolean): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record) throw new Error(`Sensor ${sensorId} not found`);
    if ((record.hidden ?? false) === hidden) return;

    record.hidden = hidden;
    this.persistRecord(sensorId, () => {});
  }

  public async setExposed(sensorId: string, exposed: boolean): Promise<void> {
    const record = this.records.get(sensorId);
    if (!record) throw new Error(`Sensor ${sensorId} not found`);
    if (record.exposed === exposed) return;

    record.exposed = exposed;
    this.persistRecord(sensorId, () => {});

    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.safePublish(ns.sensorsSubject, {
      type: 'sensor:exposed:changed',
      data: { sensorId: record._id, sensorType: record.type, exposed },
    });

    this.emitBus('sensor:exposed:changed', {
      sensorId: record._id,
      sensorType: String(record.type),
      sensorName: record.name,
      assignedCameraIds: [...record.assignedCameraIds],
      exposed,
    });
  }

  public async unassignPluginFromCamera(pluginId: string, cameraId: string): Promise<void> {
    for (const record of this.records.values()) {
      if (record.pluginInfo.id === pluginId && record.assignedCameraIds.includes(cameraId)) {
        await this.unassignCamera(record._id, cameraId);
      }
    }
  }

  public onCameraRemoved(cameraId: string): void {
    const orphaned: string[] = [];

    for (const record of this.records.values()) {
      if (record.boundCameraId === cameraId) orphaned.push(record._id);
      if (record.assignedCameraIds.includes(cameraId)) {
        record.assignedCameraIds = record.assignedCameraIds.filter((id) => id !== cameraId);
        this.persistRecord(record._id, () => {});
      }
    }

    if (orphaned.length > 0) {
      new FloorPlanService().dropSensors(orphaned).catch((error: unknown) => this.logger.warn('Failed to remove sensors from the floor plan:', error));
    }
  }

  public getSensor(sensorId: string, options: { connectedOnly?: boolean } = {}): ServerSensor | undefined {
    const record = this.records.get(sensorId);
    if (!record) return undefined;
    if (options.connectedOnly && !this.runtime.has(sensorId)) return undefined;
    return new ServerSensor(this.toStoredData(record), this.context);
  }

  public getAllSensors(options: GetSensorsOptions = { connectedOnly: true }): ServerSensor[] {
    return Array.from(this.records.values())
      .filter((record) => !options.connectedOnly || this.runtime.has(record._id))
      .filter((record) => !options.cameraId || record.assignedCameraIds.includes(options.cameraId))
      .filter((record) => !options.pluginId || record.pluginInfo.id === options.pluginId)
      .map((record) => new ServerSensor(this.toStoredData(record), this.context));
  }

  public getRecord(sensorId: string): DBSensor | undefined {
    return this.records.get(sensorId);
  }

  public getRecords(): DBSensor[] {
    return Array.from(this.records.values());
  }

  public isConnected(sensorId: string): boolean {
    return this.runtime.has(sensorId);
  }

  @RPCMethod
  public updatePropertyValues(sensorId: string, properties: Record<string, unknown>): void {
    this.getSensor(sensorId)?.applyPropertyWrites(properties);
  }

  @RPCMethod
  public updateModelSpec(sensorId: string, modelSpec: ModelSpec): void {
    const runtime = this.runtime.get(sensorId);
    const record = this.records.get(sensorId);
    if (!runtime || !record) return;

    runtime.modelSpec = modelSpec;

    for (const cameraId of record.assignedCameraIds) {
      this.enqueue(cameraId, () => this.pushSensorToCoordinator(record, cameraId));
    }
  }

  @RPCMethod
  public updateCapabilities(sensorId: string, capabilities: string[]): void {
    const runtime = this.runtime.get(sensorId);
    const sensor = this.getSensor(sensorId);
    if (!runtime || !sensor) return;

    runtime.capabilities = [...new Set(capabilities)];
    sensor.applyCapabilityUpdate(runtime.capabilities);
    this.pushCapabilitiesToCoordinators(sensorId, runtime.capabilities);
  }

  @RPCMethod
  public getPropertyValue(sensorId: string, property: string): unknown {
    return this.propertyValues.get(`${sensorId}:${property}`);
  }

  @RPCMethod
  public getAllPropertyValues(sensorId: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const prefix = `${sensorId}:`;
    for (const [key, value] of this.propertyValues) {
      if (key.startsWith(prefix)) result[key.substring(prefix.length)] = value;
    }
    return result;
  }

  @RPCMethod
  public getSensorState(sensorId: string): SensorRefreshedState | undefined {
    return this.getSensor(sensorId, { connectedOnly: true })?.getState();
  }

  @RPCMethod
  public getSensorStates(): Record<string, SensorRefreshedState> {
    const result: Record<string, SensorRefreshedState> = {};
    for (const sensor of this.getAllSensors()) {
      result[sensor.id] = sensor.getState();
    }
    return result;
  }

  @RPCMethod
  public getSensors(pluginId?: string): StoredSensorData[] {
    // disconnected entities included, the connected flag tells consumers apart
    return this.getAllSensors({ connectedOnly: false })
      .filter((s) => this.canPluginAccessSensor(s.data, pluginId))
      .map((s) => s.data);
  }

  @RPCMethod
  public getSensorRpc(sensorId: string, pluginId?: string): StoredSensorData | undefined {
    const sensor = this.getSensor(sensorId);
    if (!sensor || !this.canPluginAccessSensor(sensor.data, pluginId)) return undefined;
    return sensor.data;
  }

  @RPCMethod
  public getSensorByType(sensorType: SensorType, pluginId?: string): StoredSensorData | undefined {
    return this.getAllSensors().find((s) => s.type === sensorType && this.canPluginAccessSensor(s.data, pluginId))?.data;
  }

  @RPCMethod
  public getSensorsByTypeRpc(sensorType: SensorType, pluginId?: string): StoredSensorData[] {
    return this.getAllSensors()
      .filter((s) => s.type === sensorType && this.canPluginAccessSensor(s.data, pluginId))
      .map((s) => s.data);
  }

  @RPCMethod
  public async setDisplayName(sensorId: string, displayName: string): Promise<void> {
    const sensor = this.getSensor(sensorId);
    if (!sensor) throw new Error(`Sensor ${sensorId} not found`);
    await sensor.setDisplayNameAsync(displayName);
  }

  public toStoredData(record: DBSensor): StoredSensorData {
    const runtime = this.runtime.get(record._id);
    return {
      id: record._id,
      type: record.type,
      name: record.name,
      displayName: record.displayName ?? record.name,
      nativeId: record.nativeId,
      pluginId: record.pluginInfo.id,
      assignedCameraIds: [...record.assignedCameraIds],
      boundCameraId: record.boundCameraId,
      exposed: record.exposed,
      connected: this.runtime.has(record._id),
      properties: this.getAllPropertyValues(record._id),
      capabilities: runtime?.capabilities ?? [],
      requiresFrames: runtime?.requiresFrames ?? false,
      modelSpec: runtime?.modelSpec,
    };
  }

  public coordinatorFor(cameraId: string): Promisify<DetectionCoordinatorInterface> {
    let coordinator = this.coordinators.get(cameraId);
    if (!coordinator) {
      const ns = NamespaceManager.frameWorkerDetectionNamespaces(cameraId);
      coordinator = this.proxy.createProxy<DetectionCoordinatorInterface>(ns.detectionRpc);
      this.coordinators.set(cameraId, coordinator);
    }
    return coordinator;
  }

  private validateContract(sensor: SensorJSON, pluginId: string, options?: RegisterSensorOptions): void {
    if (pluginId === VIRTUAL_SENSOR_OWNER_ID) return;

    const contract = this.getPluginContract(pluginId);
    if (!contract) return;

    if (!contract.provides.includes(sensor.type)) {
      throw new Error(`Plugin "${pluginId}" cannot provide sensor type "${sensor.type}" - not declared in contract.provides`);
    }

    if (options?.assignCameraId) {
      const camera = this.dbs.camerasDB.get(options.assignCameraId);
      const isOwnCamera = camera?.pluginInfo?.id === pluginId;
      if (!isOwnCamera && !canProvideSensorsToAnyCameras(contract)) {
        throw new Error(`Plugin "${pluginId}" cannot provide sensors to cameras it didn't create. Role "${contract.role}" only allows providing sensors to own cameras.`);
      }
    } else if (!canProvideSensorsToAnyCameras(contract)) {
      throw new Error(`Plugin "${pluginId}" cannot register standalone sensors. Role "${contract.role}" only allows sensors on own cameras.`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (!options?.assignCameraId && (sensor.type === SensorType.PTZ || sensor.type === SensorType.Battery)) {
      throw new Error(`Sensor type "${sensor.type}" requires a camera, register it via camera.addSensor()`);
    }
  }

  private reconcile(sensor: SensorJSON, pluginId: string): DBSensor | undefined {
    for (const record of this.records.values()) {
      if (record.pluginInfo.id !== pluginId) continue;
      if (sensor.nativeId && record.nativeId) {
        if (record.nativeId === sensor.nativeId) return record;
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
      if (record.type === sensor.type && record.name === sensor.name) return record;
    }
    return undefined;
  }

  private disconnectSensor(sensorId: string): void {
    const record = this.records.get(sensorId);
    this.runtime.delete(sensorId);

    // propertyValues stay as last-known state, the entity outlives the plugin
    if (record) {
      this.announceConnected(record, false);
      for (const cameraId of record.assignedCameraIds) {
        this.enqueue(cameraId, () => this.removeSensorFromCoordinator(sensorId, cameraId));
      }
    }
  }

  public async syncCameraProviders(cameraId: string): Promise<void> {
    for (const record of this.records.values()) {
      if (!record.assignedCameraIds.includes(cameraId) || !this.runtime.has(record._id)) continue;
      await this.enqueue(cameraId, () => this.pushSensorToCoordinator(record, cameraId));
    }
  }

  public async reconcileCamera(cameraId: string, maxRetries = 1): Promise<void> {
    for (const record of this.records.values()) {
      if (!record.assignedCameraIds.includes(cameraId) || !this.runtime.has(record._id)) continue;

      if (!this.feedsCamera(record, cameraId)) continue;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.coordinatorFor(cameraId).onSensorAdded(this.coordinatorInfoFor(record, cameraId));
          break;
        } catch (error) {
          if (attempt < maxRetries) {
            this.logger.debug(`Re-sync sensor ${record._id} failed (attempt ${attempt}/${maxRetries}), retrying...`);
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } else {
            this.logger.warn(`Failed to re-sync sensor ${record._id} to coordinator:`, error);
          }
        }
      }
    }

    // replay sustained cascade triggers that are currently in trigger-state,
    // otherwise a contact sensor open during the crash stays silently lost
    const settings = this.context.cameraDetectionSettings(cameraId);
    for (const sensorId of settings?.triggers ?? []) {
      const record = this.records.get(sensorId);
      if (!record || !this.runtime.has(sensorId)) continue;

      const trigger = SENSOR_TYPE_CONFIG[record.type]?.cascadeTrigger;
      if (!trigger) continue;

      const currentValue = this.propertyValues.get(`${sensorId}:${trigger.property}`);
      if (currentValue !== trigger.value) continue;

      try {
        await this.coordinatorFor(cameraId).reportSensorTrigger(
          sensorId,
          SENSOR_TYPE_CONFIG[record.type].assignmentKey,
          'activate',
          trigger.sustained,
          settings?.timeout ?? 0,
        );
      } catch (error) {
        this.logger.warn(`Failed to re-sync cascade trigger for sensor ${sensorId}:`, error);
      }
    }
  }

  private async pushSensorToCoordinator(record: DBSensor, cameraId: string): Promise<void> {
    // no worker, no listener: the call would burn seconds in no-responder retries, reconcileCamera replays on start
    if (!this.hasFrameWorker(cameraId)) return;

    try {
      if (!this.feedsCamera(record, cameraId)) {
        await this.coordinatorFor(cameraId).onSensorRemoved(record._id);
        return;
      }
      await this.coordinatorFor(cameraId).onSensorAdded(this.coordinatorInfoFor(record, cameraId));
    } catch {
      // worker not running, reconcileCamera replays on start
    }
  }

  private async removeSensorFromCoordinator(sensorId: string, cameraId: string): Promise<void> {
    if (!this.hasFrameWorker(cameraId)) return;

    try {
      await this.coordinatorFor(cameraId).onSensorRemoved(sensorId);
    } catch {
      // worker not running
    }
  }

  private coordinatorInfoFor(record: DBSensor, cameraId: string): CoordinatorSensorInfo {
    const runtime = this.runtime.get(record._id);
    return {
      pluginId: record.pluginInfo.id,
      sensorId: record._id,
      sensorType: this.coordinatorSensorType(record, cameraId),
      capabilities: [...(runtime?.capabilities ?? [])],
      requiresFrames: runtime?.requiresFrames ?? false,
      modelSpec: runtime?.modelSpec,
    };
  }

  private coordinatorSensorType(record: DBSensor, cameraId: string): SensorType {
    if (record.type !== SensorType.Object) return record.type;
    if (this.isAssignedFor(record, cameraId, 'object')) return SensorType.Object;
    return this.isAssignedFor(record, cameraId, 'objectAssist') ? SensorType.ObjectAssist : record.type;
  }

  private feedsCamera(record: DBSensor, cameraId: string): boolean {
    if (!DETECTION_SENSOR_TYPES.has(record.type)) return true;
    if (record.type === SensorType.Object) {
      return this.isAssignedFor(record, cameraId, 'object') || this.isAssignedFor(record, cameraId, 'objectAssist');
    }
    return this.isAssignedFor(record, cameraId, SENSOR_TYPE_CONFIG[record.type].assignmentKey);
  }

  private isAssignedFor(record: DBSensor, cameraId: string, assignmentKey: string): boolean {
    const assignments = this.dbs.camerasDB.get(cameraId)?.assignments;
    const assignment = assignments?.[assignmentKey as keyof typeof assignments];
    if (Array.isArray(assignment)) return assignment.some((p) => p.id === record.pluginInfo.id);
    return assignment?.id === record.pluginInfo.id;
  }

  private hasFrameWorker(cameraId: string): boolean {
    return container.resolve<CameraUiAPI>('api').getCamera(cameraId)?.frameWorkerConnected === true;
  }

  private enqueue<T>(cameraId: string, fn: () => Promise<T>): Promise<T> {
    const queue = this.operationQueues.get(cameraId) ?? Promise.resolve();
    const op = queue.then(fn, fn);
    this.operationQueues.set(
      cameraId,
      op.then(
        () => {},
        () => {},
      ),
    );
    return op;
  }

  private announceAdded(record: DBSensor): void {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    const data = this.toStoredData(record);
    this.safePublish(ns.sensorsSubject, {
      type: 'sensor:added',
      data: { sensor: data, state: { type: data.type, properties: data.properties, capabilities: data.capabilities } },
    });

    this.emitBus('sensor:added', {
      sensorId: record._id,
      sensorType: String(record.type),
      sensorName: record.name,
      assignedCameraIds: [...record.assignedCameraIds],
      connected: data.connected,
    });
  }

  private announceDeleted(record: DBSensor): void {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.safePublish(ns.sensorsSubject, { type: 'sensor:deleted', data: { sensorId: record._id, sensorType: record.type } });

    this.emitBus('sensor:deleted', {
      sensorId: record._id,
      sensorType: String(record.type),
      sensorName: record.name,
      assignedCameraIds: [...record.assignedCameraIds],
    });
  }

  private announceConnected(record: DBSensor, connected: boolean): void {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.safePublish(ns.sensorsSubject, {
      type: 'sensor:connected:changed',
      data: { sensorId: record._id, sensorType: record.type, connected },
    });

    this.emitBus('sensor:connected:changed', {
      sensorId: record._id,
      sensorType: String(record.type),
      sensorName: record.name,
      assignedCameraIds: [...record.assignedCameraIds],
      connected,
    });
  }

  private announceAssignment(record: DBSensor, cameraId: string, assigned: boolean): void {
    const ns = NamespaceManager.sensorRegistryNamespaces();
    this.safePublish(ns.sensorsSubject, {
      type: 'sensor:assignment:changed',
      data: { sensorId: record._id, sensorType: record.type, cameraId, assigned },
    });

    this.emitBus('sensor:assignment:changed', {
      sensorId: record._id,
      sensorType: String(record.type),
      sensorName: record.name,
      assignedCameraIds: [...record.assignedCameraIds],
    });
  }

  private async autoEnableDoorbellTrigger(record: DBSensor, cameraId: string): Promise<void> {
    if (record.type !== SensorType.Doorbell) return;
    const camera = this.dbs.camerasDB.get(cameraId);
    if (!camera || camera.detectionSettings.sensor.triggers.includes(record._id)) return;

    const camerasService = new CamerasService();
    await camerasService.patchCameraByName(camera.name, {
      detectionSettings: { sensor: { triggers: [...camera.detectionSettings.sensor.triggers, record._id] } },
    });
    this.logger.debug(`Doorbell sensor "${record.displayName ?? record.name}" enabled as detection trigger for camera "${camera.name}"`);
  }

  private pushCapabilitiesToCoordinators(sensorId: string, capabilities: string[]): void {
    const record = this.records.get(sensorId);
    if (!record) return;
    for (const cameraId of record.assignedCameraIds) {
      this.coordinatorFor(cameraId)
        .onSensorCapabilitiesChanged(sensorId, capabilities)
        .catch(() => {});
    }
  }

  private seedPropertyValues(sensorId: string, properties: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(properties)) {
      this.propertyValues.set(`${sensorId}:${key}`, value);
    }
  }

  private virtualCapabilities(type: SensorType): string[] {
    return [...((VIRTUAL_SENSOR_DEFAULT_CAPABILITIES as Partial<Record<SensorType, string[]>>)[type] ?? [])];
  }

  private appendHistory(sensorId: string, delta: Record<string, unknown>): void {
    const now = Date.now();
    let appended = false;

    for (const [property, value] of Object.entries(delta)) {
      if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;

      const coalesceKey = `${sensorId}:${property}`;
      const previous = this.historyLastEntry.get(coalesceKey);
      if (previous && now - previous.timestamp < HISTORY_COALESCE_MS) {
        this.dbs.sensorHistoryDB.remove(previous.key).catch(() => {});
      }

      const key = `${sensorId}:${String(now).padStart(15, '0')}:${property}`;
      this.dbs.sensorHistoryDB.put(key, { sensorId, property, value, timestamp: now }).catch(() => {});
      this.historyLastEntry.set(coalesceKey, { key, timestamp: now });
      appended = true;
    }

    if (appended && ++this.historyWrites % 50 === 0) {
      this.pruneHistory(sensorId, HISTORY_MAX_ENTRIES);
    }
  }

  public getHistory(sensorId: string, limit = 200): { property: string; value: unknown; timestamp: number }[] {
    const entries: { property: string; value: unknown; timestamp: number }[] = [];
    // reverse ranges iterate from `start` downwards, so start is the HIGH bound
    for (const { value } of this.dbs.sensorHistoryDB.getRange({ start: `${sensorId};`, end: `${sensorId}:`, reverse: true, limit })) {
      entries.push({ property: value.property, value: value.value, timestamp: value.timestamp });
    }
    return entries;
  }

  public getSensorHistory(sensorIds: string[], from: number, to: number): DBSensorHistoryEntry[] {
    const entries: DBSensorHistoryEntry[] = [];

    for (const sensorId of sensorIds) {
      const seeded = new Set<string>();

      for (const { value } of this.dbs.sensorHistoryDB.getRange({ start: `${sensorId}:${stamp(from)}`, end: `${sensorId}:${stamp(to)};`, limit: 500 })) {
        seeded.add(value.property);
        entries.push(value);
      }

      const before: DBSensorHistoryEntry[] = [];
      for (const { value } of this.dbs.sensorHistoryDB.getRange({ start: `${sensorId}:${stamp(from)}`, end: `${sensorId}:`, reverse: true, limit: 200 })) {
        if (seeded.has(value.property) || before.some((entry) => entry.property === value.property)) continue;
        before.push(value);
      }

      entries.push(...before);
    }

    return entries.sort((a, b) => a.timestamp - b.timestamp);
  }

  private pruneHistory(sensorId: string, keep: number): void {
    const keys: string[] = [];
    for (const { key } of this.dbs.sensorHistoryDB.getRange({ start: `${sensorId};`, end: `${sensorId}:`, reverse: true })) {
      keys.push(String(key));
    }
    for (const key of keys.slice(keep)) {
      this.dbs.sensorHistoryDB.remove(key).catch(() => {});
    }
  }

  private persistRecord(sensorId: string, mutate: (record: DBSensor) => void): void {
    const record = this.records.get(sensorId);
    if (!record) return;

    mutate(record);
    record.updatedAt = Date.now();
    this.dbs.sensorsDB.put(record._id, record).catch((error) => {
      this.logger.warn(`Failed to persist sensor ${sensorId}:`, error);
    });
  }

  private canPluginAccessSensor(sensor: StoredSensorData, requestingPluginId?: string): boolean {
    if (!requestingPluginId) return true;
    if (sensor.pluginId === requestingPluginId) return true;
    const contract = this.getPluginContract(requestingPluginId);
    return contract?.consumes.includes(sensor.type) ?? false;
  }

  private getPluginContract(pluginId: string): PluginContract | undefined {
    return this.pluginsService.getPluginById(pluginId)?.contract;
  }

  private emitBus<T extends InternalEventPayload>(event: InternalEvent, payload: T): void {
    try {
      const bus = container.resolve<InternalEventBus>('internalBus');
      bus.emitEvent(event, payload);
    } catch {
      // ignore
    }
  }

  private safePublish<T>(subject: string, data: T): void {
    if (!this.proxy.isConnected) return;
    this.proxy.publish(subject, data).catch(() => {});
  }
}
