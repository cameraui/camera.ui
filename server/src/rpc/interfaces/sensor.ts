import type { Camera, ModelSpec, SensorType } from '@camera.ui/sdk';
import type { PropertyChangedEvent, SensorJSON } from '@camera.ui/sdk/internal';

export interface StoredSensorData {
  id: string;
  type: SensorType;
  name: string;
  displayName: string;
  pluginId: string;
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

export interface SensorControllerInterface {
  registerSensor(sensor: SensorJSON, pluginId: string): boolean;
  unregisterSensor(sensorId: string): void;
  updatePropertyValues(sensorId: string, properties: Record<string, unknown>): void;
  updateCapabilities(sensorId: string, capabilities: string[]): void;
  getPropertyValue(sensorId: string, property: string): unknown;
  getAllPropertyValues(sensorId: string): Record<string, unknown>;
  getSensorState(sensorId: string): SensorRefreshedState;
  getSensorStates(): Record<string, SensorRefreshedState>;
  getSensors(pluginId?: string): StoredSensorData[];
  getSensor(sensorId: string, pluginId?: string): StoredSensorData | undefined;
  getSensorByType(sensorType: SensorType, pluginId?: string): StoredSensorData | undefined;
  setDisplayName(sensorId: string, displayName: string): void;
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
  cameraId: string;
  sensor: StoredSensorData;
  state: SensorRefreshedState;
}

export interface SensorRemovedEvent {
  cameraId: string;
  sensorId: string;
  sensorType: SensorType;
}

export interface SensorCapabilitiesChangedEvent {
  cameraId: string;
  sensorId: string;
  capabilities: string[];
}

export interface SensorDisplayNameChangedEvent {
  cameraId: string;
  sensorId: string;
  displayName: string;
}

export interface SensorAssignmentChangedEvent {
  cameraId: string;
  pluginId: string;
  sensorType: SensorType;
  assigned: boolean;
}

export interface SensorEventMessage {
  type: 'property:changed' | 'sensor:added' | 'sensor:removed' | 'sensor:displayName:changed' | 'sensor:capabilities:changed' | 'sensor:assignment:changed';
  data: PropertyChangedEvent | SensorAddedEvent | SensorRemovedEvent | SensorDisplayNameChangedEvent | SensorCapabilitiesChangedEvent | SensorAssignmentChangedEvent;
}

export interface CameraEventMessage {
  type: 'removed' | 'updated' | 'cameraState' | 'frameWorkerState';
  data?: Camera | boolean;
}
