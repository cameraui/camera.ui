import type { Go2RtcModel } from '@/common/cameraSources.js';

export interface CuiCameraSourcesProps {
  sources: Go2RtcModel[];
  isLoading: boolean;
  allowAddRemoveSources?: boolean;
}
