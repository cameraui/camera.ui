import { EventEmitter } from 'node:events';

import { provide, tryInject } from './container.js';

import type { SensorPropertySpec, SensorSourceState } from '@camera.ui/sdk';
import type { SensorDeviceState } from '@camera.ui/sdk/internal';

export type SystemEvent = 'system:started' | 'system:shutdown' | 'system:notification' | 'camera:added' | 'camera:removed';

export type PluginEvent = 'plugin:started' | 'plugin:stopped' | 'plugin:error' | 'plugin:crashed' | 'plugin:notification';

export type CameraEvent =
  'camera:connected' | 'camera:disconnected' | 'camera:frameworker:started' | 'camera:frameworker:stopped' | 'camera:property:changed' | 'camera:snapshot:updated';

export type SensorEvent =
  | 'sensor:property:changed'
  | 'sensor:added'
  | 'sensor:deleted'
  | 'sensor:connected:changed'
  | 'sensor:displayName:changed'
  | 'sensor:capabilities:changed'
  | 'sensor:exposed:changed'
  | 'sensor:assignment:changed'
  | 'sensor:device:changed'
  | 'sensor:specs:changed'
  | 'sensor:source:changed'
  | 'sensor:room:changed';

export type InternalEvent = SystemEvent | PluginEvent | CameraEvent | SensorEvent;

export interface SystemEventPayload {
  cameraId?: string;
  cameraName?: string;
}

export interface SystemNotificationPayload {
  typeId: string;
  title: string;
  body?: string;
  severity?: string;
}

export interface PluginEventPayload {
  pluginName: string;
  pluginId: string;
  status: string;
  displayName?: string;
}

export interface PluginNotificationPayload {
  pluginId: string;
  pluginName: string;
  title: string;
  subtitle?: string;
  body?: string;
  severity: string;
  tag?: string;
  [key: string]: string | undefined;
}

export interface CameraEventPayload {
  cameraId: string;
  cameraName: string;
  property?: string;
}

export interface SensorPropertyChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  property: string;
  value: unknown;
  previousValue: unknown;
}

export interface SensorLifecyclePayload {
  sensorId: string;
  sensorType: string;
  sensorName?: string;
  assignedCameraIds: string[];
  connected?: boolean;
  exposed?: boolean;
  sourceState?: SensorSourceState;
}

export interface SensorDisplayNameChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  displayName: string;
}

export interface SensorDeviceChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  deviceState: SensorDeviceState;
}

export interface SensorCapabilitiesChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  capabilities: string[];
}

export interface SensorSpecsChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  propertySpecs: Record<string, SensorPropertySpec>;
}

export type InternalEventPayload =
  | SystemEventPayload
  | SystemNotificationPayload
  | PluginEventPayload
  | PluginNotificationPayload
  | CameraEventPayload
  | SensorPropertyChangedPayload
  | SensorLifecyclePayload
  | SensorDisplayNameChangedPayload
  | SensorDeviceChangedPayload
  | SensorCapabilitiesChangedPayload
  | SensorSpecsChangedPayload;

export class InternalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    provide('internalBus', this);
  }

  public emitEvent(event: InternalEvent, payload: InternalEventPayload): boolean {
    return this.emit(event, payload);
  }

  public onEvent(event: InternalEvent, handler: (payload: InternalEventPayload) => void): void {
    this.on(event, handler);
  }

  public offEvent(event: InternalEvent, handler: (payload: InternalEventPayload) => void): void {
    this.off(event, handler);
  }
}

export function emitInternalEvent(event: InternalEvent, payload: InternalEventPayload): void {
  try {
    tryInject('internalBus')?.emitEvent(event, payload);
  } catch {
    // a throwing listener must not break the emitter
  }
}
