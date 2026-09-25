import type { SimilarSearchRequest } from '@/components/CuiSimilarPicker/types.js';
import type { RecordedEvent, SimilarMode } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export interface CuiSimilarResultsProps {
  request: SimilarSearchRequest;
}

export interface SimilarResultOpen {
  event: RecordedEvent;
  camera?: DBCamera;
  timestamp: number;
}

export interface CuiSimilarResultsEmits {
  open: [match: SimilarResultOpen];
  close: [];
  showAll: [];
  shown: [keys: string[]];
}

export const SIMILAR_PANEL_WIDTH = 280;

export interface SimilarResultItem {
  key: string;
  event: RecordedEvent;
  segIndex?: number;
  score?: number;
}

export const SIMILAR_SCORE_RANGES: Partial<Record<SimilarMode, [number, number]>> = {
  person: [0.4, 0.65],
  face: [0.25, 0.45],
  appearance: [0.8, 0.92],
};
