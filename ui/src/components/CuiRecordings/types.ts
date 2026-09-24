import type { GridRegion } from '@/components/CuiGridSearch/types.js';
import type { EventThumbnails, RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export type RecordingsContentKind = 'all' | 'events' | 'episodes';

export interface RecordingsFilterState {
  contentKind: RecordingsContentKind;
  favoritesOnly: boolean;
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

export const TOLERATED_ROWS = 2;

export interface CuiRecordingsGridProps<T> {
  items: T[];
  minItemWidth: number;
  aspectRatio?: number;
  gap?: number;
  hasMore?: boolean;
  loadMore?: () => void | Promise<void>;
  itemKey?: (item: T) => string | number;
}

export const CUI_RECORDINGS_GRID_DEFAULTS = {
  aspectRatio: 1,
  gap: 8,
  hasMore: false,
  loadMore: undefined,
  itemKey: undefined,
} satisfies Partial<CuiRecordingsGridProps<unknown>>;

export interface RecordingCardProps {
  event: RecordedEvent;
  cameraName?: string;
  camera?: DBCamera;
  loadThumbnails: (eventId: string, startMs: number) => Promise<EventThumbnails | null>;
  semanticScore?: number;
  segIndex?: number;
  hideSegmentBadge?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  siblingActive?: boolean;
}

export interface RecordingCardEmits {
  scrollToEvent: [timestamp: number];
  select: [];
  openTrace: [atMs?: number];
}

export interface FaceTarget {
  seg: number;
  label: string;
}

export interface RecordingsFilterSidebarProps {
  filters: RecordingsFilterState;
  cameras: { id: string; name: string; room?: string }[];
  isOpen: boolean;
  isOverlay: boolean;
  resultCount: number;
  resultTotal?: number;
  resultCapped?: boolean;
  semanticCount?: number;
  semanticSearchAvailable?: boolean;
  semanticSearchLoading?: boolean;
  assistantSearchAvailable?: boolean;
  assistantSearchLoading?: boolean;
  assistantSearchNote?: string;
}

export interface RecordingsFilterSidebarEmits {
  'update:filters': [filters: RecordingsFilterState];
  'semantic-search': [query: string];
  'assistant-search': [text: string];
  close: [];
}
