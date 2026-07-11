import { EventEmitter } from 'node:events';
import { container } from 'tsyringe';

export type SystemEvent = 'system:started' | 'system:shutdown' | 'system:notification' | 'camera:added' | 'camera:removed';

export type PluginEvent = 'plugin:started' | 'plugin:stopped' | 'plugin:error' | 'plugin:crashed';

export type CameraEvent = 'camera:connected' | 'camera:disconnected' | 'camera:frameworker:started' | 'camera:frameworker:stopped' | 'camera:property:changed';

export type SensorEvent = 'sensor:property:changed' | 'sensor:added' | 'sensor:removed';

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

export interface CameraEventPayload {
  cameraId: string;
  cameraName: string;
  property?: string;
}

export interface SensorPropertyChangedPayload {
  cameraId: string;
  sensorId: string;
  sensorStableId: string;
  sensorType: string;
  property: string;
  value: unknown;
  previousValue: unknown;
}

export interface SensorLifecyclePayload {
  cameraId: string;
  sensorId: string;
  sensorStableId: string;
  sensorType: string;
  sensorName?: string;
}

export type InternalEventPayload =
  SystemEventPayload | SystemNotificationPayload | PluginEventPayload | CameraEventPayload | SensorPropertyChangedPayload | SensorLifecyclePayload;

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
