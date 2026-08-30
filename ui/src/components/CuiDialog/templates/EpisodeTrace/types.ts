import type { EpisodeTrace, EpisodeTraceImage, RecordedEpisode } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

export interface EpisodeTraceProps {
  episode: RecordedEpisode;
  cameraById: Map<string, DBCamera>;
}

export interface EpisodeTracePlugin {
  getEpisodeTrace(episodeID: string): Promise<EpisodeTrace | null>;
  getEpisodeTraceImages(episodeID: string): Promise<EpisodeTraceImage[]>;
  nvrExportEpisode(episodeID: string): Promise<{ url: string; filename: string }>;
}
