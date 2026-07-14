import type { Camera, ProbeConfig, ProbeStream, SnapshotInterface, StreamingInterface } from '@camera.ui/sdk';
import type { SensorJSON } from '@camera.ui/sdk/internal';
import type { PartialReturnType } from '../../types.js';
import type { SensorRefreshedState } from './sensor.js';

export interface DeviceManagerInterface {
  getCamera(cameraNameOrId: string, pluginId: string): Promise<Camera | undefined>;
}

export interface DeviceManagerProxyEvents {
  cameraAdded: { camera: Camera };
  cameraReleased: { cameraId: string };
}

export interface DeviceManagerProxyEventCallbacks {
  cameraAdded: (camera: Camera) => void;
  cameraReleased: (cameraId: string) => void;
}

export interface DeviceManagerProxyGenericEvent<K extends keyof DeviceManagerProxyEvents> {
  type: K;
  data: DeviceManagerProxyEvents[K];
}

export interface DeviceManagerListenerMessagePayload {
  type: keyof DeviceManagerProxyEventCallbacks;
  data: DeviceManagerProxyEvents[keyof DeviceManagerProxyEvents];
}

export type CameraDeviceImplementation = PartialReturnType<StreamingInterface> & PartialReturnType<SnapshotInterface>;

export interface RefreshedStates {
  camera: Camera;
  cameraState: boolean;
  frameWorkerState: boolean;
  sensorStates: Record<string, SensorRefreshedState>;
}

export interface SnapshotUpdatedEvent {
  sourceId: string;
  snapshot: ArrayBuffer;
}

export interface SnapshotWithMeta {
  data: ArrayBuffer;
  ageMs: number;
}

export type CameraDeviceListenerMessagePayload =
  | { type: 'removed' }
  | { type: 'updated'; data: Camera }
  | { type: 'cameraState'; data: boolean }
  | { type: 'frameWorkerState'; data: boolean }
  | { type: 'snapshot:updated'; data: SnapshotUpdatedEvent };

export interface CameraDeviceInterface extends CameraDeviceImplementation {
  refreshStates(): Promise<RefreshedStates>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  snapshot(sourceId: string, forceNew?: boolean): Promise<ArrayBuffer | undefined>;
  snapshotWithMeta(sourceId: string, forceNew?: boolean): Promise<SnapshotWithMeta | undefined>;
  probeStream(sourceId: string, probeConfig?: ProbeConfig, refresh?: boolean): Promise<ProbeStream | undefined>;
  getStreamStatus(sourceId: string): Promise<string>;
  registerSensor(sensor: SensorJSON, pluginId: string): Promise<boolean>;
  unregisterSensor(sensorId: string): void;
}
