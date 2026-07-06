import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { EventDescription, StreamingRole } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { CardProps } from 'primevue';
import type { HTMLAttributes } from 'vue';

export type VideoModeExtended = VideoStreamingMode | 'loading' | 'reconnecting' | 'error' | 'adapting';

export interface CuiCameraCardModels {
  sourceRole?: StreamingRole;
  activityMode?: CameraActivityMode;
  streamingMode?: VideoStreamingMode;
}

export interface CuiCameraCardEmits {
  (e: 'streamFinishedLoading', state: boolean): void;
  (e: 'expand', expanded: boolean): void;
  (e: 'togglePip'): void;
  (e: 'muteChange', muted: boolean): void;
}

export interface CuiCameraCardProps {
  // Camera Data
  cameraInfo: DBCamera | string;

  // Card Configuration
  backButton?: boolean;
  doubleClickZoom?: boolean;
  expandableCard?: boolean;
  expanded?: boolean;
  flatCard?: boolean;
  resizable?: boolean;
  cardProps?: CardProps;
  routerLink?: string;
  cardClickAction?: 'redirect' | 'expand' | 'none';
  viewTransition?: boolean;
  cardBackgroundColor?: string;

  // Control Configuration
  control?: boolean;
  controlFastForwardButton?: boolean;
  controlFsButton?: boolean;
  controlMicrophoneButton?: boolean;
  controlPipButton?: boolean;
  controlPlayPauseButton?: boolean;
  controlRewindButton?: boolean;
  controlSpeakerButton?: boolean;

  // Subcontrol Configuration
  subcontrol?: boolean;
  subcontrolActivityModeButton?: boolean;
  subcontrolPtzButton?: boolean;
  subcontrolQualityButton?: boolean;
  subcontrolStreamingModeButton?: boolean;

  // Overlay Configuration
  cameraNameOverlay?: boolean;
  liveIndicatorOverlay?: boolean;
  modeOverlay?: boolean;
  detectionIndicatorOverlay?: boolean;
  boundingBoxOverlay?: boolean;
  showShortcuts?: boolean;

  // Toolbar Configuration
  toolbar?: boolean;
  toolbarClass?: HTMLAttributes['class'];
  toolbarDetectionButton?: boolean;
  toolbarPipToggleButton?: boolean;
  toolbarPipToggleActive?: boolean;
  toolbarSettingsButton?: boolean;
  toolbarShareButton?: boolean;
  toolbarShortcutsButton?: boolean;
  toolbarSnapshotButton?: boolean;
  toolbarStyle?: HTMLAttributes['style'];
  toolbarTimelineButton?: boolean;
  toolbarZoneButton?: boolean;
  toolbarDescriptionButton?: boolean;

  eventDescription?: EventDescription;

  // PiP Configuration
  pipSourceRole?: StreamingRole;
  pipToggleButton?: boolean;

  isolatedStream?: boolean;
  nvrController?: any;
}

type NativeType = null | undefined | number | string | boolean | symbol | ((...args: any[]) => any);

type InferDefault<P, T> = ((props: P) => T & {}) | (T extends NativeType ? T : never);

type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>;
};

export const CAMERA_CARD_DEFAULTS: InferDefaults<CuiCameraCardProps> = {
  backButton: false,
  doubleClickZoom: true,
  expandableCard: false,
  flatCard: false,
  resizable: false,
  pipToggleButton: false,
  cardClickAction: 'redirect',
  viewTransition: false,

  cameraNameOverlay: true,
  liveIndicatorOverlay: false,
  detectionIndicatorOverlay: false,
  boundingBoxOverlay: true,
  showShortcuts: false,

  toolbar: true,
  toolbarDetectionButton: true,
  toolbarPipToggleButton: false,
  toolbarPipToggleActive: false,
  toolbarSettingsButton: true,
  toolbarShareButton: true,
  toolbarShortcutsButton: true,
  toolbarSnapshotButton: true,
  toolbarTimelineButton: true,
  toolbarZoneButton: true,
  toolbarDescriptionButton: false,

  control: true,
  controlFastForwardButton: true,
  controlFsButton: true,
  controlMicrophoneButton: true,
  controlPlayPauseButton: true,
  controlPipButton: true,
  controlRewindButton: true,
  controlSpeakerButton: true,

  subcontrol: true,
  subcontrolActivityModeButton: true,
  subcontrolPtzButton: true,
  subcontrolQualityButton: true,
  subcontrolStreamingModeButton: true,
};
