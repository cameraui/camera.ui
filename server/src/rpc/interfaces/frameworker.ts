import type { CameraDetectionSettings, CameraFrameWorkerSettings, CameraUiSettings, DetectionLine, DetectionZone, PtzAutotrackSettings } from '@camera.ui/sdk';
import type { DetectionCoordinatorConfig } from '../../camera/decoder/detection-coordinator.js';

export interface FrameWorkerChildInterface {
  initialize(config: DetectionCoordinatorConfig): Promise<void>;
  updateZones(zones: DetectionZone[]): void;
  updateLines(lines: DetectionLine[]): void;
  updateDetectionSettings(settings: CameraDetectionSettings): void;
  updatePtzAutotrackSettings(settings: PtzAutotrackSettings): void;
  updateFrameWorkerSettings(settings: CameraFrameWorkerSettings): void;
  updateInterfaceSettings(settings: CameraUiSettings): void;
  updateCameraName(name: string): void;
}
