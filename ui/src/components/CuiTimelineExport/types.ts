import type { CuiTimeline } from '@camera.ui/nvr';

export const TIMELAPSE_OPTIONS = ['Off', '1m', '2m', '3m', '5m'] as const;

export interface CuiTimelineExportProps {
  timeline?: Pick<InstanceType<typeof CuiTimeline>, 'trimStartMs' | 'trimEndMs' | 'trimRecordingDurationMs'> | null;
  cameraId: string;
  sourceRole?: string;
  horizontal?: boolean;
}
