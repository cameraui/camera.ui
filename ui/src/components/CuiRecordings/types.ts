import type { GridRegion } from '@/components/CuiGridSearch/types.js';
import type { EventThumbnails } from '@camera.ui/nvr';
import type { DetectionEvent } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';

export interface RecordingsFilterState {
  search: string;
  semanticQuery: string;
  filterLogicTriggers: 'and' | 'or';
  filterLogicAttributes: 'and' | 'or';
  cameraIds: string[];
  timeRange: '1h' | '1d' | '1w' | '1m' | 'custom' | null;
  customDateRange: [Date, Date] | null;
  eventTypes: string[];
  audioLabels: string[];
  hasAttributes: string[];
  sensorEvents: string[];
  gridRegions: GridRegion[];
  minConfidence: number;
  minSemanticScore: number;
}

export interface ThumbnailOverride {
  url: string;
  type: string;
  label?: string;
}

export interface RecordingCardProps {
  event: DetectionEvent;
  cameraName?: string;
  camera?: DBCamera;
  loadThumbnails: (eventId: string, startMs: number) => Promise<EventThumbnails | null>;
  semanticScore?: number;
  thumbnailOverride?: ThumbnailOverride;
}

export interface RecordingCardEmits {
  scrollToEvent: [timestamp: number];
}

export interface RecordingsFilterSidebarProps {
  filters: RecordingsFilterState;
  cameras: { id: string; name: string }[];
  isOpen: boolean;
  isOverlay: boolean;
  semanticSearchAvailable?: boolean;
  semanticSearchLoading?: boolean;
}

export interface RecordingsFilterSidebarEmits {
  'update:filters': [filters: RecordingsFilterState];
  'semantic-search': [query: string];
  close: [];
}
