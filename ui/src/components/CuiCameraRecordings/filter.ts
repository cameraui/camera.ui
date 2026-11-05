import type { CameraRecordingsFilterState } from './types.js';

export function cameraFilterSet(f: CameraRecordingsFilterState): boolean {
  return f.search !== '' || !!f.day || f.minConfidence > 0 || [f.types, f.sensorEvents, f.audioLabels, f.vehicleColors, f.vehicleTypes].some((list) => list.length > 0);
}
