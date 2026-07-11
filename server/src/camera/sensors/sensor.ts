import { isEqual } from '@camera.ui/common/utils';
import { Disposable, Observable } from '@camera.ui/sdk';

import { DETECTION_SENSOR_TYPES, PROPERTY_CAPABILITY_MAP, SENSOR_TYPE_CONFIG } from './types.js';

import type { ModelSpec, SensorLike, SensorPropertyType, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';
import type { SensorCapabilitiesChangedEvent, SensorRefreshedState, StoredSensorData } from '../../rpc/interfaces/sensor.js';
import type { SensorContext } from './controller.js';

export class ServerSensor implements SensorLike {
  public readonly id: string;
  public readonly type: SensorType;
  public readonly name: string;
  public readonly pluginId?: string;

  // Server-side: empty Observables — changes broadcast via RPC, consumers subscribe via SensorProxy.
  public readonly onPropertyChanged = new Observable<{ property: string; value: unknown; timestamp: number }>(() => new Disposable(() => {}));
  public readonly onCapabilitiesChanged = new Observable<string[]>(() => new Disposable(() => {}));

  private readonly ctx: SensorContext;

  constructor(
    public readonly data: StoredSensorData,
    context: SensorContext,
  ) {
    this.id = data.id;
    this.type = data.type;
    this.name = data.name;
    this.pluginId = data.pluginId;
    this.ctx = context;
  }

  public get displayName(): string {
    return this.data.displayName;
  }

  public get capabilities(): string[] {
    return this.data.capabilities;
  }

  public setDisplayName(value: string): void {
    this.data.displayName = value;
  }

  public getValue(property: string): unknown {
    return this.ctx.propertyValues.get(`${this.id}:${property}`);
  }

  public getValues(): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    const prefix = `${this.id}:`;
    for (const [key, value] of this.ctx.propertyValues) {
      if (key.startsWith(prefix)) result[key.substring(prefix.length)] = value;
    }
    return result;
  }

  public hasCapability(capability: string): boolean {
    return this.data.capabilities.includes(capability);
  }

  public getState(): SensorRefreshedState {
    return {
      type: this.type,
      properties: this.getValues(),
      capabilities: this.capabilities,
      displayName: this.displayName,
    };
  }

  // Forwards to the owning plugin via RPC — same path as UI/SensorProxy. For
  // Control sensors (Light, PTZ, Switch, Siren, Lock, ...) this triggers the
  // plugin-side hardware action; state mirrors back via the property-change broadcast.
  public async updateValue(property: string, value: unknown): Promise<void> {
    if (!this.pluginId) {
      this.applyPropertyWrites({ [property]: value });
      return;
    }

    try {
      const rpc = this.ctx.createPluginSensorRpc(this.pluginId, this.id);
      await rpc.updateValue(property, value);
    } catch (error) {
      this.ctx.logger.warn(`Failed to updateValue on plugin sensor ${this.pluginId}/${this.id} (${property}):`, error);
    }
  }

  public async setDisplayNameAsync(displayName: string): Promise<void> {
    if (!this.pluginId) throw new Error(`Cannot persist display name for sensor ${this.id} without owner plugin`);

    // Persist first — if storage write fails, nothing changes.
    await this.ctx.sensorStorageProxy(this.pluginId, this.id).setInternalValue('_displayName', displayName);
    this.data.displayName = displayName;

    this.ctx.publishSensorEvent(this.id, {
      type: 'sensor:displayName:changed',
      data: { cameraId: this.ctx.cameraId, sensorId: this.id, displayName },
    });
  }

  public applyCapabilityUpdate(capabilities: string[]): void {
    const unique = [...new Set(capabilities)];
    this.data.capabilities = unique;

    const event: SensorCapabilitiesChangedEvent = {
      cameraId: this.ctx.cameraId,
      sensorId: this.id,
      capabilities: unique,
    };

    this.ctx.publishSensorEvent(this.id, { type: 'sensor:capabilities:changed', data: event });
  }

  // Batch property write for non-detection sensors. Detection writes
  // (Motion/Audio/Object/Face/LPD/Classifier) go direct through the
  // DetectionCoordinator — drop with a warning if they land here.
  public applyPropertyWrites(properties: Record<string, unknown>): void {
    if (DETECTION_SENSOR_TYPES.has(this.type)) {
      this.ctx.logger.warn(`Detection sensor "${this.name}" (${this.type}) wrote via applyPropertyWrites — expected direct route to DetectionCoordinator. Drop.`);
      return;
    }

    this.maybeReportCascadeTrigger(properties);

    for (const [property, value] of Object.entries(properties)) {
      this.validateCapability(property);

      // modelSpec is metadata, not a sensor property
      if (property === 'modelSpec') {
        this.data.modelSpec = value as ModelSpec | undefined;
        continue;
      }

      this.writeProperty(property, value);
    }
  }

  // Called by the controller when a coordinator-published write batch arrives
  // on the NATS subscription — mirror update for detection-owned state.
  public applyWriteBatch(properties: Record<string, unknown>): void {
    for (const [property, value] of Object.entries(properties)) {
      this.writeProperty(property, value);
    }
  }

  private writeProperty(property: string, value: unknown): void {
    const storeKey = `${this.id}:${property}`;
    const previousValue = this.ctx.propertyValues.get(storeKey);
    if (isEqual(previousValue, value, true)) return;

    this.ctx.propertyValues.set(storeKey, value);
    this.data.properties[property] = value;

    const event: PropertyChangedEvent = {
      cameraId: this.ctx.cameraId,
      sensorId: this.id,
      sensorType: this.type,
      property: property as SensorPropertyType,
      value,
      previousValue,
      timestamp: Date.now(),
    };

    this.ctx.publishSensorEvent(this.id, { type: 'property:changed', data: event });
    this.ctx.emitBus('sensor:property:changed', {
      cameraId: this.ctx.cameraId,
      sensorId: this.id,
      sensorStableId: this.data.stableId,
      sensorType: String(this.type),
      property: String(property),
      value,
      previousValue,
    });
  }

  private maybeReportCascadeTrigger(properties: Record<string, unknown>): void {
    const isTrigger = this.ctx.sensorTriggers().some((ref) => ref.sensorType === this.type && ref.sensorName === this.name && ref.pluginId === this.pluginId);
    if (!isTrigger) return;

    const config = SENSOR_TYPE_CONFIG[this.type]?.cascadeTrigger;
    if (!config || !(config.property in properties)) return;

    const triggerType = SENSOR_TYPE_CONFIG[this.type].assignmentKey;
    const value = properties[config.property];
    const timeout = this.ctx.sensorTimeout();

    if (value === config.value) {
      this.ctx.detectionCoordinator
        .reportSensorTrigger(this.id, triggerType, 'activate', config.sustained, timeout)
        .catch((error: unknown) => this.ctx.logger.warn('Failed to report sensor trigger activate:', error));
    } else if (config.sustained) {
      this.ctx.detectionCoordinator
        .reportSensorTrigger(this.id, triggerType, 'deactivate', true, timeout)
        .catch((error: unknown) => this.ctx.logger.warn('Failed to report sensor trigger deactivate:', error));
    }
  }

  private validateCapability(property: string): void {
    const map = PROPERTY_CAPABILITY_MAP[this.type];
    if (!map) return;

    const required = map[property];
    if (!required) return;

    if (!this.data.capabilities.includes(required)) {
      this.ctx.logger.warn(
        `Sensor "${this.name}" (${this.type}): Property "${property}" set without declaring capability "${required}". Consumers may ignore this value.`,
      );
    }
  }
}
