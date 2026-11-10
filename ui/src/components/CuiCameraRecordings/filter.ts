import type { DBCameraRecordingsFilter } from '@shared/types';
import type { CameraRecordingsFilterState } from './types.js';

export function cameraFilterSet(f: CameraRecordingsFilterState): boolean {
  return f.search !== '' || !!f.day || f.minConfidence > 0 || [f.types, f.sensorEvents, f.audioLabels, f.vehicleColors, f.vehicleTypes].some((list) => list.length > 0);
}

export function contentPicked({ types, sensorEvents, audioLabels }: CameraRecordingsFilterState): boolean {
  return types.length > 0 || sensorEvents.length > 0 || audioLabels.length > 0;
}

export function savedSelection({ search, day, ...selection }: CameraRecordingsFilterState): DBCameraRecordingsFilter {
  return selection;
}
