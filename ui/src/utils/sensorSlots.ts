import { SensorType } from '@camera.ui/sdk';

import { DETECTION_SENSOR_TYPES, getAssignmentKey, VIRTUAL_SENSOR_OWNER_ID } from '@shared/types';

import type { AssignedPlugin, PluginAssignments } from '@camera.ui/sdk';

export interface SlotSensor {
  type: SensorType;
  pluginId: string;
  boundCameraId?: string;
}

export interface SlotCamera {
  _id: string;
  pluginInfo?: { id: string };
  assignments?: PluginAssignments;
}

export function sensorProvidedForCamera(sensor: SlotSensor, camera: SlotCamera | undefined): boolean {
  if (!sensor.boundCameraId || sensor.pluginId === VIRTUAL_SENSOR_OWNER_ID) return true;
  if (!camera || camera._id !== sensor.boundCameraId) return true;
  if (!DETECTION_SENSOR_TYPES.has(sensor.type)) {
    if (sensor.pluginId === camera.pluginInfo?.id) return true;
    if (holdsSlot(camera.assignments?.cameraController, sensor.pluginId)) return true;
  }
  const key = getAssignmentKey(sensor.type) as keyof PluginAssignments;
  if (holdsSlot(camera.assignments?.[key], sensor.pluginId)) return true;
  return sensor.type === SensorType.Object && holdsSlot(camera.assignments?.objectAssist, sensor.pluginId);
}

function holdsSlot(assignment: AssignedPlugin | AssignedPlugin[] | undefined, pluginId: string): boolean {
  return Array.isArray(assignment) ? assignment.some((plugin) => plugin.id === pluginId) : assignment?.id === pluginId;
}
