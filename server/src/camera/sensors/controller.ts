import { sleep } from '@camera.ui/common/utils';
import { RPCClass, RPCMethod } from '@camera.ui/rpc';
import { canProvideSensorsToAnyCameras, SensorType } from '@camera.ui/sdk';
import { container } from 'tsyringe';

import { PluginsService } from '../../api/services/plugins.service.js';
import { PLUGIN_STATUS } from '../../plugins/types.js';
import { NamespaceManager } from '../../rpc/namespaces.js';
import { ServerSensor } from './sensor.js';
import { computeSensorStableId } from './stable-id.js';
import { MULTI_PROVIDER_TYPES, SENSOR_TYPE_CONFIG } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { PluginAssignments, PluginContract, SensorLike, SensorTriggerRef } from '@camera.ui/sdk';
import type { PropertyChangedEvent, SensorJSON } from '@camera.ui/sdk/internal';
import type { InternalEvent, InternalEventBus, InternalEventPayload } from '../../internal-bus.js';
import type { CoordinatorSensorInfo, DetectionCoordinatorInterface } from '../../rpc/interfaces/detection.js';
import type {
  SensorAddedEvent,
  SensorCapabilitiesChangedEvent,
  SensorRefreshedState,
  SensorRemovedEvent,
  SensorWriteMessage,
  StoredSensorData,
} from '../../rpc/interfaces/sensor.js';
import type { FrameWorkerDetectionNamespaces, SensorControllerNamespaces } from '../../rpc/namespaces.js';
import type { CameraController } from '../controller.js';
import type { FrameWorker } from '../decoder/worker.js';

export interface SensorControllerEvents {
  'property:changed': PropertyChangedEvent;
  'sensor:added': SensorAddedEvent;
  'sensor:removed': SensorRemovedEvent;
  'sensor:capabilities:changed': SensorCapabilitiesChangedEvent;
}

// Shared context passed into each ServerSensor. Bundles everything a sensor needs
// to act on its own state without hopping back through the controller.
export interface SensorContext {
  readonly cameraId: string;
  readonly logger: Logger;
  readonly propertyValues: Map<string, unknown>;
  readonly sensors: Map<string, StoredSensorData>;
  readonly detectionCoordinator: Promisify<DetectionCoordinatorInterface>;
  readonly sensorTimeout: () => number;
  readonly sensorTriggers: () => readonly SensorTriggerRef[];
  readonly sensorStorageProxy: (pluginId: string, sensorId: string) => { setInternalValue: (key: string, value: unknown) => Promise<void> };
  readonly publishSensorEvent: (sensorId: string, event: { type: string; data: unknown }) => void;
  readonly emitBus: <T extends InternalEventPayload>(event: InternalEvent, payload: T) => void;
  readonly createPluginSensorRpc: (pluginId: string, sensorId: string) => Promisify<SensorLike>;
}

@RPCClass
export class SensorController {
  private readonly sensors = new Map<string, StoredSensorData>();
  private readonly propertyValues = new Map<string, unknown>();
  private readonly sensorProviders = new Map<SensorType, string>();
  private readonly sensorOwners = new Map<string, string>();

  private readonly namespaces: SensorControllerNamespaces & FrameWorkerDetectionNamespaces;
  private readonly pluginsService: PluginsService;
  private readonly context: SensorContext;

