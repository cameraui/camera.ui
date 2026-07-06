import type { EventThumbnails } from '@camera.ui/nvr';
import type { DetectionEvent } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';

export interface CuiCameraEventsProps {
  cameras?: DBCamera[];
}

export type EventType = 'motion' | 'person' | 'face' | 'vehicle' | 'animal' | 'package' | 'audio' | 'license_plate' | (string & {});

export interface CameraEventProps {
  event: DetectionEvent;
  cameraName?: string;
  camera?: DBCamera;
  loadThumbnails: (eventId: string, startMs: number) => Promise<EventThumbnails | null>;
  clickDisabled?: boolean;
}

export type AiBadgePosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';

export interface AiBadgeProps {
  position?: AiBadgePosition;
}

type NativeType = null | undefined | number | string | boolean | symbol | ((...args: any[]) => any);
type InferDefault<P, T> = ((props: P) => T & {}) | (T extends NativeType ? T : never);
type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>;
};

export const AI_BADGE_DEFAULTS: InferDefaults<AiBadgeProps> = {
  position: 'top-right',
};
