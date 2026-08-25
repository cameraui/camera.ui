import type { GridRegion } from '@/components/CuiGridSearch/types.js';
import type { EventThumbnails, RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export type RecordingsContentKind = 'all' | 'events' | 'episodes';

export interface RecordingsFilterState {
  contentKind: RecordingsContentKind;
  search: string;
  semanticQuery: string;
  filterLogicTriggers: 'and' | 'or';
  filterLogicAttributes: 'and' | 'or';
  rooms: string[];
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
  onlyWithRecordings: boolean;
}

export interface RecordingCardProps {
  event: RecordedEvent;
  cameraName?: string;
  camera?: DBCamera;
  loadThumbnails: (eventId: string, startMs: number) => Promise<EventThumbnails | null>;
  semanticScore?: number;
  segIndex?: number;
  selectionMode?: boolean;
  selected?: boolean;
  siblingActive?: boolean;
}

export interface RecordingCardEmits {
  scrollToEvent: [timestamp: number];
  select: [];
  openEpisode: [episodeId: string];
}

export interface RecordingsFilterSidebarProps {
  filters: RecordingsFilterState;
  cameras: { id: string; name: string; room?: string }[];
  isOpen: boolean;
  isOverlay: boolean;
  resultCount: number;
  semanticCount?: number;
  semanticSearchAvailable?: boolean;
  semanticSearchLoading?: boolean;
}

export interface RecordingsFilterSidebarEmits {
  'update:filters': [filters: RecordingsFilterState];
  'semantic-search': [query: string];
  close: [];
}