  private readonly disposables: (() => void | Promise<void>)[] = [];
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(
    private cameraController: CameraController,
    private frameWorker: FrameWorker,
    private proxy: RPCClient,
  ) {
    this.pluginsService = new PluginsService();

    this.namespaces = {
      ...NamespaceManager.sensorControllerNamespaces(this.cameraController.id),
      ...NamespaceManager.frameWorkerDetectionNamespaces(this.cameraController.id),
    };

    this.context = {
      cameraId: this.cameraController.id,
      logger: this.cameraController.logger as Logger,
      propertyValues: this.propertyValues,
      sensors: this.sensors,
      detectionCoordinator: this.proxy.createProxy<DetectionCoordinatorInterface>(this.namespaces.detectionRpc),
      sensorTimeout: () => this.cameraController.camera.detectionSettings.sensor.timeout,
      sensorTriggers: () => this.cameraController.camera.detectionSettings.sensor.triggers,
      sensorStorageProxy: (pluginId, sensorId) => this.cameraController.sensorStorageProxy(pluginId, sensorId),
      publishSensorEvent: (sensorId, event) => {
        const ns = NamespaceManager.sensorEventNamespaces(this.cameraController.id, sensorId);
        this.safePublish(ns.sensorSubject, event);
      },
      emitBus: (event, payload) => {
        try {
          const bus = container.resolve<InternalEventBus>('internalBus');
          bus.emitEvent(event, payload);
        } catch {
          // ignore
        }
      },
      createPluginSensorRpc: (pluginId, sensorId) => {
        const ns = NamespaceManager.sensorProviderNamespaces(pluginId, this.cameraController.id, sensorId).sensorRpc;
        return this.proxy.createProxy<SensorLike>(ns);
      },
    };
  }

  public get sensorSubject(): string {
    return this.namespaces.sensorSubject;
  }

  public get detectionCoordinatorProxy(): Promisify<DetectionCoordinatorInterface> {
    return this.context.detectionCoordinator;
  }

  public async init(): Promise<void> {
    const closeProxy = await this.proxy.registerHandler(this.namespaces.sensorRpc, this, { isolatedConnection: true });
    this.disposables.push(closeProxy);

    // Coordinator-published write batches for detection-sensor properties —
    // worker owns the state, we only mirror.
    const writeUnsub = await this.proxy.subscribe<SensorWriteMessage>(this.namespaces.sensorWriteSubject, (msg) => {
      this.getSensor(msg.sensorId)?.applyWriteBatch(msg.properties);
    });
    this.disposables.push(writeUnsub);

    const settings = this.cameraController.onPropertyChange('detectionSettings').subscribe(({ newData }) => {
      this.handleSensorTriggersChanged(newData.sensor?.triggers ?? []);
    });
    this.disposables.push(() => settings.dispose());
  }

  public async destroy(): Promise<void> {
    for (const dispose of this.disposables.reverse()) {
      try {
        await dispose();
      } catch (error) {
        this.cameraController.logger.warn('Sensor controller disposal failed:', error);
      }
    }
    this.disposables.length = 0;

    this.propertyValues.clear();
    this.sensors.clear();
    this.sensorProviders.clear();
    this.sensorOwners.clear();
  }

  public registerSensor(sensor: SensorJSON, pluginId: string): boolean {
    const contract = this.getPluginContract(pluginId);
    if (contract) {
      if (!contract.provides.includes(sensor.type)) {
        throw new Error(`Plugin "${pluginId}" cannot provide sensor type "${sensor.type}" - not declared in contract.provides`);
      }

      const isOwnCamera = this.cameraController.camera.pluginInfo?.id === pluginId;
      if (!isOwnCamera && !canProvideSensorsToAnyCameras(contract)) {
        throw new Error(`Plugin "${pluginId}" cannot provide sensors to cameras it didn't create. Role "${contract.role}" only allows providing sensors to own cameras.`);
      }
    }

    // Plugins that recreate sensor instances on reconnect (new UUID each time)
    // without cleaning up the previous one — dedupe by (pluginId, type, name).
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    const existing = Array.from(this.sensors.values()).find((s) => s.pluginId === pluginId && s.type === sensor.type && s.name === sensor.name);
    if (existing && existing.id !== sensor.id) {
      this.cameraController.logger.debug(
        `Replacing existing sensor "${sensor.name}" (${sensor.type}) from plugin "${pluginId}" — old id=${existing.id}, new id=${sensor.id}`,
      );
      this.unregisterSensor(existing.id);
    }

    const capabilities = sensor.capabilities ? [...new Set(sensor.capabilities)] : [];
    const storedData: StoredSensorData = {
      id: sensor.id,
      stableId: computeSensorStableId(pluginId, sensor.type, sensor.name),
      type: sensor.type,
      name: sensor.name,
      displayName: sensor.displayName,
      pluginId,
      properties: sensor.properties,
      capabilities,
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
    };

    this.sensors.set(sensor.id, storedData);
    this.sensorOwners.set(sensor.id, pluginId);

    if (!MULTI_PROVIDER_TYPES.has(sensor.type) && !this.sensorProviders.has(sensor.type)) {
      this.sensorProviders.set(sensor.type, pluginId);
    }

    for (const [key, value] of Object.entries(sensor.properties)) {
      this.propertyValues.set(`${sensor.id}:${key}`, value);
    }

    const isAssigned = this.isSensorTypeActivated(pluginId, sensor.type);
    if (isAssigned) {
      this.cameraController.logger.log(`Sensor registered: "${sensor.displayName || sensor.name}" (${sensor.type}) by plugin "${pluginId}"`);

      this.emitSensorAdded(storedData, { type: sensor.type, properties: sensor.properties, capabilities });
      this.enqueue(() => this.pushSensorAdded(storedData));
    }

    return isAssigned;
  }

