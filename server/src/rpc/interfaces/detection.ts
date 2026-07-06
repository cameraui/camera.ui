import type {
  AudioFrameData,
  AudioModelSpec,
  AudioResult,
  ClassifierResult,
  ClipResult,
  Detection,
  FaceResult,
  LicensePlateResult,
  ModelSpec,
  MotionResult,
  ObjectModelSpec,
  ObjectResult,
  SensorType,
  VideoFrameData,
} from '@camera.ui/sdk';
import type { LineCrossingEvent } from '../../camera/decoder/detection-pipeline.js';

type AnyModelSpec = ObjectModelSpec | ModelSpec | AudioModelSpec;

export interface CroppedRegion {
  frame: VideoFrameData;
  detection: Detection;
  offset: { x: number; y: number };
  cropSize: { width: number; height: number };
  originalSize: { width: number; height: number };
}

export interface DetectionThumbnail {
  label: string;
  jpeg: Buffer;
  score: number;
  area: number;
  onEdge: boolean;
  trackId?: number;
  speed?: number;
}

export interface DetectionResults {
  motion?: MotionResult;
  object?: ObjectResult;
  face?: FaceResult;
  faceEmbeddingModel?: string;
  licensePlate?: LicensePlateResult;
  classifiers?: Record<string, ClassifierResult>;
  clip?: ClipResult;
  clipEmbeddingModel?: string;
  audio?: AudioResult;
  cascadeTriggered?: boolean;
  thumbnails?: DetectionThumbnail[];
  lineCrossings?: LineCrossingEvent[];
  timestamp: number;
}

export interface CoordinatorSensorInfo {
  pluginId: string;
  sensorId: string;
  sensorType: SensorType;
  capabilities: string[];
  requiresFrames: boolean;
  modelSpec?: AnyModelSpec;
}

export interface DetectionCoordinatorInterface {
  onSensorAdded(sensor: CoordinatorSensorInfo): Promise<void>;
  onSensorRemoved(sensorId: string): Promise<void>;
  onSensorCapabilitiesChanged(sensorId: string, capabilities: string[]): Promise<void>;
  reportSensorWrite(sensorId: string, sensorType: SensorType, properties: Record<string, unknown>): Promise<void>;
  reportSensorTrigger(sensorId: string, triggerType: string, action: 'activate' | 'deactivate', sustained: boolean, timeoutSeconds: number): Promise<void>;
  reconcileSensorTriggers(activeSensorIds: readonly string[]): Promise<void>;
  hasPlugin(sensorType: SensorType): boolean;
}

export interface DetectionPluginInterface {
  detectMotion(frame: VideoFrameData): Promise<MotionResult>;
  detectObjects(frame: VideoFrameData): Promise<ObjectResult>;
  detectFaces(frames: VideoFrameData[]): Promise<FaceResult[]>;
  detectLicensePlates(frames: VideoFrameData[]): Promise<LicensePlateResult[]>;
  detectClassifications(frames: VideoFrameData[]): Promise<ClassifierResult[]>;
  detectEmbeddings(frames: VideoFrameData[]): Promise<ClipResult[]>;
  detectAudio(audio: AudioFrameData): Promise<AudioResult>;
}
