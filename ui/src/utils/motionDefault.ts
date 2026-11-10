import { EVENT_CATEGORIES } from '@camera.ui/nvr';

import type { DBCamera, EventTypesByCamera } from '@shared/types';

export function showsMotionByDefault(camera: DBCamera): boolean {
  return !camera.assignments?.object;
}

export function defaultMotionTypes(cameras: readonly DBCamera[]): EventTypesByCamera | undefined {
  const motionCameras = cameras.filter(showsMotionByDefault);
  if (!motionCameras.length) return undefined;
  return Object.fromEntries(motionCameras.map((camera) => [camera._id, [EVENT_CATEGORIES.motion]]));
}
