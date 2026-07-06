import type { NvrExportBatchResult, NvrExportEstimateResult, NvrExportSlice } from '@camera.ui/nvr';

export interface ExportRecordingsCamera {
  id: string;
  name: string;
}

export interface ExportRecordingsProps {
  cameras: ExportRecordingsCamera[];
  preselect?: string[];
}

export interface ExportRecordingsFile {
  cameraId: string;
  cameraName: string;
  name: string;
  span: string;
  bytes: number;
}

export interface ExportRecordingsProxy {
  nvrExportEstimate?: (request: { cameras: string[]; slices: NvrExportSlice[]; quality: string }) => Promise<NvrExportEstimateResult>;
  nvrExportBatch?: (request: { cameras: string[]; slices: NvrExportSlice[]; quality: string; timelapseIntervalSec: number }) => Promise<NvrExportBatchResult>;
}
