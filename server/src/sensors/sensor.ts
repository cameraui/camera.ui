import { isEqual } from '@camera.ui/common/utils';
import { Disposable, Observable, SensorType } from '@camera.ui/sdk';
import { checkPropertyWrite, isSourceReachable } from '@camera.ui/sdk/internal';

import { DETECTION_SENSOR_TYPES, PROPERTY_CAPABILITY_MAP, SENSOR_TYPE_CONFIG, sensorPropertySpec, VIRTUAL_SENSOR_OWNER_ID } from './types.js';
import { writeVirtualSensor } from './virtual.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify } from '@camera.ui/rpc';
import type { ModelSpec, SensorDevice, SensorLike, SensorPropertySpec, SensorPropertyType, SensorSourceState, SensorTriggerSettings } from '@camera.ui/sdk';
import type { PropertyChangedEvent } from '@camera.ui/sdk/internal';
import type { InternalEvent, InternalEventPayload } from '../internal-bus.js';
import type { DetectionCoordinatorInterface } from '../rpc/interfaces/detection.js';
import type { SensorCapabilitiesChangedEvent, SensorRefreshedState, StoredSensorData } from '../rpc/interfaces/sensor.js';

export interface SensorContext {
  readonly logger: Logger;
  readonly propertyValues: Map<string, unknown>;
  readonly assignedCameraIds: (sensorId: string) => string[];
  readonly cameraDetectionSettings: (cameraId: string) => SensorTriggerSettings | undefined;
  readonly getCoordinator: (cameraId: string) => Promisify<DetectionCoordinatorInterface>;
  readonly publishSensorEvent: (sensorId: string, event: { type: string; data: unknown }) => void;
  readonly emitBus: <T extends InternalEventPayload>(event: InternalEvent, payload: T) => void;
  readonly createPluginSensorRpc: (pluginId: string, sensorId: string) => Promisify<SensorLike>;
  readonly persistState: (sensorId: string, delta: Record<string, unknown>) => void;
  readonly appendHistory: (sensorId: string, delta: Record<string, unknown>) => void;
}

export class ServerSensor implements SensorLike {
  public readonly id: string;
  public readonly type: SensorType;
  public readonly name: string;
  public readonly pluginId?: string;

  public readonly onPropertyChanged = new Observable<{ property: string; value: unknown; timestamp: number }>(() => new Disposable(() => {}));
  public readonly onCapabilitiesChanged = new Observable<string[]>(() => new Disposable(() => {}));
  public readonly onConnectedChanged = new Observable<boolean>(() => new Disposable(() => {}));
  public readonly onSourceStateChanged = new Observable<SensorSourceState | undefined>(() => new Disposable(() => {}));
  public readonly onAssignmentChanged = new Observable<readonly string[]>(() => new Disposable(() => {}));
  public readonly onDeviceInfoChanged = new Observable<SensorDevice | undefined>(() => new Disposable(() => {}));
  public readonly onPropertySpecsChanged = new Observable<Readonly<Record<string, SensorPropertySpec>>>(() => new Disposable(() => {}));

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

  public get shortName(): string {
    return this.data.shortName;
  }

  public get deviceInfo(): SensorDevice | undefined {
    return this.data.device;
  }

  public get primary(): boolean {
    return this.data.primary;
  }

  public get capabilities(): string[] {
    return this.data.capabilities;
  }

  public get propertySpecs(): Readonly<Record<string, SensorPropertySpec>> {
    return this.data.propertySpecs;
  }

  public get assignedCameraIds(): string[] {
    return this.ctx.assignedCameraIds(this.id);
  }

  public get assignmentLocked(): boolean {
    return this.data.boundCameraId !== undefined;
  }

  public get connected(): boolean {
    return this.data.connected;
  }

