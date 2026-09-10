import { EventEmitter } from 'node:events';
import { container } from 'tsyringe';

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
  | 'sensor:assignment:changed';

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
}

export interface SensorDisplayNameChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  displayName: string;
}

export interface SensorCapabilitiesChangedPayload {
  sensorId: string;
  sensorType: string;
  assignedCameraIds: string[];
  capabilities: string[];
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
  | SensorCapabilitiesChangedPayload;

export class InternalEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    container.registerInstance('internalBus', this);
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