  public unregisterSensor(sensorId: string): void {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) return;

    this.cameraController.logger.log(`Sensor unregistered: "${sensor.displayName || sensor.name}" (${sensor.type})`);

    if (!MULTI_PROVIDER_TYPES.has(sensor.type)) {
      const remaining = Array.from(this.sensors.values()).filter((s) => s.type === sensor.type && s.id !== sensorId);
      if (remaining.length === 0) this.sensorProviders.delete(sensor.type);
    }

    this.sensorOwners.delete(sensorId);
    this.sensors.delete(sensorId);

    for (const key of this.propertyValues.keys()) {
      if (key.startsWith(`${sensorId}:`)) this.propertyValues.delete(key);
    }

    this.enqueue(() => this.pushSensorRemoved(sensorId));

    this.emitSensorRemoved(sensor);
  }

  public removePluginSensors(pluginId: string): void {
    const toRemove: string[] = [];
    for (const [sensorId, owner] of this.sensorOwners) {
      if (owner === pluginId) toRemove.push(sensorId);
    }
    for (const sensorId of toRemove) this.unregisterSensor(sensorId);
  }

  public onAssignmentChanged(pluginId: string, sensorType: SensorType, enabled: boolean): void {
    const affected = Array.from(this.sensors.values()).filter((s) => s.pluginId === pluginId && s.type === sensorType);

    for (const sensor of affected) {
      this.cameraController.logger.log(
        `Sensor ${enabled ? 'activated' : 'deactivated'}: "${sensor.displayName || sensor.name}" (${sensor.type}) by plugin "${pluginId}"`,
      );

      if (enabled) {
        this.emitSensorAdded(sensor);
        this.enqueue(() => this.pushSensorAdded(sensor));
      } else {
        this.emitSensorRemoved(sensor);
        this.enqueue(() => this.pushSensorRemoved(sensor.id));
      }
    }

    this.safePublish(this.namespaces.sensorSubject, {
      type: 'sensor:assignment:changed',
      data: { cameraId: this.cameraController.id, pluginId, sensorType, assigned: enabled },
    });
  }

  public onFrameWorkerStateChanged(oldState: boolean, newState: boolean): void {
    if (!oldState && newState) {
      this.enqueue(() => this.reconcileDetectionPlugins());
    }
    // Stopped: nothing to clean up locally — cascade state lives in the worker;
    // next start pushes fresh state via updateFromDetection flow.
  }

  public async reconcileDetectionPlugins(): Promise<void> {
    const maxRetries = this.frameWorker.isRemoteWorker ? 5 : 1;

    // Worker restart wiped the coordinator — re-push every active sensor.
    // Coordinator dispatches per type internally (detection plugins, PTZ, …).
    for (const data of this.sensors.values()) {
      if (!data.pluginId) continue;
      if (!this.isSensorTypeActivated(data.pluginId, data.type)) continue;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await this.detectionCoordinatorProxy.onSensorAdded(this.toCoordinatorSensorInfo(data));
          break;
        } catch (error) {
          if (attempt < maxRetries) {
            this.cameraController.logger.debug(`Re-sync sensor ${data.id} failed (attempt ${attempt}/${maxRetries}), retrying...`);
            await sleep(2000);
          } else {
            this.cameraController.logger.warn(`Failed to re-sync sensor ${data.id} to coordinator:`, error);
          }
        }
      }
    }

    // After a worker restart the coordinator's cascade state is empty. Walk
    // configured triggers and re-report any that are currently in trigger-state —
    // otherwise a sustained trigger (e.g. Contact sensor that was open during the
    // crash) would stay silently lost until the next toggle.
    for (const ref of this.cameraController.camera.detectionSettings.sensor.triggers) {
      const stored = Array.from(this.sensors.values()).find((s) => s.type === ref.sensorType && s.name === ref.sensorName && s.pluginId === ref.pluginId);
      if (!stored) continue;

      const trigger = SENSOR_TYPE_CONFIG[stored.type]?.cascadeTrigger;
      if (!trigger) continue;

      const currentValue = this.propertyValues.get(`${stored.id}:${trigger.property}`);
      if (currentValue !== trigger.value) continue;

      const triggerType = SENSOR_TYPE_CONFIG[stored.type].assignmentKey;
      try {
        await this.detectionCoordinatorProxy.reportSensorTrigger(stored.id, triggerType, 'activate', trigger.sustained, this.context.sensorTimeout());
      } catch (error) {
        this.cameraController.logger.warn(`Failed to re-sync cascade trigger for sensor ${stored.id}:`, error);
      }
    }
  }

  public getSensor(sensorId: string, options: { activatedOnly?: boolean } = { activatedOnly: false }): ServerSensor | undefined {
    const data = this.sensors.get(sensorId);
    if (!data) return undefined;
    if (options.activatedOnly && !this.isSensorTypeActivated(data.pluginId, data.type)) return undefined;
    return new ServerSensor(data, this.context);
  }

  public getSensorByTypeInternal(sensorType: SensorType, options: { activatedOnly?: boolean } = { activatedOnly: true }): ServerSensor | undefined {
    const data = Array.from(this.sensors.values()).find((s) => s.type === sensorType && (!options.activatedOnly || this.isSensorTypeActivated(s.pluginId, s.type)));
    return data ? new ServerSensor(data, this.context) : undefined;
  }

  public getAllSensors(options: { activatedOnly?: boolean } = { activatedOnly: true }): ServerSensor[] {
    return Array.from(this.sensors.values())
      .filter((s) => !options.activatedOnly || this.isSensorTypeActivated(s.pluginId, s.type))
      .map((s) => new ServerSensor(s, this.context));
  }

  public getSensorsByType(sensorType: SensorType): ServerSensor[] {
    return this.getAllSensors().filter((s) => s.type === sensorType);
  }

  public getSensorOwner(sensorId: string): string | undefined {
    return this.sensorOwners.get(sensorId);
  }

  public getProviderForType(sensorType: SensorType): string | undefined {
    return this.sensorProviders.get(sensorType);
  }

  public hasProviderForType(sensorType: SensorType): boolean {
    return this.sensorProviders.has(sensorType);
  }

  public getPluginSensorRpc(pluginId: string, sensorId: string): Promisify<SensorLike> {
    return this.context.createPluginSensorRpc(pluginId, sensorId);
  }

  @RPCMethod
  public updatePropertyValues(sensorId: string, properties: Record<string, unknown>): void {
    this.getSensor(sensorId)?.applyPropertyWrites(properties);
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
    return this.getSensor(sensorId)?.getState();
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
    return this.getAllSensors()
      .filter((s) => this.canPluginAccessSensor(s.data, pluginId))
      .map((s) => s.data);
  }

  @RPCMethod
  public getSensorRpc(sensorId: string, pluginId?: string): StoredSensorData | undefined {
    const sensor = this.getSensor(sensorId, { activatedOnly: true });
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

  @RPCMethod
  public updateCapabilities(sensorId: string, capabilities: string[]): void {
    const sensor = this.getSensor(sensorId);
    if (!sensor) return;
    sensor.applyCapabilityUpdate(capabilities);
    this.enqueue(() => this.pushSensorCapabilities(sensorId, [...new Set(capabilities)]));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const op = this.operationQueue.then(fn, fn);
    this.operationQueue = op.then(
      () => {},
      () => {},
    );
    return op;
  }

  private toCoordinatorSensorInfo(data: StoredSensorData): CoordinatorSensorInfo {
    return {
      pluginId: data.pluginId,
      sensorId: data.id,
      sensorType: data.type,
      capabilities: [...data.capabilities],
      requiresFrames: data.requiresFrames ?? false,
      modelSpec: data.modelSpec,
    };
  }

  private async pushSensorAdded(data: StoredSensorData): Promise<void> {
    if (this.frameWorker.status !== PLUGIN_STATUS.STARTED) return;
    if (!data.pluginId) return;
    try {
      await this.detectionCoordinatorProxy.onSensorAdded(this.toCoordinatorSensorInfo(data));
    } catch (error) {
      this.cameraController.logger.warn(`Failed to push sensor ${data.id} to coordinator:`, error);
    }
  }

  private async pushSensorRemoved(sensorId: string): Promise<void> {
    if (this.frameWorker.status !== PLUGIN_STATUS.STARTED) return;
    try {
      await this.detectionCoordinatorProxy.onSensorRemoved(sensorId);
    } catch (error) {
      this.cameraController.logger.warn(`Failed to push sensor removal ${sensorId} to coordinator:`, error);
    }
  }

  private async pushSensorCapabilities(sensorId: string, capabilities: string[]): Promise<void> {
    if (this.frameWorker.status !== PLUGIN_STATUS.STARTED) return;
    try {
      await this.detectionCoordinatorProxy.onSensorCapabilitiesChanged(sensorId, capabilities);
    } catch (error) {
      this.cameraController.logger.warn(`Failed to push capabilities for ${sensorId} to coordinator:`, error);
    }
  }

  private isSensorTypeActivated(pluginId: string | undefined, sensorType: SensorType): boolean {
    if (!pluginId) return false;
    const assignment = this.cameraController.camera.assignments[sensorType as keyof PluginAssignments];
    if (Array.isArray(assignment)) return assignment.some((p) => p.id === pluginId);
    return assignment?.id === pluginId;
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

  private handleSensorTriggersChanged(newTriggers: SensorTriggerRef[]): void {
    const triggerKeys = new Set(newTriggers.map((ref) => `${ref.sensorType}:${ref.sensorName}:${ref.pluginId}`));
    const activeSensorIds: string[] = [];
    for (const sensor of this.sensors.values()) {
      if (triggerKeys.has(`${sensor.type}:${sensor.name}:${sensor.pluginId}`)) activeSensorIds.push(sensor.id);
    }

    if (this.frameWorker.status !== PLUGIN_STATUS.STARTED) return;
    this.detectionCoordinatorProxy.reconcileSensorTriggers(activeSensorIds).catch((error: unknown) => {
      this.cameraController.logger.warn('Failed to reconcile sensor triggers:', error);
    });
  }

  private emitSensorAdded(data: StoredSensorData, state?: SensorRefreshedState): void {
    const event: SensorAddedEvent = {
      cameraId: this.cameraController.id,
      sensor: data,
      state: state ?? { type: data.type, properties: data.properties, capabilities: data.capabilities },
    };

    this.cameraController.updateSensorState(data.id, event.state.type, 'added');
    this.safePublish(this.namespaces.sensorSubject, { type: 'sensor:added', data: event });

    this.context.emitBus('sensor:added', {
      cameraId: this.cameraController.id,
      sensorId: data.id,
      sensorStableId: data.stableId,
      sensorType: String(event.state.type),
      sensorName: data.name,
    });
  }

  private emitSensorRemoved(sensor: StoredSensorData): void {
    const event: SensorRemovedEvent = { cameraId: this.cameraController.id, sensorId: sensor.id, sensorType: sensor.type };

    this.safePublish(this.namespaces.sensorSubject, { type: 'sensor:removed', data: event });

    this.context.emitBus('sensor:removed', {
      cameraId: this.cameraController.id,
      sensorId: sensor.id,
      sensorStableId: sensor.stableId,
      sensorType: String(sensor.type),
      sensorName: sensor.name,
    });
  }

  private safePublish<T>(subject: string, data: T): void {
    if (!this.proxy.isConnected) return;
    this.proxy.publish(subject, data).catch(() => {});
  }
}
