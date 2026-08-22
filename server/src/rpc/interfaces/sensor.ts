import type { Camera, ModelSpec, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent, SensorJSON } from '@camera.ui/sdk/internal';

export interface StoredSensorData {
  id: string;
  type: SensorType;
  name: string;
  displayName: string;
  nativeId?: string;
  pluginId: string;
  assignedCameraIds: string[];
  boundCameraId?: string;
  exposed: boolean;
  origin?: string;
  connected: boolean;
  properties: Record<string, unknown>;
  capabilities: string[];
  requiresFrames?: boolean;
  modelSpec?: ModelSpec;
}

export interface SensorRefreshedState {
  type: SensorType;
  properties: Record<string, unknown>;
  capabilities: string[];
  displayName?: string;
}

export interface SensorRegistration {
  id: string;
  assignedCameraIds: string[];
  active: boolean;
}

export interface RegisterSensorOptions {
  assignCameraId?: string;
}

export interface SensorHistoryEntry {
  sensorId: string;
  property: string;
  value: string | number | boolean | null;
  timestamp: number;
}

export interface SensorRegistryInterface {
  resolveSensor(sensor: SensorJSON, pluginId: string, options?: RegisterSensorOptions): string;
  registerSensor(sensor: SensorJSON, pluginId: string, options?: RegisterSensorOptions): SensorRegistration;
  unregisterSensor(sensorId: string): void;
  updatePropertyValues(sensorId: string, properties: Record<string, unknown>): void;
  updateCapabilities(sensorId: string, capabilities: string[]): void;
  updateModelSpec(sensorId: string, modelSpec: ModelSpec): void;
  getPropertyValue(sensorId: string, property: string): unknown;
  getAllPropertyValues(sensorId: string): Record<string, unknown>;
  getSensorState(sensorId: string): SensorRefreshedState | undefined;
  getSensorStates(): Record<string, SensorRefreshedState>;
  getSensors(pluginId?: string): StoredSensorData[];
  getSensorRpc(sensorId: string, pluginId?: string): StoredSensorData | undefined;
  setDisplayName(sensorId: string, displayName: string): void;
  getSensorHistory(sensorIds: string[], from: number, to: number): SensorHistoryEntry[];
}

export interface SensorWriteMessage {
  sensorId: string;
  properties: Record<string, unknown>;
  timestamp: number;
}

export interface SensorEventHandlerInterface {
  onPropertyChanged: (event: PropertyChangedEvent) => void;
}

export interface SensorAddedEvent {
  sensor: StoredSensorData;
  state: SensorRefreshedState;
}

export interface SensorDeletedEvent {
  sensorId: string;
  sensorType: SensorType;
}

export interface SensorConnectedChangedEvent {
  sensorId: string;
  sensorType: SensorType;
  connected: boolean;
}

export interface SensorCapabilitiesChangedEvent {
  sensorId: string;
  capabilities: string[];
}

export interface SensorDisplayNameChangedEvent {
  sensorId: string;
  displayName: string;
}

export interface SensorExposedChangedEvent {
  sensorId: string;
  sensorType: SensorType;
  exposed: boolean;
  origin?: string;
}

export interface SensorAssignmentChangedEvent {
  sensorId: string;
  sensorType: SensorType;
  cameraId: string;
  assigned: boolean;
}

export interface SensorEventMessage {
  type:
    | 'property:changed'
    | 'sensor:added'
    | 'sensor:deleted'
    | 'sensor:connected:changed'
    | 'sensor:displayName:changed'
    | 'sensor:capabilities:changed'
    | 'sensor:assignment:changed'
    | 'sensor:exposed:changed';
  data:
    | PropertyChangedEvent
    | SensorAddedEvent
    | SensorDeletedEvent
    | SensorConnectedChangedEvent
    | SensorDisplayNameChangedEvent
    | SensorCapabilitiesChangedEvent
    | SensorAssignmentChangedEvent
    | SensorExposedChangedEvent;
}

export interface CameraEventMessage {
  type: 'removed' | 'updated' | 'cameraState' | 'frameWorkerState';
  data?: Camera | boolean;
}
