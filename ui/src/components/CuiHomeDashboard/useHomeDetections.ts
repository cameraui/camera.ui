import { getPrimaryType, useDetectionEvents } from '@camera.ui/nvr';

import type { DBCamera } from '@shared/types';
import type { HomeDetection } from './types.js';

const PAGE_SIZE = 20;

export function useHomeDetections(cameras: () => DBCamera[]) {
  const cameraIds = computed(() => cameras().map((camera) => camera._id));

  const { events } = useDetectionEvents({ availableCameraIds: cameraIds, realtime: true, pageSize: PAGE_SIZE, filter: { hasDetections: true } });

  const latest = computed(() => {
    const out = new Map<string, HomeDetection>();
    for (const event of events.value) {
      const active = event.state === 'active';
      const known = out.get(event.cameraId);
      if (known && (known.active || (!active && known.time >= event.lastUpdate))) continue;
      out.set(event.cameraId, { type: getPrimaryType(event), time: event.lastUpdate, active });
    }
    return out;
  });

  return { latest };
}
