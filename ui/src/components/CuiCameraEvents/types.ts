import type { RecordedEvent, RecordedSegment } from '@camera.ui/nvr';
import type { DBCamera, EventTypesByCamera } from '@shared/types';

export interface CuiCameraEventsProps {
  cameras?: DBCamera[];
  hiddenTypes?: EventTypesByCamera;
  shownTypes?: EventTypesByCamera;
  pending?: boolean;
}

export type EventType = 'motion' | 'person' | 'face' | 'vehicle' | 'animal' | 'audio' | 'license_plate' | (string & {});

export interface CameraEventProps {
  event: RecordedEvent;
  segIndex?: number;
  segment?: RecordedSegment;
  live?: boolean;
  cameraName?: string;
  camera?: DBCamera;
  clickDisabled?: boolean;
}
