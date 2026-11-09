import type { Camera, CameraConfigInputSettings, ProbeConfig, ProbeStream, SnapshotInterface, StreamingInterface } from '@camera.ui/sdk';
import type { PartialReturnType } from '../../types.js';
import type { SensorRefreshedState } from './sensor.js';

export interface DeviceManagerInterface {
  getCamera(cameraNameOrId: string, pluginId: string): Promise<Camera | undefined>;
  addCameraSource(pluginId: string, cameraId: string, source: CameraConfigInputSettings): Promise<CameraSourceChange>;
  removeCameraSource(pluginId: string, cameraId: string, sourceId: string): Promise<CameraSourceChange>;
}

/** The camera after a plugin added or removed a source, and the ID of an added source. */
export interface CameraSourceChange {
  camera: Camera;
  sourceId?: string;
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
  stateSubject?: boolean;
}

export interface SnapshotUpdatedEvent {
  sourceId: string;
  snapshot: ArrayBuffer;
  fetchedAt: number;
}

export interface SnapshotWithMeta {
  data?: ArrayBuffer;
  ageMs: number;
  fetchedAt?: number;
  notModified?: boolean;
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
  snapshot(sourceId: string, forceNew?: boolean, preferNative?: boolean): Promise<ArrayBuffer | undefined>;
  snapshotWithMeta(sourceId: string, forceNew?: boolean, knownFetchedAt?: number): Promise<SnapshotWithMeta | undefined>;
  probeStream(sourceId: string, probeConfig?: ProbeConfig, refresh?: boolean): Promise<ProbeStream | undefined>;
  getStreamStatus(sourceId: string): Promise<string>;
}