  public get sourceState(): SensorSourceState | undefined {
    return this.data.sourceState;
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
      deviceState: { device: this.deviceInfo, displayName: this.displayName, shortName: this.shortName, primary: this.primary },
      propertySpecs: this.propertySpecs,
    };
  }

  public async updateValue(property: string, value: unknown): Promise<void> {
    if (!isSourceReachable(this.data.sourceState)) throw new Error(`${this.displayName} is not reachable`);
    const spec = sensorPropertySpec(this, property);
    if (spec) value = checkPropertyWrite({ [property]: spec }, property, value);
    // the host mirrors what hardware would report and resets momentary values
    if (this.pluginId === VIRTUAL_SENSOR_OWNER_ID) {
      writeVirtualSensor(this.id, property, value);
      return;
    }
    if (!this.pluginId) {
      this.applyPropertyWrites({ [property]: value });
      return;
    }

    await this.ctx.createPluginSensorRpc(this.pluginId, this.id).updateValue(property, value);
  }

  public applyCapabilityUpdate(capabilities: string[]): void {
    const unique = [...new Set(capabilities)];
    this.data.capabilities = unique;

    const event: SensorCapabilitiesChangedEvent = {
      sensorId: this.id,
      capabilities: unique,
    };

    this.ctx.publishSensorEvent(this.id, { type: 'sensor:capabilities:changed', data: event });

    this.ctx.emitBus('sensor:capabilities:changed', {
      sensorId: this.id,
      sensorType: String(this.type),
      assignedCameraIds: this.assignedCameraIds,
      capabilities: unique,
    });
  }

  public applyPropertyWrites(properties: Record<string, unknown>): void {
    if (DETECTION_SENSOR_TYPES.has(this.type)) {
      this.ctx.logger.warn(`Detection sensor "${this.name}" (${this.type}) wrote via applyPropertyWrites — expected direct route to DetectionCoordinator. Drop.`);
      return;
    }

    this.maybeReportCascadeTrigger(properties);

    const persisted: Record<string, unknown> = {};
    for (const [property, value] of Object.entries(properties)) {
      this.validateCapability(property);

      if (property === 'modelSpec') {
        this.data.modelSpec = value as ModelSpec | undefined;
        continue;
      }

      if (this.writeProperty(property, value)) persisted[property] = value;
    }

    if (Object.keys(persisted).length > 0) {
      this.ctx.persistState(this.id, persisted);
      this.ctx.appendHistory(this.id, persisted);
    }
  }

  public applyWriteBatch(properties: Record<string, unknown>): void {
    const changed: Record<string, unknown> = {};
    for (const [property, value] of Object.entries(properties)) {
      if (this.writeProperty(property, value)) changed[property] = value;
    }

    // recognition trails the detected flip, so grown name lists get rows of their own
    const listEntry: Record<string, unknown> = {};
    for (const property of ['identities', 'plates', 'labels']) {
      const value = changed[property];
      if (Array.isArray(value) && value.length > 0) listEntry[property] = value.join(', ');
    }
    if (Object.keys(listEntry).length > 0) this.ctx.appendHistory(this.id, listEntry);

    if (!('detected' in changed)) return;

    const entry: Record<string, unknown> = { detected: changed.detected };
    if (changed.detected === true && this.type !== SensorType.Motion) {
      const detections = (properties.detections ?? this.getValue('detections')) as { label?: string; attribute?: string; subAttribute?: string }[] | undefined;
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty-string labels must fall through
      const labels = [...new Set((detections ?? []).map((d) => d.subAttribute || d.label || d.attribute).filter((label): label is string => !!label))];
      if (labels.length > 0) entry.labels = labels.join(', ');
    }
    this.ctx.appendHistory(this.id, entry);
  }

  private writeProperty(property: string, value: unknown): boolean {
    const storeKey = `${this.id}:${property}`;
    const previousValue = this.ctx.propertyValues.get(storeKey);
    if (isEqual(previousValue, value, true)) return false;

    this.ctx.propertyValues.set(storeKey, value);
    this.data.properties[property] = value;

    const event: PropertyChangedEvent = {
      sensorId: this.id,
      sensorType: this.type,
      property: property as SensorPropertyType,
      value,
      timestamp: Date.now(),
    };

    this.ctx.publishSensorEvent(this.id, { type: 'property:changed', data: event });
    this.ctx.emitBus('sensor:property:changed', {
      sensorId: this.id,
      sensorType: String(this.type),
      assignedCameraIds: this.assignedCameraIds,
      property: String(property),
      value,
      previousValue,
    });

    return true;
  }

  private maybeReportCascadeTrigger(properties: Record<string, unknown>): void {
    const config = SENSOR_TYPE_CONFIG[this.type]?.cascadeTrigger;
    if (!config || !(config.property in properties)) return;

    const value = properties[config.property];

    for (const cameraId of this.assignedCameraIds) {
      const settings = this.ctx.cameraDetectionSettings(cameraId);
      if (!settings?.triggers.includes(this.id)) continue;

      const coordinator = this.ctx.getCoordinator(cameraId);
      if (config.values.includes(value)) {
        coordinator
          .reportSensorTrigger(this.id, config.triggerType, 'activate', config.sustained, settings.timeout)
          .catch((error: unknown) => this.ctx.logger.warn('Failed to report sensor trigger activate:', error));
      } else if (config.sustained) {
        coordinator
          .reportSensorTrigger(this.id, config.triggerType, 'deactivate', true, settings.timeout)
          .catch((error: unknown) => this.ctx.logger.warn('Failed to report sensor trigger deactivate:', error));
      }
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
