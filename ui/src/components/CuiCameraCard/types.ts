import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { EventDescription, RecordedEvent } from '@camera.ui/nvr';
import type { StreamingRole } from '@camera.ui/sdk';
import type { DBCamera, DBCamviewCardFit } from '@shared/types';
import type { CardProps } from 'openvue';
import type { CSSProperties, HTMLAttributes, Ref } from 'vue';

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
  (e: 'fullscreen', active: boolean): void;
}

export interface CuiCameraCardProps {
  cameraInfo: DBCamera | string;

  backButton?: boolean;
  doubleClickZoom?: boolean;
  expandableCard?: boolean;
  expanded?: boolean;
  flatCard?: boolean;
  cardFit?: DBCamviewCardFit;
  resizable?: boolean;
  cardProps?: CardProps;
  routerLink?: string;
  cardClickAction?: 'redirect' | 'expand' | 'none';
  viewTransition?: boolean;
  cardBackgroundColor?: string;
  timelineContainerId?: string;

  control?: boolean;
  controlFastForwardButton?: boolean;
  controlFsButton?: boolean;
  controlMicrophoneButton?: boolean;
  controlPipButton?: boolean;
  controlPlayPauseButton?: boolean;
  controlRewindButton?: boolean;
  controlSpeakerButton?: boolean;

  fullscreenShortcuts?: boolean;
  fullscreenTimeline?: boolean;
  embeddedTimeline?: boolean;

  subcontrol?: boolean;
  subcontrolPtzButton?: boolean;

  cameraNameOverlay?: boolean;
  liveIndicatorOverlay?: boolean;
  modeOverlay?: boolean;
  detectionIndicatorOverlay?: boolean;
  detectionIconsOverlay?: boolean;
  boundingBoxOverlay?: boolean;
  privacyOverlay?: boolean;
  showShortcuts?: boolean;

  toolbar?: boolean;
  toolbarAskButton?: boolean;
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
  currentEvent?: RecordedEvent;
  onOpenTrace?: () => void;

  pipSourceRole?: StreamingRole;
  pipCamera?: string;
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
  cardFit: 'aspect',
  resizable: false,
  pipToggleButton: false,
  cardClickAction: 'redirect',
  viewTransition: false,
  timelineContainerId: 'timeline-container',

  cameraNameOverlay: true,
  liveIndicatorOverlay: false,
  detectionIndicatorOverlay: false,
  detectionIconsOverlay: false,
  boundingBoxOverlay: true,
  privacyOverlay: true,
  showShortcuts: false,

  toolbar: true,
  toolbarAskButton: false,
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

  fullscreenShortcuts: false,
  fullscreenTimeline: false,
  embeddedTimeline: false,

  subcontrol: true,
  subcontrolPtzButton: true,
};

export interface CuiCameraZoomState {
  pan: Ref<{ x: number; y: number }>;
  zoom: Ref<number>;
}

export interface CuiCameraZoomableProps {
  state: CuiCameraZoomState;
}

export interface CuiCameraMinimapViewportProps {
  viewportStyle: () => CSSProperties | null;
}
