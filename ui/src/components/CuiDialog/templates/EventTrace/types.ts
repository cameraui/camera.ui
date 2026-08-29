import type { RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export interface EventTraceProps {
  event: RecordedEvent;
  camera: DBCamera;
}
