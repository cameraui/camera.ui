import type { EventThumbnails, RecordedEvent, RecordedSegment } from '@camera.ui/nvr';
import type { DBCamera, HiddenEventTypes } from '@shared/types';

export interface CuiCameraEventsProps {
  cameras?: DBCamera[];
  hiddenTypes?: HiddenEventTypes;
}

export type EventType = 'motion' | 'person' | 'face' | 'vehicle' | 'animal' | 'audio' | 'license_plate' | (string & {});

export interface CameraEventProps {
  event: RecordedEvent;
  segIndex?: number;
  segment?: RecordedSegment;
  live?: boolean;
  cameraName?: string;
  camera?: DBCamera;
  loadThumbnails: (eventId: string, startMs: number) => Promise<EventThumbnails | null>;
  clickDisabled?: boolean;
}
