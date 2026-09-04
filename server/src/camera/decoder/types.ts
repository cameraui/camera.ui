import { SensorType } from '@camera.ui/sdk';

import type { BoundingBox, LoadedModel, MotionResolution, StreamingRole } from '@camera.ui/sdk';
import type { SystemInfo } from '../../utils/system-info.js';

export type PixelFormat = 'yuv420p' | 'rgb24' | 'nv12';

export type AnalysisStream = 'low' | 'main';

const TRAINING_MOVING_SPEED = 0.002;

export const FULL_FRAME_BOX: BoundingBox = { x: 0, y: 0, width: 1, height: 1 };

export function ensureDetectionBoxes<T extends { box?: BoundingBox }>(detections: readonly T[]): (T & { box: BoundingBox })[] {
  return detections.map((detection) => (detection.box ? (detection as T & { box: BoundingBox }) : { ...detection, box: { ...FULL_FRAME_BOX } }));
}

export function isFullFrameBox(box: BoundingBox): boolean {
  return box.x <= 0 && box.y <= 0 && box.width >= 1 && box.height >= 1;
}

export function touchesFrameEdge(box: BoundingBox): boolean {
  return box.x <= 0.005 || box.y <= 0.005 || box.x + box.width >= 0.995 || box.y + box.height >= 0.995;
}

export function isMovingTrainingSubject(detection: { box?: BoundingBox }): boolean {
  if (!detection.box || isFullFrameBox(detection.box)) return false;
  const t = detection as { trackSpeed?: number; stationarySince?: number };
  if (t.stationarySince !== undefined) return false;
  return t.trackSpeed === undefined || t.trackSpeed >= TRAINING_MOVING_SPEED;
}

export interface CoordinatorSourceUrl {
  role: StreamingRole;
  url: string;
}

export const MOTION_WIDTH_MAP: Record<MotionResolution, number> = {
  low: 320,
  medium: 480,
  high: 640,
};

export const DETECT_TIMEOUT_MS = 30_000;

export interface WorkerToMainMessage {
  message: 'started';
  data: Record<string, any>;
}

export interface ObjectBenchmarkResult {
  camera: string;
  worker?: string;
  plugin: string;
  sensorId: string;
  runtime?: string;
  models?: LoadedModel[];
  input: string;
  iterations: number;
  failed: number;
  concurrency: number;
  totalMs: number;
  perSecond: number;
  handlerMs: number;
}

export type BenchmarkSystem = SystemInfo;

export interface BenchmarkHost {
  worker?: string;
  system?: BenchmarkSystem;
}

export interface ObjectBenchmarkRun {
  hosts: BenchmarkHost[];
  total: {
    cameras: number;
    iterations: number;
    failed: number;
    concurrency: number;
    totalMs: number;
    perSecond: number;
    handlerMs: number;
  };
  cameras: ObjectBenchmarkResult[];
}

export interface FrameWorkerPerfCounters {
  loopMs: number;
  idleTicks: number;
  activeTicks: number;
  mainFrames: number;
  switches: number;
  decodeMs: number;
  decodedFrames: number;
  mainDecodeMs: number;
  scaleMs: number;
  postMs: number;
  jpegMs: number;
  motionMs: number;
  motionCount: number;
  objectMs: number;
  objectCount: number;
  assistMs: number;
  assistCount: number;
  faceMs: number;
  faceCount: number;
  plateMs: number;
  plateCount: number;
  clipMs: number;
  clipCount: number;
  classifierMs: number;
  classifierCount: number;
  secondaryMs: number;
  objects: number;
  faces: number;
  plates: number;
  framesWithObjects: number;
  zoomTicks: number;
  zoomWindows: number;
}

export const DETECTOR_METRIC_TYPES = [SensorType.Motion, SensorType.Object, SensorType.Face, SensorType.LicensePlate, SensorType.Classifier, SensorType.Clip] as const;

export interface DetectorTiming {
  handlerMs: number;
  transportMs: number;
  calls: number;
}

export interface DetectorInfo extends Partial<DetectorTiming> {
  plugin: string;
  input?: string;
  runtime?: string;
  models?: LoadedModel[];
}

export interface FrameWorkerPerfSnapshot extends FrameWorkerPerfCounters {
  uptimeMs: number;
  ticks: number;
  mainStreamEnabled: boolean;
  frameAnalysis: boolean;
  detectors: Record<string, DetectorInfo>;
}
