import { PromiseTimeout, sleep } from '@camera.ui/common/utils';
import { isNoRespondersError, RPCMethod } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';
import { NamespaceManager } from '../../rpc/namespaces.js';
import { DETECTION_SENSOR_TYPES } from '../../sensors/types.js';
import { PrivacyMask } from '../privacy/mask.js';
import { normalizePolygon } from '../utils/filter.js';
import { normalizeZones } from '../zones.js';
import { AudioDetectionLoop } from './audio-loop.js';
import { CascadeManager } from './cascade-manager.js';
import { detectionRecord } from './debug/detection-record.js';
import { DetectionPipeline } from './detection-pipeline.js';
import { clippedBy, clusterBoxes, DetectionWindow, mergeWindowDetections, MOTION_PAD, planWindowsOnce, TRACK_PAD } from './detection-window.js';
import { DwellManager } from './dwell-manager.js';
import { DetectionEventManager, MOMENT_RANK_ATTRIBUTE, MOMENT_RANK_OBJECT, SECONDARY_FRESH_MS } from './event-manager.js';
import { EventThumbnailer } from './event-thumbnailer.js';
import { externalTrace, motionTrace, traceAttributes, traceSource, traceStamp, windowTrace } from './event-trace.js';
import { faceNote } from './face-tracks.js';
import { withFrameBytes } from './frame-bytes.js';
import { FrameScaler } from './frame-scaler.js';
import { hardwareDecodingAvailable } from './hardware.js';
import { directionBetween, directionOf, MOMENT_FORMATS, MOMENT_QUALITY, momentWindow, unionBox } from './moment-crop.js';
import { MotionLocalizer } from './motion-localizer.js';
import { withNoResponderBackoff } from './no-responder-backoff.js';
import { PerfTracker } from './perf-tracker.js';
import { normalizePlateText } from './plate-vote.js';
import { isVideoInputSpec, modelIdentity, PluginRegistry } from './plugin-registry.js';
import { PtzAutotracker } from './ptz/autotracker.js';
import { SecondaryStage } from './secondary-stage.js';
import { BufferedSource } from './sources/buffered-source.js';
import { FrameSource } from './sources/frame-source.js';
import { trainingValue } from './training-sink.js';
import { DETECT_TIMEOUT_MS, DETECTOR_METRIC_TYPES, ensureDetectionBoxes, isFullFrameBox, isMovingTrack, isTrainingSubject, MOTION_WIDTH_MAP } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { RPCClient } from '@camera.ui/rpc';
import type { WorldObject } from '@camera.ui/rust-postprocessor';
import type {
  AudioResult,
  BoundingBox,
  CameraDetectionSettings,
  CameraFrameWorkerSettings,
  CameraUiSettings,
  CameraZones,
  ClassifierDetection,
  ClassifierResult,
  ClipEmbedding,
  ClipResult,
  Detection,
  FaceDetection,
  FaceResult,
  LicensePlateDetection,
  LicensePlateResult,
  MotionResult,
  ObjectResult,
  Point,
  PtzAutotrackSettings,
  TrackedDetection,
  VideoFrameData,
  VideoInputSpec,
  ZoneLabel,
} from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { ProcessSession } from '../../plugins/types.js';
import type { CoordinatorSensorInfo, DetectionPluginInterface, DetectionResults, TrainingSuggestion } from '../../rpc/interfaces/detection.js';
import type { CameraDeviceInterface } from '../../rpc/interfaces/device.js';
import type { SensorWriteMessage } from '../../rpc/interfaces/sensor.js';
import type { LineCrossingEvent, PipelineResult, ZoneConfig } from './detection-pipeline.js';
import type { WindowDetection } from './detection-window.js';
import type {
  NormalizedDetectionZone,
  ProcessedDetectionData,
  SegmentMoment,
  TrackedClipEmbedding,
  TrackedFaceDetection,
  TrackedLicensePlateDetection,
  TrackedPersonEmbedding,
} from './event-manager.js';
import type { TraceFaceRead, TraceTick } from './event-trace.js';
import type { LetterboxGeometry } from './frame-scaler.js';
import type { CropWindow, MomentFormatName, MomentTarget } from './moment-crop.js';
import type { OutputLease } from './output-pool.js';
import type { AnyModelSpec, RegisteredPlugin } from './plugin-registry.js';
import type { AnalysisSource, FrameSnap } from './sources/analysis-source.js';
import type { SnapshotConfig } from './sources/snapshot-fetcher.js';
import type { TrainingSubject } from './training-sink.js';
import type { CoordinatorSourceUrl, DetectorInfo, FrameWorkerPerfSnapshot, ObjectBenchmarkResult } from './types.js';

export interface DetectionCoordinatorConfig {
  cameraId: string;
  streamUrl: string;
  snapshotUrl: string;
  audioStreamUrl: string;
  controllerSnapshotSourceId?: string;
  availableSources?: CoordinatorSourceUrl[];
  streamRole?: CoordinatorSourceUrl['role'];
  zones: CameraZones;
  detectionSettings: CameraDetectionSettings;
  ptzAutotrack: PtzAutotrackSettings;
  frameWorkerSettings: CameraFrameWorkerSettings;
  interfaceSettings: CameraUiSettings;
  nvrRpc?: string;
  streamHot?: boolean;
  session?: ProcessSession;
}

interface PluginFrame {
  model: VideoFrameData;
  tracking: VideoFrameData;
  geometry: LetterboxGeometry;
}

interface AnalysisFrame {
  frame: Frame;
  scaler: FrameScaler;
  isMainStream: boolean;
  rtp?: number;
  role?: CoordinatorSourceUrl['role'];
}

interface AttributeMomentCandidate {
  label: string;
  box: BoundingBox;
  parentBox?: BoundingBox;
  confidence: number;
}

interface RenderedMoment {
  strip: Buffer;
  card?: Buffer;
  windows: Partial<Record<MomentFormatName, CropWindow>>;
  stripWindow?: BoundingBox;
  cardWindow?: BoundingBox;
}

const TRAINING_FRAME_MAX_WIDTH = 1280;
const TRAINING_ATTRIBUTE_BONUS = 0.2;
const TRAINING_SUGGESTION_WEIGHT = 0.5;
const TRAINING_FRAME_QUALITY = 80;
const MOMENT_EVENTS = new Set(['objectEntered', 'objectWoke', 'objectRecovered', 'bestShotUpdated']);
const WITNESS_WINDOW_MS = 3000;
const HELD_MOMENT_MS = 4000;
const MOMENT_ATTRIBUTE_MIN_AREA = 600;

const DEFAULT_CASCADE_TIMEOUT = 10;
const OBJECT_DWELL_SECONDS = 2;
const SECONDARY_BBOX_TTL_MS = 2000;
const WORLD_TICK_STARVATION_MS = 60_000;
const CADENCE_MIN_SAMPLES = 5;
const CADENCE_OUTLIER_BAND = 2.5;
const CADENCE_OUTLIER_RESEED = 5;
const IDLE_TICK_MS = 200;
const ACTIVE_TICK_MS = 100;
const MOTION_INTERVAL_MS = 200;
const TICK_SLACK_MS = 20;
const MAIN_STREAM_HOLD_MS = 5000;
const EXTERNAL_FRAME_MAX_AGE_MS = 1000;
const THUMBNAIL_REFRESH_MIN_MS = 1000;
const EMPTY_WRITE_REFRESH_MS = 5000;

function momentPictures(rendered: RenderedMoment): Pick<SegmentMoment, 'strip' | 'card' | 'stripWindow' | 'cardWindow'> {
  return { strip: rendered.strip, card: rendered.card, stripWindow: rendered.stripWindow, cardWindow: rendered.cardWindow };
}

function normalizedWindow(window: CropWindow, frameWidth: number, frameHeight: number): BoundingBox {
  return { x: window.x / frameWidth, y: window.y / frameHeight, width: window.width / frameWidth, height: window.height / frameHeight };
}

export class DetectionCoordinator {
  private frameSource: AnalysisSource;
  private frameScaler: FrameScaler;

  private readonly plugins = new PluginRegistry();
  private readonly pipeline: DetectionPipeline;
  private readonly secondaries: SecondaryStage;
  private readonly thumbnailer: EventThumbnailer;
  private readonly audioLoop: AudioDetectionLoop;
  private readonly ptzAutotracker: PtzAutotracker;
  private readonly eventManager: DetectionEventManager;
  private readonly cascade = new CascadeManager();
  private readonly worldSpans = new Set<number>();
  private lastWorldTickAt = 0;

  private readonly activeSensorTriggerTypes = new Map<string, string>();
  private readonly secondaryBboxSeen = new Map<string, number>();
  private readonly emptyWrittenAt = new Map<string, Map<string, number>>();
  private readonly faceIdentities = new Set<string>();
  private faceIdentitiesClearedAt = 0;
  private readonly platesSeen = new Set<string>();
  private readonly classifierLabels = new Map<string, Set<string>>();
  private readonly feedingSensors = new Map<string, SensorType>();
  private readonly witnessSensors = new Set<string>();
  private readonly witnessSeen = new Map<string, number>();
  private readonly heldMoments = new Map<number, SegmentMoment>();
  private readonly dwell = new DwellManager();
  private readonly privacy: PrivacyMask;

  private readonly perf = new PerfTracker();
  private benchmarkRunning = false;

  private hqUpgrade?: AnalysisFrame;
  private localizer: MotionLocalizer;
  private lastLocalizeAt = 0;
  private anchorBoxes: BoundingBox[] = [];
  private trackAnchorBoxes: BoundingBox[] = [];
  private farewellBoxes: BoundingBox[] = [];
  private lastTrackedById = new Map<number, BoundingBox>();
  private detectionWindow = new DetectionWindow();
  private ptzWasSuppressed = false;
  private ptzEndPending = false;
  private liveLabels = new Set<string>();
  private witnessLabels = new Map<string, Set<string>>();
  private mainStreamActive = false;
  private idleSince = 0;
  private lastMotionAt = 0;
  private lastThumbnailRefreshAt = 0;

  private loopRunning = false;
  private loopPromise?: Promise<void>;
  private videoStopPromise?: Promise<void>;
  private adHocVideoLoop = false;
  private processingExternalSecondary = false;

  private lastObjectCallAt = 0;
  private objectIntervalMs = 0;
  private objectIntervalSamples = 0;
  private objectIntervalOutliers = 0;

  private cascadeUnsubscribe?: () => void;
  private dwellUnsubscribe?: () => void;

  private currentDetectionState: {
    motion?: MotionResult;
    object?: ObjectResult;
    face?: FaceResult;
    faceAt?: number;
    licensePlate?: LicensePlateResult;
    licensePlateAt?: number;
    classifiers?: Record<string, ClassifierResult & { at: number }>;
    classifiersAt?: number;
    clip?: ClipResult;
    clipAt?: number;
    audio?: AudioResult;
    faceEmbeddingModel?: string;
    clipEmbeddingModel?: string;
    lineCrossings?: LineCrossingEvent[];
    cascadeTriggered?: boolean;
  } = {};

  constructor(
    private config: DetectionCoordinatorConfig,
    private readonly proxy: RPCClient,
    private readonly logger: Logger,
  ) {
    const snapshot: SnapshotConfig = { snapshotUrl: config.snapshotUrl };

    if (config.controllerSnapshotSourceId) {
      const sourceId = config.controllerSnapshotSourceId;
      const controllerProxy = this.proxy.createProxy<CameraDeviceInterface>(NamespaceManager.cameraNamespaces(config.cameraId).cameraControllerRpc);
      snapshot.snapshotProvider = async () => {
        const jpeg = await controllerProxy.snapshot(sourceId, true, true);
        if (!jpeg || jpeg.byteLength === 0) return null;
        return Buffer.from(jpeg);
      };
    }

    this.config.zones = normalizeZones(config.zones);
    this.privacy = new PrivacyMask(logger);
    this.privacy.update(this.config.zones);

    const decoder = this.config.frameWorkerSettings.decoder;
    this.frameSource = config.streamHot
      ? new BufferedSource({ url: config.streamUrl, decoder, privacy: this.privacy, snapshot }, logger)
      : new FrameSource({ streamUrl: config.streamUrl, decoder, ...snapshot }, logger);

    // a hot source buffers from the start, the loop only decides what is analysed
    if (config.streamHot) this.frameSource.start();
    this.frameScaler = new FrameScaler(null, logger, this.privacy);
    this.localizer = new MotionLocalizer();
    this.pipeline = new DetectionPipeline(this.pipelineZones(), config.detectionSettings);
    this.detectionWindow.setZones(this.windowZones());
    this.secondaries = new SecondaryStage(this, this.plugins, this.pipeline, this.frameScaler, this.proxy, this.perf, logger);

    if (config.zones.lines.length > 0) {
      this.pipeline.updateLines(config.zones.lines, this.videoAspectRatio);
    }

    this.eventManager = new DetectionEventManager(config.cameraId, this.proxy, this.logger, this.perf);
    this.eventManager.updateNvrRpc(config.nvrRpc);
    this.eventManager.onEventEnd(() => this.handleEventEnded());
    this.eventManager.onSegmentClosed(() => {
      if (!this.dwell.hasActive() && this.worldSpans.size === 0) {
        this.eventManager.forceEndActiveEvent();
        // cascade and dwell ended inside the linger, their stop calls were skipped
        this.stopAdHocVideoLoopIfIdle();
      }
    });

    this.thumbnailer = new EventThumbnailer(
      {
        frameSource: this.frameSource,
        frameScaler: this.frameScaler,
        privacy: this.privacy,
        eventManager: this.eventManager,
        logger,
        decoder: this.config.frameWorkerSettings.decoder,
      },
      config.availableSources,
    );
    this.thumbnailer.sync(this.mainStreamSourceWanted);

    detectionRecord.sources({
      roles: config.availableSources?.map((s) => s.role),
      mainStreamAnalysis: this.config.frameWorkerSettings.mainStreamAnalysis === true,
      hasMainStream: this.thumbnailer.hasMainStream,
      cascade: this.cascadeEnabled,
      cascadeTimeout: this.cascadeTimeoutSeconds,
      motionTimeout: this.config.detectionSettings.motion.timeout,
      audioTimeout: this.config.detectionSettings.audio.timeout,
      suppressStatic: this.config.detectionSettings.object.suppressStatic ?? true,
      motionResolution: this.motionResolution,
    });

    this.audioLoop = new AudioDetectionLoop(
      {
        cameraId: config.cameraId,
        getPlugin: () => this.plugins.get(SensorType.Audio),
        getStreamUrl: () => this.config.audioStreamUrl,
        getMinDecibels: () => this.config.detectionSettings.audio.minDecibels,
        onResult: (sensorId, result) => this.handleAudioLoopResult(sensorId, result),
      },
      logger,
    );

    this.ptzAutotracker = new PtzAutotracker({
      logger: this.logger,
      proxy: this.proxy,
      cameraId: this.config.cameraId,
      settings: this.config.ptzAutotrack,
      onSuppressionActivated: () => this.handleSuppressionActivated(),
    });

    this.cascadeUnsubscribe = this.cascade.onChange((event) => {
      if (event.type === 'activated') {
        // no object tick ran while the cascade was off, these tracks are stale
        this.trackAnchorBoxes = [];
        this.witnessLabels.clear();
        this.startAdHocVideoLoopIfNeeded();
        this.seedLocalizerReference();
      } else {
        this.stopAdHocVideoLoopIfIdle();
        this.handleCascadeDeactivated();
      }
    });

    this.dwellUnsubscribe = this.dwell.onChange((event) => {
      const isSensorTrigger = event.sensorId.startsWith('trigger:');

      if (event.state === 'activated') {
        // sensor triggers (contact/switch/light) manage their own detected/blocked
        if (!isSensorTrigger) {
          this.writeSensorProperties(event.sensorId, {
            detected: true,
            blocked: true,
            lastTriggered: event.timestamp,
          });
        }
      } else {
        if (!isSensorTrigger) {
          this.writeSensorProperties(event.sensorId, { detected: false, blocked: false });
        }
        this.activeSensorTriggerTypes.delete(event.sensorId);

        this.eventManager.processResults(this.buildSnapshot());
        if (!this.dwell.hasActive() && this.worldSpans.size === 0 && !this.eventManager.hasActiveSegment()) {
          this.eventManager.forceEndActiveEvent();
        }
        this.stopAdHocVideoLoopIfIdle();
      }
    });
  }

  public get running(): boolean {
    return this.loopRunning;
  }

  public get detectionSettings(): CameraDetectionSettings {
    return this.config.detectionSettings;
  }

  public getPerfSnapshot(): FrameWorkerPerfSnapshot {
    // decodes outside the loop (external reports, pictures) count as well
    this.collectDecodeStats();
    const { timings, ...counters } = this.perf.snapshot();
    const detectors: Record<string, DetectorInfo> = {};

    for (const type of DETECTOR_METRIC_TYPES) {
      const plugin = this.plugins.get(type);
      // motion without frames is the camera's own signal, there is no detector to report
      if (!plugin || (type === SensorType.Motion && !plugin.requiresFrames)) continue;

      const input = plugin.modelSpec?.input;
      detectors[type] = {
        plugin: plugin.pluginId,
        input: isVideoInputSpec(input) ? `${input.width}x${input.height}` : undefined,
        runtime: plugin.modelSpec?.runtime,
        models: plugin.modelSpec?.models,
        ...timings[type],
      };
    }

    return {
      ...counters,
      detectors,
      mainStreamEnabled: this.mainStreamAvailable,
      frameAnalysis: this.plugins.shouldVideoBeActive(),
    };
  }

  public resetPerf(): void {
    // what was decoded before the reset must not land in the new period
    this.frameSource.takeDecodeStats();
    this.thumbnailer.takeHqDecodeStats();
    this.perf.reset();
  }

  public forgetSensorWrites(): void {
    this.emptyWrittenAt.clear();
  }

  public reconnectSources(): void {
    this.frameSource.retryNow();
    this.audioLoop.retryNow();
    this.thumbnailer.retryNow();
  }

  private collectDecodeStats(): void {
    const decode = this.frameSource.takeDecodeStats();
    this.perf.decodeMs += decode.ms;
    this.perf.decodedFrames += decode.frames;
    const main = this.thumbnailer.takeHqDecodeStats();
    this.perf.mainDecodeMs += main.ms;
    this.perf.mainDecodedFrames += main.frames;
  }

  public pauseForBenchmark(paused: boolean): void {
    this.benchmarkRunning = paused;
  }

  public async runObjectBenchmark(iterations: number, concurrency: number): Promise<ObjectBenchmarkResult | null> {
    const plugin = this.plugins.get(SensorType.Object);
    const input = plugin?.modelSpec?.input;
    if (!plugin || !isVideoInputSpec(input)) return null;

    const channels = input.format === 'gray' ? 1 : input.format === 'nv12' ? 1.5 : 3;
    const frame: VideoFrameData = {
      id: 'benchmark',
      data: Buffer.alloc(Math.round(input.width * input.height * channels)),
      width: input.width,
      height: input.height,
      format: input.format,
    };

    let handlerMs = 0;
    let completed = 0;
    let failed = 0;
    const timed = this.proxy.createProxy<DetectionPluginInterface>(NamespaceManager.sensorProviderNamespaces(plugin.pluginId, plugin.sensorId).sensorRpc, {
      onTiming: (_method, timing) => {
        handlerMs += timing.handlerMs;
      },
    });

    const startedAt = Date.now();
    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (completed + failed < iterations) {
        completed++;
        try {
          await PromiseTimeout(timed.detectObjects(frame), DETECT_TIMEOUT_MS, undefined, `Benchmark call timed out after ${DETECT_TIMEOUT_MS}ms`);
        } catch (error) {
          completed--;
          failed++;
          this.logger.debug('Benchmark call failed:', error);
        }
      }
    });
    await Promise.all(workers);
    const totalMs = Date.now() - startedAt;
    const effectiveConcurrency = handlerMs > 0 && totalMs > 0 ? Math.round((handlerMs / totalMs) * 10) / 10 : undefined;

    return {
      camera: '',
      plugin: plugin.pluginId,
      sensorId: plugin.sensorId,
      runtime: plugin.modelSpec?.runtime,
      models: plugin.modelSpec?.models,
      input: `${input.width}x${input.height}`,
      iterations: completed,
      failed,
      concurrency,
      effectiveConcurrency,
      totalMs,
      perSecond: totalMs > 0 ? Math.round((completed / (totalMs / 1000)) * 10) / 10 : 0,
      handlerMs: completed > 0 ? Math.round((handlerMs / completed) * 10) / 10 : 0,
    };
  }

  public updateZoneConfig(zones: CameraZones): void {
    zones = normalizeZones(zones);
    this.config.zones = zones;
    this.pipeline.updateZones(this.pipelineZones());
    this.detectionWindow.setZones(this.windowZones());
    this.privacy.update(zones);
    this.pipeline.updateLines(zones.lines, this.videoAspectRatio);
  }

  public updateDetectionSettings(settings: CameraDetectionSettings): void {
    this.config.detectionSettings = settings;
    this.pipeline.updateSettings(settings);
  }

  public updatePtzAutotrackSettings(settings: PtzAutotrackSettings): void {
    this.config.ptzAutotrack = settings;
    this.ptzAutotracker.updateSettings(settings);
  }

  public updateFrameWorkerSettings(settings: CameraFrameWorkerSettings): void {
    this.config.frameWorkerSettings = settings;
    this.thumbnailer.sync(this.mainStreamSourceWanted);
  }

  public updateNvrRpc(namespace?: string): void {
    this.config.nvrRpc = namespace;
    this.eventManager.updateNvrRpc(namespace);
    this.secondaries.updateNvrRpc(namespace);
  }

  public updateInterfaceSettings(settings: CameraUiSettings): void {
    this.config.interfaceSettings = settings;
    if (this.config.zones.lines.length > 0) {
      this.pipeline.updateLines(this.config.zones.lines, this.videoAspectRatio);
    }
  }

  public vectorJobStarted(): void {
    this.eventManager.vectorJobStarted();
  }

  public vectorJobSettled(): void {
    this.eventManager.vectorJobSettled();
  }

  public acceptClipVectors(embeddings: TrackedClipEmbedding[], embeddingModel: string, capturedAt: number): void {
    this.eventManager.acceptClipVectors(embeddings, embeddingModel, capturedAt);
  }

  public traceFaceReads(reads: TraceFaceRead[]): void {
    this.eventManager.traceFaceReads(reads);
  }

  public acceptFaceVectors(faces: TrackedFaceDetection[], embeddingModel: string, capturedAt: number): void {
    this.eventManager.acceptFaceVectors(faces, embeddingModel, capturedAt);
  }

  public acceptFaceIdentity(face: TrackedFaceDetection, capturedAt: number): void {
    const facePlugin = this.plugins.get(SensorType.Face);
    if (!facePlugin || !face.identity || capturedAt < this.faceIdentitiesClearedAt || this.faceIdentities.has(face.identity)) return;
    if (this.pipeline.runZoneFilterWithLabel([face], 'face').length === 0) return;
    this.faceIdentities.add(face.identity);
    this.writeSensorProperties(facePlugin.sensorId, { identities: [...this.faceIdentities].sort() });
  }

  public forgetFaceIdentity(name: string): void {
    const facePlugin = this.plugins.get(SensorType.Face);
    if (!this.faceIdentities.delete(name) || !facePlugin) return;
    this.writeSensorProperties(facePlugin.sensorId, { identities: [...this.faceIdentities].sort() });
  }

  public acceptPersonVectors(persons: TrackedPersonEmbedding[], embeddingModel: string, capturedAt: number): void {
    this.eventManager.acceptPersonVectors(persons, embeddingModel, capturedAt);
  }

  public async dispose(): Promise<void> {
    this.heldMoments.clear();
    this.secondaries.dispose();
    await this.stopVideoLoop();
    await this.frameSource.stop();
    await this.audioLoop.stop();
    await this.thumbnailer.stop();
    this.ptzAutotracker.dispose();
    this.cascadeUnsubscribe?.();
    this.dwellUnsubscribe?.();
    this.cascade.dispose();
    this.dwell.dispose();
    this.eventManager.destroy();
    this.adHocVideoLoop = false;
    this.frameScaler.dispose();
    this.currentDetectionState = {};
  }

  @RPCMethod
  public async onSensorAdded(sensor: CoordinatorSensorInfo): Promise<void> {
    // main reseeds the values of a (re-)registered sensor
    this.emptyWrittenAt.delete(sensor.sensorId);

    if (sensor.role === 'witness') {
      this.feedingSensors.delete(sensor.sensorId);
      this.witnessSensors.add(sensor.sensorId);
      return;
    }

    this.witnessSensors.delete(sensor.sensorId);

    if (DETECTION_SENSOR_TYPES.has(sensor.sensorType)) {
      this.feedingSensors.set(sensor.sensorId, sensor.sensorType);
    }

    if (DETECTION_SENSOR_TYPES.has(sensor.sensorType) && sensor.requiresFrames) {
      await this.registerDetectionPluginInternal(sensor);
    }

    if (sensor.sensorType === SensorType.PTZ) {
      await this.ptzAutotracker.bind({
        pluginId: sensor.pluginId,
        sensorId: sensor.sensorId,
        capabilities: sensor.capabilities,
      });
    }
  }

  @RPCMethod
  public async onSensorRemoved(sensorId: string): Promise<void> {
    this.emptyWrittenAt.delete(sensorId);
    this.witnessSensors.delete(sensorId);
    this.classifierLabels.delete(sensorId);
    const sensorType = this.feedingSensors.get(sensorId);
    if (sensorType === SensorType.Face) {
      this.clearFaceIdentities();
      this.secondaries.forgetUntrackedFaces();
    }
    if (sensorType === SensorType.LicensePlate) this.platesSeen.clear();
    if (sensorType !== undefined && this.feedingSensors.delete(sensorId)) {
      // a sensor removed mid-segment misses the cascade-end clear, its recognized lists reset here
      this.writeSensorProperties(sensorId, {
        detected: false,
        detections: [],
        ...(sensorType === SensorType.Face ? { identities: [] } : {}),
        ...(sensorType === SensorType.LicensePlate ? { plates: [] } : {}),
        ...(sensorType === SensorType.Classifier ? { labels: [] } : {}),
      });
    }

    await this.removeDetectionPluginBySensor(sensorId);
    this.ptzAutotracker.unbind(sensorId);

    const dwellKey = `trigger:${sensorId}`;
    this.activeSensorTriggerTypes.delete(dwellKey);
    this.dwell.clear(dwellKey);
    this.dwell.clear(sensorId);
  }

  @RPCMethod
  public onSensorCapabilitiesChanged(sensorId: string, capabilities: string[]): void {
    this.ptzAutotracker.setCapabilities(sensorId, capabilities);
  }

  @RPCMethod
  public async reportSensorWrite(sensorId: string, sensorType: SensorType, properties: Record<string, unknown>): Promise<void> {
    if (sensorType === SensorType.Object && this.witnessSensors.has(sensorId)) {
      this.recordWitness(sensorId, properties);
      return;
    }

    // the registry announces only the assigned plugin and the witnesses, the rest is ignored
    if (!this.feedingSensors.has(sensorId)) return;

    // a detector reports its spec again once its models finished loading
    if (properties.modelSpec) {
      this.applyModelSpec(sensorId, sensorType, properties.modelSpec as AnyModelSpec);
      if (Object.keys(properties).length === 1) return;
    }

    if (sensorType === SensorType.Object) {
      const filtered = this.applyExternalDetectionFilters(sensorType, properties);

      // keeps the autotracker's return-home timer alive even while suppression gates the rest
      const externalDetections = (filtered.detections as Detection[] | undefined) ?? [];
      this.ptzAutotracker.handlePresenceDetections(externalDetections);

      if (this.ptzAutotracker.suppressionActive) return;

      detectionRecord.tick({
        externalObject: { detected: filtered.detected === true, count: externalDetections.length },
      });
      this.ingestDetectionResult(SensorType.Object, sensorId, filtered);

      const hasAnchors = this.anchorBoxes.length > 0 || this.farewellBoxes.length > 0;
      const wantsFrame =
        filtered.detected === true &&
        (this.plugins.hasFrameBasedSecondary() || this.plugins.hasEligibleObjectAssist() || hasAnchors) &&
        !this.processingExternalSecondary;

      const reportSnapshot = this.buildSnapshot();
      // without a frame to look at, the camera's report is the whole tick
      if (!wantsFrame) reportSnapshot.trace = externalTrace(reportSnapshot.timestamp, externalDetections, undefined);
      this.eventManager.processResults(reportSnapshot);

      // smart-camera reports arrive after the motion-start shot, often before the subject is fully in frame
      if (filtered.detected === true) this.refreshEventThumbnail();

      if (!wantsFrame) return;

      this.processingExternalSecondary = true;
      try {
        const rawExternal = (filtered.detections as Detection[] | undefined) ?? [];

        const handle = await this.frameSource.getFrame(EXTERNAL_FRAME_MAX_AGE_MS);
        if (!handle) return;
        try {
          const results: DetectionResults = { timestamp: Date.now() };
          // anchors may have moved analysis to the main stream, assist and secondary crops should see those pixels
          const analysis = await this.acquireAnalysisFrame({ frame: handle.frame, rtp: handle.rtp });
          try {
            const objects = await this.runObjectAssist(analysis.frame, rawExternal, analysis.scaler);
            this.ingestAssistedObjects(sensorId, objects);

            if (objects.assisted) {
              // crop the object like the frame pipeline, so face and plate secondaries run on the subject
              const objectDetections = this.pipeline.processExternal(objects.detections);
              const trace = externalTrace(results.timestamp, rawExternal, objectDetections);
              detectionRecord.tick({ assistProcessed: { count: objectDetections.length, bufferedObjects: this.currentDetectionState.object?.detections?.length ?? 0 } });
              await this.runSecondariesAndThumbnails(analysis, objectDetections, results);
              await this.captureExternalMoment(objectDetections, analysis, results.timestamp);
              this.ingestResultsForAllSecondaries(results);
              const snapshot = this.buildSnapshot();
              snapshot.trace = this.finishTrace(trace, analysis, results);
              detectionRecord.tick({ assistSnapshot: { objects: snapshot.objects.length } });
              if (results.thumbnails && results.thumbnails.length > 0) {
                snapshot.thumbnails = results.thumbnails;
              }
              if (results.trainingSuggestions) snapshot.trainingSuggestions = results.trainingSuggestions;
              await this.attachTrainingFrame(snapshot, analysis);
              this.eventManager.processResults(snapshot);
            } else {
              // no assist boxes: the motion clusters are the only localization, still better than a full-scene card
              const anchorDetections = this.anchorMomentDetections(rawExternal);
              if (anchorDetections.length > 0) {
                await this.captureExternalMoment(anchorDetections, analysis, results.timestamp);
              }
              const sceneJpeg = await this.secondaries.detectFullFrame(analysis.frame, results, { stamp: traceStamp(results.timestamp, analysis.rtp, analysis.role) });
              try {
                results.thumbnails = await this.secondaries.generateThumbnails(analysis.frame, analysis.scaler, results);
              } catch (error) {
                this.logger.error('Thumbnail generation error:', error);
              }
              this.ingestResultsForAllSecondaries(results);
              const snapshot = this.buildSnapshot();
              snapshot.trace = this.finishTrace(externalTrace(results.timestamp, rawExternal, undefined), analysis, results);
              if (results.thumbnails && results.thumbnails.length > 0) {
                snapshot.thumbnails = results.thumbnails;
              }
              if (sceneJpeg) snapshot.eventThumbnail = sceneJpeg;
              const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
              this.eventManager.processResults(snapshot);
              if (wantsEventThumb) {
                this.thumbnailer.upgradeEventThumbnailAsync();
              }
            }
          } finally {
            if (analysis.frame !== handle.frame) analysis.frame[Symbol.dispose]?.();
          }
        } finally {
          await handle[Symbol.asyncDispose]();
        }
      } finally {
        this.processingExternalSecondary = false;
      }
      return;
    }

    if (sensorType === SensorType.Motion) {
      // frame-diff is garbage while the PTZ repositions
      if (this.ptzAutotracker.suppressionActive) return;

      const filtered = this.applyExternalDetectionFilters(sensorType, properties);
      // before the dwell refresh: only the start of camera motion owes a look
      if (filtered.detected === true && !this.dwell.isActive(sensorId)) this.detectionWindow.oweLook('motion-sensor');
      this.ingestDetectionResult(SensorType.Motion, sensorId, filtered);
      const snapshot = this.buildSnapshot();
      // some cameras report where it moved, that is a tick worth keeping
      const boxes = ((filtered.detections as Detection[] | undefined) ?? []).filter((d) => d.box);
      if (boxes.length > 0) snapshot.trace = motionTrace(snapshot.timestamp, boxes, true);
      this.eventManager.processResults(snapshot);
      if (filtered.detected === true) this.refreshEventThumbnail();
      return;
    }

    // classifier is multi-provider, buffer keying needs the owning pluginId
    let pluginId: string | undefined;
    if (sensorType === SensorType.Classifier) {
      pluginId = this.plugins.getAll(SensorType.Classifier).find((p) => p.sensorId === sensorId)?.pluginId;
    }

    const filtered = this.applyExternalDetectionFilters(sensorType, properties);
    this.ingestDetectionResult(sensorType, sensorId, filtered, pluginId);
    this.eventManager.processResults(this.buildSnapshot());
  }

  @RPCMethod
  public reportSensorTrigger(sensorId: string, triggerType: string, action: 'activate' | 'deactivate', _sustained: boolean, timeoutSeconds: number): void {
    // namespaced so trigger dwells don't overwrite the sensor's own detected/blocked
    const dwellKey = `trigger:${sensorId}`;

    if (action === 'activate') {
      this.activeSensorTriggerTypes.set(dwellKey, triggerType);
    }

    this.dwell.refresh(dwellKey, timeoutSeconds);

    if (action === 'activate' && this.cascadeEnabled) {
      // trigger edges never repeat, the cascade covers the trigger's dwell
      this.cascade.triggerMomentary(Math.max(timeoutSeconds, this.cascadeTimeoutSeconds));
    }

    this.eventManager.processResults(this.buildSnapshot());

    // no loop frame to encode from, a no-op if already captured
    if (action === 'activate') {
      this.thumbnailer.fetchEventThumbnailAsync();
    }
  }

  @RPCMethod
  public reconcileSensorTriggers(activeSensorIds: readonly string[]): void {
    const activeSet = new Set(activeSensorIds);
    for (const dwellKey of this.activeSensorTriggerTypes.keys()) {
      const sensorId = dwellKey.slice('trigger:'.length);
      if (!activeSet.has(sensorId)) {
        this.activeSensorTriggerTypes.delete(dwellKey);
        this.dwell.clear(dwellKey);
      }
    }
  }

  @RPCMethod
  public hasPlugin(sensorType: SensorType): boolean {
    return this.plugins.has(sensorType);
  }

  private get windowAnchorsWanted(): boolean {
    return this.plugins.get(SensorType.Object)?.requiresFrames === true || this.plugins.hasEligibleObjectAssist();
  }

  private get localizerWanted(): boolean {
    // a smart-camera object sensor feeds externally and needs the anchors too, for assist windows and moment pictures
    if (this.plugins.has(SensorType.Object) || this.plugins.hasEligibleObjectAssist()) return true;
    for (const sensorType of this.feedingSensors.values()) {
      if (sensorType === SensorType.Object) return true;
    }
    return false;
  }

  private get windowWantsMainStream(): boolean {
    if (!this.cascade.isActive) return false;
    if (this.anchorBoxes.length === 0 && this.trackAnchorBoxes.length === 0) return false;
    return this.windowAnchorsWanted;
  }

  private get cascadeEnabled(): boolean {
    return this.config.detectionSettings.cascadeDetection !== false;
  }

  private get cascadeTimeoutSeconds(): number {
    return this.config.detectionSettings.cascadeTimeout ?? DEFAULT_CASCADE_TIMEOUT;
  }

  private get motionResolution() {
    return this.config.detectionSettings.motion.resolution;
  }

  private get videoAspectRatio(): number {
    const [w, h] = this.config.interfaceSettings.aspectRatio.split(':').map(Number);
    return w / h;
  }

  private get mainStreamAvailable(): boolean {
    if (!this.thumbnailer.hasMainStream) return false;
    return this.mainStreamWanted;
  }

  private get mainStreamWanted(): boolean {
    return this.config.frameWorkerSettings.mainStreamAnalysis === true || hardwareDecodingAvailable(this.config.frameWorkerSettings.decoder, this.logger);
  }

  private get mainStreamSourceWanted(): boolean {
    return this.mainStreamWanted && (this.config.streamHot === true || this.loopRunning);
  }

  private externalObjectSpanActive(): boolean {
    // a smart-camera object sensor lives in the feeding set, its dwell keeps the span open between report edges
    if (this.plugins.get(SensorType.Object)?.requiresFrames) return false;
    for (const [sensorId, sensorType] of this.feedingSensors) {
      if (sensorType === SensorType.Object && this.dwell.isActive(sensorId)) return true;
    }
    return false;
  }

  private handleCascadeDeactivated(): void {
    this.anchorBoxes = [];
    this.farewellBoxes = [];
    this.detectionWindow.reset();

    // cascade-gated slots only, motion and audio stay
    const cs = this.currentDetectionState;
    cs.object = undefined;
    cs.face = undefined;
    cs.licensePlate = undefined;
    cs.classifiers = undefined;
    cs.clip = undefined;
    cs.lineCrossings = undefined;
    cs.cascadeTriggered = undefined;

    // publish empty detections so the UI clears stale bboxes
    const clearTargets: string[] = [];
    for (const type of [SensorType.Object, SensorType.Face, SensorType.LicensePlate]) {
      const plugin = this.plugins.get(type);
      if (plugin) clearTargets.push(plugin.sensorId);
    }
    for (const plugin of this.plugins.getAll(SensorType.Classifier)) {
      clearTargets.push(plugin.sensorId);
    }

    this.clearFaceIdentities();
    this.secondaries.forgetUntrackedFaces();
    this.platesSeen.clear();
    this.classifierLabels.clear();
    const faceSensorId = this.plugins.get(SensorType.Face)?.sensorId;
    const plateSensorId = this.plugins.get(SensorType.LicensePlate)?.sensorId;
    const classifierSensorIds = new Set(this.plugins.getAll(SensorType.Classifier).map((p) => p.sensorId));
    for (const sensorId of clearTargets) {
      this.writeSensorProperties(sensorId, {
        detected: false,
        detections: [],
        ...(sensorId === faceSensorId ? { identities: [] } : {}),
        ...(sensorId === plateSensorId ? { plates: [] } : {}),
        ...(classifierSensorIds.has(sensorId) ? { labels: [] } : {}),
      });
      this.secondaryBboxSeen.delete(sensorId);
    }

    // segment ends here, the event itself continues while motion is active
    this.eventManager.processResults(this.buildSnapshot());
  }

  private clearFaceIdentities(): void {
    this.faceIdentities.clear();
    this.faceIdentitiesClearedAt = Date.now();
  }

  private handleEventEnded(): void {
    this.activeSensorTriggerTypes.clear();
    this.currentDetectionState = {};
  }

  private handleAudioLoopResult(sensorId: string, result: AudioResult): void {
    // only the cascade trigger lives here, the audio dwell is handled in ingest
    if (result.detected && this.cascadeEnabled) {
      this.cascade.triggerMomentary(this.config.detectionSettings.audio.timeout);
    }

    this.ingestDetectionResult(SensorType.Audio, sensorId, {
      detected: result.detected,
      detections: result.detections ?? [],
      ...(result.decibels !== undefined ? { decibels: result.decibels } : {}),
    });
  }

  private recordWitness(sensorId: string, properties: Record<string, unknown>): void {
    if (properties.detected !== true) {
      this.witnessLabels.delete(sensorId);
      return;
    }
    const detections = (properties.detections as { label?: string }[] | undefined) ?? [];
    const labels = new Set<string>();
    for (const detection of detections) {
      const label = detection.label?.toLowerCase();
      if (label && this.pipeline.objectLabelAllowed(label)) labels.add(label);
    }
    // cameras re-send labels on every push, news is a detectable label new to this sensor and the world
    const previous = this.witnessLabels.get(sensorId);
    const detectable = this.config.detectionSettings.object.confidences;
    if ([...labels].some((label) => !previous?.has(label) && label in detectable && !this.liveLabels.has(label))) {
      this.detectionWindow.oweLook('witness');
    }
    this.witnessLabels.set(sensorId, labels);
    if (labels.size === 0) return;
    const at = Date.now();
    for (const label of labels) {
      this.pipeline.attest(label, at);
      this.witnessSeen.set(label, at);
    }
    this.logger.trace(`[witness] ${[...labels].join(', ')}`);
  }

  private writeSensorProperties(sensorId: string, properties: Record<string, unknown>): void {
    const now = Date.now();
    let written = this.emptyWrittenAt.get(sensorId);
    let sent = properties;
    for (const [property, value] of Object.entries(properties)) {
      if (!Array.isArray(value) || value.length > 0) {
        written?.delete(property);
        continue;
      }

      const at = written?.get(property);
      if (at !== undefined && now - at < EMPTY_WRITE_REFRESH_MS) {
        if (sent === properties) sent = { ...properties };
        delete sent[property];
        continue;
      }

      if (!written) this.emptyWrittenAt.set(sensorId, (written = new Map()));
      written.set(property, now);
    }
    if (Object.keys(sent).length === 0) return;

    const msg: SensorWriteMessage = {
      sensorId,
      properties: sent,
      timestamp: now,
      instanceId: this.config.session?.instanceId,
    };
    this.proxy.publish(NamespaceManager.sensorCameraViewNamespaces(this.config.cameraId).sensorWriteSubject, msg);
  }

  private buildSnapshot(at = Date.now()): ProcessedDetectionData {
    const cs = this.currentDetectionState;
    return {
      hasCascadeTrigger: this.cascade.isActive,
      hasOpenSpans: this.worldSpans.size > 0 || this.externalObjectSpanActive(),
      motion: cs.motion ? { detected: cs.motion.detected ?? false } : undefined,
      audio: cs.audio ? { detected: cs.audio.detected ?? false, detections: cs.audio.detections ?? [] } : undefined,
      cascadeTriggered: cs.cascadeTriggered,
      sensorTriggers: [...new Set(this.activeSensorTriggerTypes.values())],
      objects: cs.object?.detected ? cs.object.detections : [],
      faces: cs.face?.detections ?? [],
      facesAt: cs.faceAt,
      faceEmbeddingModel: cs.faceEmbeddingModel,
      plates: cs.licensePlate?.detections ?? [],
      platesAt: cs.licensePlateAt,
      plateVoting: this.plugins.get(SensorType.LicensePlate)?.requiresFrames === true,
      plateMinConfidence: this.config.detectionSettings.licensePlate?.ocrConfidence,
      plateMinLength: this.config.detectionSettings.licensePlate?.minLength,
      faceMinConfidence: this.config.detectionSettings.face?.confidence,
      classifiers: cs.classifiers ? Object.values(cs.classifiers).flatMap((c) => ((cs.classifiersAt ?? 0) - c.at <= SECONDARY_FRESH_MS ? c.detections : [])) : [],
      classifiersAt: cs.classifiersAt,
      clips: cs.clip?.embeddings ?? [],
      clipsAt: cs.clipAt,
      clipEmbeddingModel: cs.clipEmbeddingModel,
      thumbnails: undefined,
      lineCrossings: cs.lineCrossings,
      timestamp: at,
      segmentTimeout: 10,
      expectedEndTime: this.dwell.maxExpiry(),
      detectionZones: this.getNormalizedDetectionZones(),
    };
  }

  private pipelineZones(): ZoneConfig {
    return { motion: this.config.zones.motion, object: this.config.zones.object, privacy: this.config.zones.privacy };
  }

  private windowZones(): Point[][] {
    return this.config.zones.object.map((zone) => normalizePolygon(zone.points));
  }

  private getNormalizedDetectionZones(): NormalizedDetectionZone[] {
    const result: NormalizedDetectionZone[] = [];
    for (const zone of this.config.zones.object) {
      if (!zone.name) continue;
      result.push({ name: zone.name, points: normalizePolygon(zone.points) });
    }
    for (const zone of this.config.zones.alert) {
      if (!zone.name) continue;
      result.push({
        name: zone.name,
        points: normalizePolygon(zone.points),
        match: zone.match ?? 'contain',
        alertLabels: zone.labels.map((label) => label.toLowerCase()),
      });
    }
    return result;
  }

  private applyExternalDetectionFilters(sensorType: SensorType, properties: Record<string, unknown>): Record<string, unknown> {
    const raw = properties.detections;
    if (!Array.isArray(raw) || raw.length === 0) return properties;

    // the zone filter and the rust merge assume a box on every detection
    const detections = ensureDetectionBoxes(raw as { box?: BoundingBox }[]);
    // a label without coordinates gives no position, a zone cannot judge it before the assist ran
    const positioned = detections.filter((detection) => !isFullFrameBox(detection.box));
    const boxless = detections.filter((detection) => isFullFrameBox(detection.box)) as Detection[];

    let filtered: Detection[];
    let boxlessLabel: ZoneLabel | undefined;

    switch (sensorType) {
      case SensorType.Face:
        boxlessLabel = 'face';
        filtered = this.pipeline.runZoneFilterWithLabel(positioned as FaceDetection[], 'face');
        break;
      case SensorType.LicensePlate:
        boxlessLabel = 'license_plate';
        filtered = this.pipeline.runZoneFilterWithLabel(positioned as LicensePlateDetection[], 'license_plate');
        break;
      case SensorType.Object:
        filtered = this.pipeline.runZoneFilter(positioned as Detection[]);
        break;
      case SensorType.Classifier:
      case SensorType.Motion:
        filtered = this.pipeline.runZoneFilter(positioned as Detection[]);
        break;
      default:
        return { ...properties, detections };
    }

    const survivors = new Set<unknown>(filtered);
    for (const detection of boxless) {
      if (this.pipeline.objectLabelAllowed(boxlessLabel ?? detection.label)) survivors.add(detection);
    }

    const kept = detections.filter((detection) => survivors.has(detection));

    return {
      ...properties,
      detections: kept,
      detected: kept.length > 0,
    };
  }

  private applyAudioConfidence(properties: Record<string, unknown>): Record<string, unknown> {
    const minConfidence = this.config.detectionSettings.audio.confidence ?? 0;
    if (minConfidence <= 0) return properties;

    const detections = properties.detections as Detection[] | undefined;
    if (!Array.isArray(detections) || detections.length === 0) return properties;

    const filtered = detections.filter((d) => (d.confidence ?? 0) >= minConfidence);
    if (filtered.length === detections.length) return properties;

    return { ...properties, detections: filtered, detected: filtered.length > 0 };
  }

  private ingestDetectionResult(sensorType: SensorType, sensorId: string, properties: Record<string, unknown>, pluginId?: string): void {
    if (sensorType === SensorType.Audio) {
      properties = this.applyAudioConfidence(properties);
    }

    this.updateBufferForType(sensorType, properties, pluginId);

    const detected = properties.detected === true;

    if (sensorType === SensorType.Motion && detected) {
      const motionTimeout = this.config.detectionSettings.motion.timeout;
      this.dwell.refresh(sensorId, motionTimeout);
      if (this.cascadeEnabled) {
        // a frame-based sensor re-arms every frame, an external one fires one edge that must arm the whole window
        const framePlugin = this.plugins.get(SensorType.Motion);
        const frameBased = framePlugin?.requiresFrames === true && framePlugin.sensorId === sensorId;
        this.cascade.triggerMomentary(frameBased ? this.cascadeTimeoutSeconds : Math.max(motionTimeout, this.cascadeTimeoutSeconds));
      }
    } else if (sensorType === SensorType.Audio && detected) {
      const audioTimeout = this.config.detectionSettings.audio.timeout;
      this.dwell.refresh(sensorId, audioTimeout);
      if (this.cascadeEnabled) {
        this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
      }
    } else if (sensorType === SensorType.Object) {
      const framePlugin = this.plugins.get(SensorType.Object);
      const frameBased = framePlugin?.requiresFrames === true && framePlugin.sensorId === sensorId;
      if (detected) {
        // anchored stationary tracks don't refresh the dwell, so parked objects can't hold events open
        const detections = (properties.detections as TrackedDetection[] | undefined) ?? [];
        if (detections.length > 0) {
          // an external report is an edge that holds until the camera reports the end, capped by the object timeout
          const dwellSeconds = frameBased ? OBJECT_DWELL_SECONDS : Math.max(this.config.detectionSettings.object.timeout ?? 15, OBJECT_DWELL_SECONDS);
          this.dwell.refresh(sensorId, dwellSeconds);
          // re-arm like motion, a time-based motion sensor (ONVIF cool-down) must not split the event
          if (this.cascadeEnabled) {
            this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
          }
        } else {
          // no segment opens, the UI still gets the bboxes via the publish below
          properties.detected = false;
          if (this.currentDetectionState.object) {
            this.currentDetectionState.object.detected = false;
            this.currentDetectionState.object.detections = [];
          }
        }
      } else if (!frameBased) {
        // the camera's end report closes the span, the segment linger bridges flicker
        this.dwell.clear(sensorId);
      }
    }

    // dwell owns detected/blocked/lastTriggered here, strip before publishing
    let publishProps = properties;
    if (sensorType === SensorType.Motion || sensorType === SensorType.Audio || sensorType === SensorType.Object) {
      const { detected: _d, blocked: _b, lastTriggered: _t, ...rest } = properties;
      publishProps = rest;
    }
    if (Object.keys(publishProps).length > 0) {
      this.writeSensorProperties(sensorId, publishProps);
    }

    if (sensorType === SensorType.Face || sensorType === SensorType.LicensePlate || sensorType === SensorType.Classifier) {
      const detections = (properties.detections as unknown[] | undefined) ?? [];
      if (detections.length > 0) {
        this.secondaryBboxSeen.set(sensorId, Date.now());
      } else {
        this.secondaryBboxSeen.delete(sensorId);
      }
    }
    // no EventManager tick here, processDetection flushes once per frame
  }

  private updateBufferForType(sensorType: SensorType, properties: Record<string, unknown>, pluginId?: string): void {
    const cs = this.currentDetectionState;
    const detections = (properties.detections as Detection[] | undefined) ?? [];
    const detected = properties.detected === true;

    switch (sensorType) {
      case SensorType.Motion:
        cs.motion = { detected, detections };
        break;
      case SensorType.Audio:
        cs.audio = {
          detected,
          detections,
          decibels: (properties.decibels as number | undefined) ?? cs.audio?.decibels,
        };
        break;
      case SensorType.Object:
        cs.object = { detected, detections };
        break;
      case SensorType.Face:
        cs.face = { detected, detections: detections as FaceDetection[] };
        cs.faceAt = Date.now();
        break;
      case SensorType.LicensePlate:
        cs.licensePlate = { detected, detections: detections as LicensePlateDetection[] };
        cs.licensePlateAt = Date.now();
        break;
      case SensorType.Classifier:
        if (pluginId) {
          cs.classifiersAt = Date.now();
          cs.classifiers ??= {};
          cs.classifiers[pluginId] = { detected, detections: detections as ClassifierDetection[], at: cs.classifiersAt };
        }
        break;
      case SensorType.Clip:
        cs.clip = { embeddings: (properties.embeddings as ClipEmbedding[] | undefined) ?? [], embeddingModel: cs.clipEmbeddingModel ?? '' };
        cs.clipAt = Date.now();
        break;
    }
  }

  private applyModelSpec(sensorId: string, sensorType: SensorType, modelSpec: AnyModelSpec): void {
    const current = this.plugins.get(sensorType);
    if (current?.sensorId !== sensorId) return;

    // another model means other numbers, a reload of the same model is no change
    if (sensorType === SensorType.Object || sensorType === SensorType.Motion) {
      if (modelIdentity(current.modelSpec) !== modelIdentity(modelSpec)) this.perf.reset();
    }

    this.plugins.updateModelSpec(sensorId, modelSpec);
  }

  private async registerDetectionPluginInternal(sensor: CoordinatorSensorInfo): Promise<void> {
    if (this.videoStopPromise) await this.videoStopPromise;
    await this.audioLoop.waitForStop();

    const wasVideoNeeded = this.plugins.shouldVideoBeActive();
    const wasAudioNeeded = this.plugins.shouldAudioBeActive();

    const namespaces = NamespaceManager.sensorProviderNamespaces(sensor.pluginId, sensor.sensorId);
    const sensorProxy = withNoResponderBackoff(
      withFrameBytes(
        this.proxy.createProxy<DetectionPluginInterface>(namespaces.sensorRpc, {
          // the next tick retries, the lib retry would stall the camera loop up to 3.5 s
          noResponderRetry: { maxRetries: 0 },
          onTiming: (_method, timing) => this.perf.trackTiming(sensor.sensorType, timing.handlerMs, timing.transportMs),
        }),
        (bytes) => this.perf.trackFrameBytes(sensor.pluginId, bytes),
      ),
    );

    const registered = this.plugins.register({
      pluginId: sensor.pluginId,
      sensorId: sensor.sensorId,
      sensorType: sensor.sensorType,
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
      proxy: sensorProxy,
    });
    if (!registered) {
      // a re-push: the sensor is live, only the spec may have changed
      if (sensor.modelSpec) this.applyModelSpec(sensor.sensorId, sensor.sensorType, sensor.modelSpec);
      return;
    }
    this.logger.trace(`Plugin registered: ${sensor.pluginId} for ${sensor.sensorType}`);

    if (!wasVideoNeeded && this.plugins.shouldVideoBeActive()) {
      this.adHocVideoLoop = false;
      this.startVideoLoop();
    }
    if (!wasAudioNeeded && this.plugins.shouldAudioBeActive()) {
      this.audioLoop.start();
    }

    if (this.cascade.isActive) {
      this.startAdHocVideoLoopIfNeeded();
    }
  }

  private async removeDetectionPluginBySensor(sensorId: string): Promise<void> {
    const wasVideoNeeded = this.plugins.shouldVideoBeActive();
    const wasAudioNeeded = this.plugins.shouldAudioBeActive();

    const removed = this.plugins.removeBySensor(sensorId);
    if (removed.length === 0) return;
    for (const plugin of removed) {
      this.logger.trace(`Plugin unregistered: ${plugin.pluginId} (${plugin.sensorType})`);
    }

    if (!this.plugins.has(SensorType.Object)) {
      this.adHocVideoLoop = false;
    }

    // needsAdHocLoop, not shouldVideoBeActive: a frame-based object plugin's loop must survive hot-reloads
    if (this.adHocVideoLoop && !this.plugins.needsAdHocLoop()) {
      this.adHocVideoLoop = false;
      this.logger.debug('Stopping ad-hoc video loop — last frame-based consumer removed');
      this.stopVideoLoop();
    }

    // await, or a quick re-register starts a second loop while the old one shuts down
    if (wasVideoNeeded && !this.plugins.shouldVideoBeActive() && !this.adHocVideoLoop) {
      await this.stopVideoLoop();
    }
    if (wasAudioNeeded && !this.plugins.shouldAudioBeActive()) {
      await this.audioLoop.stop();
    }
  }

  private handleSuppressionActivated(): void {
    const cs = this.currentDetectionState;
    cs.motion = undefined;
    cs.object = undefined;

    // motion and face/lpd boxes would float frozen through the pan, object keeps publishing live
    const motionPlugin = this.plugins.get(SensorType.Motion);
    if (motionPlugin) this.writeSensorProperties(motionPlugin.sensorId, { detections: [] });
    for (const type of [SensorType.Face, SensorType.LicensePlate]) {
      const plugin = this.plugins.get(type);
      if (plugin) this.clearSecondaryBboxes(plugin.sensorId);
    }
    for (const plugin of this.plugins.getAll(SensorType.Classifier)) {
      this.clearSecondaryBboxes(plugin.sensorId);
    }

    this.pipeline.notifyCameraMove();
  }

  private clearSecondaryBboxes(sensorId: string): void {
    // secondaries only run while objects are tracked, nothing else writes the false edge
    this.writeSensorProperties(sensorId, { detected: false, detections: [] });
    this.secondaryBboxSeen.delete(sensorId);
  }

  private clearStaleSecondaryBboxes(): void {
    if (this.secondaryBboxSeen.size === 0) return;
    const now = Date.now();
    for (const [sensorId, ts] of this.secondaryBboxSeen) {
      if (now - ts > SECONDARY_BBOX_TTL_MS) {
        this.clearSecondaryBboxes(sensorId);
      }
    }
  }

  private startVideoLoop(): void {
    if (this.loopRunning || this.videoStopPromise) return;

    this.logger.debug('Starting video detection loop');
    this.loopRunning = true;
    this.emptyWrittenAt.clear();
    this.thumbnailer.sync(this.mainStreamSourceWanted);
    this.loopPromise = this.runDetectionLoop();
  }

  private async stopVideoLoop(): Promise<void> {
    if (!this.loopRunning) {
      if (this.videoStopPromise) await this.videoStopPromise;
      return;
    }

    this.logger.debug('Stopping video detection loop');
    this.loopRunning = false;
    this.worldSpans.clear();
    this.mainStreamActive = false;
    this.idleSince = 0;
    this.thumbnailer.sync(this.mainStreamSourceWanted);

    const doStop = async () => {
      await this.frameSource.detach();
      await this.loopPromise;
      this.loopPromise = undefined;
    };

    this.videoStopPromise = doStop();
    try {
      await this.videoStopPromise;
    } finally {
      this.videoStopPromise = undefined;
    }
  }

  private startAdHocVideoLoopIfNeeded(): void {
    // an external object sensor alone does not start it, without a frame plugin nobody reads the frames
    if (!this.loopRunning && (this.plugins.needsAdHocLoop() || this.plugins.hasEligibleObjectAssist())) {
      this.adHocVideoLoop = true;
      this.logger.debug('Starting ad-hoc video loop for sensor cascade trigger');
      this.startVideoLoop();
    }
  }

  private stopAdHocVideoLoopIfIdle(): void {
    if (!this.adHocVideoLoop || this.plugins.shouldVideoBeActive()) return;
    // frames are needed all event, closing the decoder mid-event starves the hw device (vaapi surface sync)
    if (this.cascade.isActive || this.dwell.hasActive() || this.eventManager.hasActiveSegment()) return;
    this.adHocVideoLoop = false;
    this.logger.debug('Stopping ad-hoc video loop — idle');
    this.stopVideoLoop();
  }

  private async runDetectionLoop(): Promise<void> {
    // the source reconnects on its own, nextFrame waits it out
    const startedAt = Date.now();
    await this.frameSource.start();

    let lastFrameId = -1;
    let seenGeneration = -1;
    let firstFrame = true;

    while (this.loopRunning) {
      const tickStart = Date.now();
      const objectFramesBefore = this.perf.framesWithObjects;
      let onMainStream = false;
      const snap = await this.frameSource.nextFrame(lastFrameId);
      if (!snap) break;

      if (firstFrame) {
        firstFrame = false;
        this.logger.debug(`Analysing after ${Date.now() - startedAt}ms`);
      }

      lastFrameId = snap.id;

      if (this.benchmarkRunning) {
        // the detector is saturated on purpose, real frames would distort the measurement
        snap.frame[Symbol.dispose]?.();
        await sleep(IDLE_TICK_MS);
        continue;
      }

      try {
        if (this.frameSource.generation !== seenGeneration) {
          seenGeneration = this.frameSource.generation;
          // a fresh connection brings its own hardware context and resolution
          this.frameScaler.updateHardwareContext(this.frameSource.hardwareContext);
          this.frameScaler.clearCache();
          this.thumbnailer.sync(this.mainStreamSourceWanted);
          this.localizer.reset();
          this.detectionWindow.reset();
        }

        // motion always reads the low stream, a resolution switch would reset its background model
        const analysis = await this.acquireAnalysisFrame(snap);
        onMainStream = analysis.isMainStream;
        detectionRecord.setFrame(analysis.isMainStream ? 'main' : 'low', analysis.frame.width, analysis.frame.height, analysis.rtp, analysis.role);
        try {
          await this.processRawFrame(analysis, snap.frame);
        } finally {
          try {
            if (this.hqUpgrade) {
              this.hqUpgrade.frame[Symbol.dispose]?.();
              this.hqUpgrade = undefined;
            }
            if (analysis.frame !== snap.frame) analysis.frame[Symbol.dispose]?.();
          } catch {
            // ignore
          }
        }

        this.updateStreamState();
      } catch (error) {
        this.logger.error('Detection tick failed:', error);
      } finally {
        try {
          snap.frame[Symbol.dispose]?.();
        } catch {
          // ignore
        }
      }

      this.collectDecodeStats();

      // activity, not stream choice: cameras without main-stream analysis still count as active
      if (this.worldSpans.size > 0 || this.eventManager.hasActiveSegment()) this.perf.activeTicks++;
      else this.perf.idleTicks++;
      this.perf.report(this.logger);

      const workMs = Date.now() - tickStart;
      const remaining = (this.mainStreamActive ? ACTIVE_TICK_MS : IDLE_TICK_MS) - workMs;
      if (remaining > 0) await sleep(remaining);
      const tickMs = Date.now() - tickStart;
      this.perf.loopMs += tickMs;
      if (this.perf.framesWithObjects > objectFramesBefore) {
        this.perf.objectWorkMs += workMs;
        this.perf.objectLoopMs += tickMs;
      }
      if (onMainStream) {
        this.perf.mainTicks++;
        this.perf.mainLoopMs += tickMs;
      }
    }

    await this.frameSource.detach();
    this.frameScaler.clearCache();
    this.logger.debug('Detection loop ended');
  }

  private async acquireAnalysisFrame(snap: Pick<FrameSnap, 'frame' | 'rtp'>): Promise<AnalysisFrame> {
    if (this.mainStreamActive) {
      try {
        const main = await this.thumbnailer.acquireHqFrame(0);
        if (main) {
          return { frame: main.frame, scaler: main.scaler, isMainStream: true, rtp: main.rtp, role: this.thumbnailer.mainStreamRole };
        }
      } catch (error) {
        this.logger.debug('Main stream frame unavailable:', error);
      }
    }

    return { frame: snap.frame, scaler: this.frameScaler, isMainStream: false, rtp: snap.rtp, role: this.config.streamRole };
  }

  private async acquireOpeningHqFrame(): Promise<AnalysisFrame | undefined> {
    if (!this.mainStreamAvailable) return undefined;
    try {
      const main = await this.thumbnailer.acquireHqFrame(0);
      if (main) {
        return { frame: main.frame, scaler: main.scaler, isMainStream: true, rtp: main.rtp, role: this.thumbnailer.mainStreamRole };
      }
    } catch (error) {
      this.logger.debug('HQ frame unavailable for the opening tick:', error);
    }
    return undefined;
  }

  private refreshEventThumbnail(): void {
    if (!this.eventManager.hasActiveEvent()) return;
    const now = Date.now();
    // each shot decodes the main stream, a report burst needs only one
    if (!this.eventManager.needsThumbnail() && now - this.lastThumbnailRefreshAt < THUMBNAIL_REFRESH_MIN_MS) return;
    this.lastThumbnailRefreshAt = now;
    this.thumbnailer.fetchEventThumbnailAsync();
  }

  private updateStreamState(): void {
    if (this.worldSpans.size > 0 || this.eventManager.hasActiveSegment() || this.windowWantsMainStream) {
      this.idleSince = 0;
      if (!this.mainStreamActive && this.mainStreamAvailable) {
        this.mainStreamActive = true;
        this.perf.switches++;
        this.logger.debug('Analysis switched to the main stream');
      }
      return;
    }

    if (!this.mainStreamActive) return;

    if (this.idleSince === 0) {
      this.idleSince = Date.now();
    } else if (Date.now() - this.idleSince >= MAIN_STREAM_HOLD_MS) {
      this.mainStreamActive = false;
      this.idleSince = 0;
      this.perf.switches++;
      this.logger.debug('Analysis back on the low-resolution stream');
    }
  }

  private finishTrace(trace: TraceTick, analysis: AnalysisFrame, results: DetectionResults): TraceTick {
    trace.rtp = analysis.rtp;
    trace.src = traceSource(analysis.role);
    trace.attrs = traceAttributes(results);
    if (results.faceTrace?.faceSearch?.length) trace.faceSearch = results.faceTrace.faceSearch;
    if (results.faceTrace?.doubt?.length) trace.doubt = results.faceTrace.doubt;
    const witness = [...this.witnessSeen].filter(([, at]) => Math.abs(trace.tMs - at) <= WITNESS_WINDOW_MS).map(([label]) => label);
    if (witness.length > 0) trace.witness = witness;
    detectionRecord.tick({ ...trace });
    return trace;
  }

  private async processRawFrame(analysis: AnalysisFrame, motionRawFrame: Frame): Promise<void> {
    if (!this.loopRunning || !this.plugins.hasAny()) return;

    try {
      await this.processDetection(analysis, motionRawFrame);
    } catch (error) {
      this.logger.error('Detection processing error:', error);
    }
  }

  private async processDetection(analysis: AnalysisFrame, motionRawFrame: Frame): Promise<void> {
    const t0 = Date.now();
    let motionDetected = false;
    let objectDetections: Detection[] = [];
    let staticDetections: TrackedDetection[] = [];
    let trainingExtras: Detection[] = [];
    let trainingSuggestions: TrainingSuggestion[] = [];
    const results: DetectionResults = { timestamp: t0 };
    let trace: TraceTick | undefined;

    // while the PTZ repositions motion and object keep running, nothing reaches dwell or events
    const ptzSuppressed = this.ptzAutotracker.suppressionActive;
    const ptzEnded = this.ptzWasSuppressed && !ptzSuppressed;
    if (ptzEnded) this.detectionWindow.oweLook('ptz');
    this.ptzWasSuppressed = ptzSuppressed;
    this.ptzEndPending ||= ptzEnded;

    // the cascade gates object detection, not motion
    const motionPlugin = this.plugins.get(SensorType.Motion);

    if (motionPlugin?.requiresFrames) {
      // motion keeps its own rate, a background diff gains nothing from the active tick speed
      const motionDue = t0 - this.lastMotionAt >= MOTION_INTERVAL_MS - TICK_SLACK_MS;
      const motionScaleStart = Date.now();
      const motionFrame = motionDue ? await this.scaleForMotion(motionRawFrame) : undefined;
      if (motionDue) {
        this.perf.motionScaleMs += Date.now() - motionScaleStart;
        this.perf.motionScaleCount++;
      }
      if (!this.loopRunning) return;
      if (motionFrame) {
        this.lastMotionAt = t0;
        if (this.localizerWanted) this.feedLocalizer(motionFrame, t0, ptzSuppressed);
        try {
          const motionInferStart = Date.now();
          const result = await motionPlugin.proxy.detectMotion(motionFrame);
          this.perf.motionMs += Date.now() - motionInferStart;
          this.perf.motionCount++;
          if (!this.loopRunning) return;
          if (ptzSuppressed) {
            // results discarded, skipping frames would leave a stale background that lights up the scene after the move
          } else if (result.detections.length > 0) {
            const filtered = this.pipeline.runMergeAndZoneFilter(ensureDetectionBoxes(result.detections));
            motionDetected = filtered.length > 0;
            results.motion = { ...result, detections: filtered };
            trace = motionTrace(t0, filtered);
          } else {
            // record empty so the UI clears stale bboxes
            results.motion = { detected: false, detections: [] };
          }
        } catch (error) {
          if (!this.loopRunning || isNoRespondersError(error)) return;
          this.logger.error('Motion detection error:', error);
        }
      }
    } else if (this.cascade.isActive) {
      // no frame-based motion plugin, the cascade is the only motion-equivalent signal
      motionDetected = true;
      results.cascadeTriggered = true;

      // the localizer scales its own gray here, nobody else needed one
      const localizeDue = t0 - this.lastLocalizeAt >= MOTION_INTERVAL_MS - TICK_SLACK_MS;
      if (localizeDue && this.localizerWanted) {
        const scaleStart = Date.now();
        const gray = await this.scaleForMotionInput(motionRawFrame);
        this.perf.motionScaleMs += Date.now() - scaleStart;
        this.perf.motionScaleCount++;
        if (!this.loopRunning) return;
        if (gray) this.feedLocalizer(gray, t0, ptzSuppressed);
      }
    }

    // detected is re-derived after zone filtering, the plugin's own flag is ignored
    if (results.motion && motionPlugin) {
      this.ingestDetectionResult(SensorType.Motion, motionPlugin.sensorId, {
        detected: motionDetected,
        detections: results.motion.detections,
      });
    }

    // cascade-gated, but runs during PTZ suppression so the tracker holds its lock across pans
    const objectPlugin = this.plugins.get(SensorType.Object);
    const shouldDetectObjects = objectPlugin?.requiresFrames === true && (ptzSuppressed || !this.cascadeEnabled || this.cascade.isActive);

    if (shouldDetectObjects) {
      try {
        // a run that threw left its plan behind
        if (this.detectionWindow.takePlan()) this.detectionWindow.lookFailed();
        const detected = await this.runObjectDetection(objectPlugin, analysis, results.motion?.detections ?? []);
        const plan = this.detectionWindow.takePlan();
        if (plan) detectionRecord.plan(plan);
        if (!this.loopRunning) return;
        if (plan && !detected) this.detectionWindow.lookFailed();
        if (detected) {
          this.trackDetectionCadence();

          // run even on empty frames so Norfair advances its Kalman state
          const poseDelta = this.ptzAutotracker.consumePoseDelta();
          const postStart = Date.now();
          const pipelineResult = this.pipeline.process(detected, poseDelta, t0);
          this.perf.postMs += Date.now() - postStart;
          this.secondaries.noteWorld(pipelineResult, this.ptzEndPending);
          this.ptzEndPending = false;
          this.liveLabels = new Set([...pipelineResult.tracked, ...pipelineResult.staticTracks].map((t) => t.label));
          trace = { ...pipelineResult.trace, motion: trace?.motion, ...windowTrace(plan) };
          this.lastWorldTickAt = t0;
          // the span-opening tick analysed the low stream, its picture work gets a one-off HQ decode
          if (this.updateWorldSpans(pipelineResult) && !analysis.isMainStream) {
            this.hqUpgrade = await this.acquireOpeningHqFrame();
          }
          await this.holdSightingMoments(pipelineResult, this.hqUpgrade ?? analysis, t0);
          await this.captureMoments(pipelineResult, this.hqUpgrade ?? analysis, t0);

          // the world only sees absence or a reappearance while it still receives ticks
          if (this.cascadeEnabled && (this.worldSpans.size > 0 || this.eventManager.hasActiveSegment())) {
            this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
          }

          if (pipelineResult.created.length > 0 || pipelineResult.removed.length > 0) {
            const born = pipelineResult.created.map((id) => {
              const t = pipelineResult.tracked.find((d) => d.trackId === id);
              return `${t?.label ?? 'unknown'}#${id}`;
            });
            const died = pipelineResult.removed.map((id) => `#${id}`);
            this.logger.trace(
              `[tracker] ${born.length ? `born: ${born.join(', ')}` : ''}${born.length && died.length ? ' — ' : ''}${died.length ? `died: ${died.join(', ')}` : ''}`,
            );
          }

          objectDetections = pipelineResult.tracked;
          results.object = { detected: objectDetections.length > 0, detections: objectDetections };
          staticDetections = pipelineResult.staticTracks;
          trainingExtras = pipelineResult.trainingExtras;
          trainingSuggestions = pipelineResult.trainingSuggestions;
          if (pipelineResult.crossings.length > 0) results.lineCrossings = pipelineResult.crossings;

          this.ptzAutotracker.handleObjectDetections(pipelineResult.tracked);

          // a track that just died gets one farewell look at its last position
          this.trackAnchorBoxes = objectDetections.map((t) => t.box);
          for (const id of pipelineResult.removed) {
            const last = this.lastTrackedById.get(id);
            if (last) this.farewellBoxes.push(last);
          }
          this.lastTrackedById = new Map(
            pipelineResult.tracked.filter((t): t is TrackedDetection & { trackId: number } => t.trackId !== undefined).map((t) => [t.trackId, t.box]),
          );
        }
      } catch (error) {
        if (!this.loopRunning || isNoRespondersError(error)) return;
        this.logger.error('Object detection error:', error);
      }
    }

    // tracker and autotracker are fed, everything event-facing stays quiet
    if (ptzSuppressed) {
      // boxes stay live in the UI through the move
      if (objectPlugin && results.object) {
        this.writeSensorProperties(objectPlugin.sensorId, { detections: results.object.detections, staticDetections });
      }
      // a chase must not end its own event, but suppressed frames never start the dwell
      if (objectPlugin && objectDetections.length > 0 && this.dwell.isActive(objectPlugin.sensorId)) {
        this.dwell.refresh(objectPlugin.sensorId, OBJECT_DWELL_SECONDS);
      }
      if (trace) this.eventManager.traceTick({ ...this.finishTrace(trace, analysis, results), suppressed: true });
      return;
    }

    if (results.lineCrossings && results.lineCrossings.length > 0) {
      for (const c of results.lineCrossings) {
        this.logger.trace(`Line crossing: ${c.label}#${c.trackId} crossed "${c.lineName}" dir=${c.direction} conf=${c.confidence.toFixed(2)}`);
      }
      this.currentDetectionState.lineCrossings = results.lineCrossings;
    }

    if (results.object && objectPlugin) {
      this.ingestDetectionResult(SensorType.Object, objectPlugin.sensorId, {
        detected: objectDetections.length > 0,
        detections: results.object.detections,
        staticDetections,
      });
    }

    if (!this.loopRunning) return;

    if (objectDetections.length > 0) {
      const images = this.hqUpgrade ?? analysis;
      const stillPersons = staticDetections.filter((d) => d.label === 'person');
      await this.runSecondariesAndThumbnails(images, objectDetections, results, stillPersons);
      if (!this.loopRunning) return;
      await this.captureAttributeMoment(results, images, t0);
    }

    if (!this.loopRunning) return;

    this.ingestResultsForAllSecondaries(results);
    this.clearStaleSecondaryBboxes();

    // one flush per frame, after detectors and thumbnails, so segment-start messages carry them
    if (!this.loopRunning) return;
    const snapshot = this.buildSnapshot(t0);
    if (staticDetections.length > 0) snapshot.staticObjects = staticDetections;
    if (trainingExtras.length > 0) snapshot.trainingExtras = trainingExtras;
    const suggestions = [...trainingSuggestions, ...(results.trainingSuggestions ?? [])];
    if (suggestions.length > 0) snapshot.trainingSuggestions = suggestions;
    if (results.thumbnails && results.thumbnails.length > 0) {
      snapshot.thumbnails = results.thumbnails;
    }
    if (trace) snapshot.trace = this.finishTrace(trace, analysis, results);

    // pre-encode so the event start message carries the thumbnail inline
    const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
    let hqThumbAttached = false;
    if (wantsEventThumb) {
      try {
        const thumbStart = Date.now();
        const thumb = await this.thumbnailer.captureEventThumbnail(this.hqUpgrade ?? analysis);
        this.perf.jpegMs += Date.now() - thumbStart;
        if (thumb.jpeg) snapshot.eventThumbnail = thumb.jpeg;
        hqThumbAttached = thumb.sharp;
      } catch (error) {
        this.logger.error('Event thumbnail generation error:', error);
      }
    }

    await this.attachTrainingFrame(snapshot, this.hqUpgrade ?? analysis);
    this.eventManager.processResults(snapshot);

    // a broken cascade re-arm chain would leave stale spans pinning the event open forever
    if (this.worldSpans.size > 0 && this.lastWorldTickAt > 0 && t0 - this.lastWorldTickAt > WORLD_TICK_STARVATION_MS) {
      this.logger.warn(`Dropping ${this.worldSpans.size} open object span(s): no tracker tick for ${Math.round((t0 - this.lastWorldTickAt) / 1000)}s`);
      this.worldSpans.clear();
    }

    // spans can outlive every trigger dwell, the event ends once spans, dwells and linger are quiet
    if (this.worldSpans.size === 0 && !this.dwell.hasActive() && !this.eventManager.hasActiveSegment()) {
      this.eventManager.forceEndActiveEvent();
    }

    // covers the window where the HQ source wasn't ready at event start
    if (wantsEventThumb && !hqThumbAttached) {
      this.thumbnailer.upgradeEventThumbnailAsync();
    }
  }

  private async runSecondariesAndThumbnails(
    analysis: AnalysisFrame,
    objectDetections: Detection[],
    results: DetectionResults,
    stillPersons: Detection[] = [],
  ): Promise<void> {
    if (objectDetections.length === 0) return;

    this.perf.objects += objectDetections.length;
    this.perf.framesWithObjects++;

    const secondaryStart = Date.now();
    await this.secondaries.detect(analysis.frame, analysis.scaler, objectDetections, results, {
      stillPersons,
      stamp: traceStamp(results.timestamp, analysis.rtp, analysis.role),
    });
    this.perf.secondaryMs += Date.now() - secondaryStart;

    try {
      const jpegStart = Date.now();
      results.thumbnails = await this.secondaries.generateThumbnails(analysis.frame, analysis.scaler, results);
      this.perf.jpegMs += Date.now() - jpegStart;
      this.perf.faces += results.face?.detections?.length ?? 0;
      this.perf.plates += results.licensePlate?.detections?.length ?? 0;
    } catch (error) {
      this.logger.error('Thumbnail generation error:', error);
    }
  }

  private ingestResultsForAllSecondaries(results: DetectionResults): void {
    if (results.face) {
      if (results.faceEmbeddingModel) {
        this.currentDetectionState.faceEmbeddingModel = results.faceEmbeddingModel;
      }
      const facePlugin = this.plugins.get(SensorType.Face);
      if (facePlugin) {
        // the crop path skips the plugin path's zone filter, so it applies here too
        const detections = this.pipeline.runZoneFilterWithLabel(results.face.detections, 'face');
        // no mid-segment clear: a turned-away head would flap the list
        for (const detection of detections) {
          // carried before a delete that landed during this tick
          if (this.secondaries.deletedSince(detection.identity, results.timestamp)) detection.identity = undefined;
          if (detection.identity) this.faceIdentities.add(detection.identity);
        }
        this.ingestDetectionResult(SensorType.Face, facePlugin.sensorId, {
          detected: detections.length > 0 && results.face.detected,
          detections,
          identities: [...this.faceIdentities].sort(),
        });
      }
    }
    if (results.licensePlate) {
      const lpdPlugin = this.plugins.get(SensorType.LicensePlate);
      if (lpdPlugin) {
        const detections = this.pipeline.runZoneFilterWithLabel(results.licensePlate.detections, 'license_plate');
        for (const detection of detections) {
          const plate = detection.plateText ? normalizePlateText(detection.plateText) || detection.plateText : '';
          if (plate) this.platesSeen.add(plate);
        }
        this.ingestDetectionResult(SensorType.LicensePlate, lpdPlugin.sensorId, {
          detected: detections.length > 0 && results.licensePlate.detected,
          detections,
          plates: [...this.platesSeen].sort(),
        });
      }
    }
    if (results.classifiers) {
      for (const [pluginId, classifierResult] of Object.entries(results.classifiers)) {
        const plugin = this.plugins.getAll(SensorType.Classifier).find((p) => p.pluginId === pluginId);
        if (plugin) {
          let seen = this.classifierLabels.get(plugin.sensorId);
          if (!seen) {
            seen = new Set<string>();
            this.classifierLabels.set(plugin.sensorId, seen);
          }
          for (const detection of classifierResult.detections) {
            const label = detection.subAttribute || detection.attribute || detection.label;
            if (label) seen.add(label);
          }
          this.ingestDetectionResult(
            SensorType.Classifier,
            plugin.sensorId,
            {
              detected: classifierResult.detected,
              detections: classifierResult.detections,
              labels: [...seen].sort(),
            },
            pluginId,
          );
        }
      }
    }
  }

  private snapshotWillStartEvent(snapshot: ProcessedDetectionData): boolean {
    if (this.eventManager.hasActiveEvent()) return false;
    if (snapshot.motion?.detected) return true;
    if (snapshot.audio?.detected) return true;
    if (snapshot.cascadeTriggered) return true;
    if ((snapshot.sensorTriggers?.length ?? 0) > 0) return true;
    if ((snapshot.lineCrossings?.length ?? 0) > 0) return true;
    return false;
  }

  private async attachTrainingFrame(snapshot: ProcessedDetectionData, analysis: AnalysisFrame): Promise<void> {
    if (!this.eventManager.hasActiveEvent() && !this.snapshotWillStartEvent(snapshot)) return;

    const value = (label: string, confidence: number, box: BoundingBox) => trainingValue(label, confidence, this.pipeline.threshold(label), box);
    const subjects: TrainingSubject[] = snapshot.objects
      .filter((d) => isTrainingSubject(d))
      .map((d) => ({ label: d.label, box: d.box, score: value(d.label, d.confidence, d.box) }));
    // fresh results only, a stale buffered one describes an older frame
    const now = Date.now();
    const facesFresh = snapshot.facesAt !== undefined && now - snapshot.facesAt <= SECONDARY_FRESH_MS;
    const platesFresh = snapshot.platesAt !== undefined && now - snapshot.platesAt <= SECONDARY_FRESH_MS;
    for (const face of facesFresh ? snapshot.faces : []) {
      if (face.box && !isFullFrameBox(face.box)) subjects.push({ label: 'face', box: face.box, score: TRAINING_ATTRIBUTE_BONUS });
    }
    for (const plate of platesFresh ? snapshot.plates : []) {
      if (plate.box && !isFullFrameBox(plate.box)) subjects.push({ label: 'license_plate', box: plate.box, score: TRAINING_ATTRIBUTE_BONUS });
    }
    for (const hint of snapshot.trainingSuggestions ?? []) {
      if (!isFullFrameBox(hint.box)) {
        subjects.push({ label: hint.label, box: hint.box, score: TRAINING_SUGGESTION_WEIGHT * value(hint.label, hint.confidence, hint.box), hint: true });
      }
    }
    if (!subjects.some((s) => !s.hint)) return;
    if (!this.eventManager.wantsTrainingFrame(subjects)) return;

    try {
      const start = Date.now();
      const jpeg = await analysis.scaler.frameToJPEG(analysis.frame, TRAINING_FRAME_MAX_WIDTH, TRAINING_FRAME_QUALITY);
      this.perf.jpegMs += Date.now() - start;
      if (jpeg) {
        snapshot.trainingFrame = jpeg;
        snapshot.trainingSubjects = subjects;
        snapshot.trainingDetector = this.plugins.get(SensorType.Object)?.pluginId;
      }
    } catch (error) {
      this.logger.debug('Training frame capture error:', error);
    }
  }

  private updateWorldSpans(result: PipelineResult): boolean {
    let opened = false;
    const suppressStatic = this.config.detectionSettings.object.suppressStatic ?? true;

    for (const event of result.events) {
      const obj = event.object;
      const recoveredRelevant = event.eventType === 'objectRecovered' && (obj.state !== 'stationary' || !suppressStatic);
      if (event.eventType === 'objectEntered' || event.eventType === 'objectWoke' || recoveredRelevant) {
        if (!this.worldSpans.has(obj.trackId)) opened = true;
        this.worldSpans.add(obj.trackId);
      } else if (event.eventType === 'objectDeparted' || event.eventType === 'objectLost' || (event.eventType === 'objectSettled' && suppressStatic)) {
        this.worldSpans.delete(obj.trackId);
      }
    }

    // a track that died without a paired close event must not leak its span
    for (const id of result.removed) {
      this.worldSpans.delete(id);
    }

    return opened;
  }

  private async holdSightingMoments(result: PipelineResult, analysis: AnalysisFrame, at: number): Promise<void> {
    for (const [trackId, held] of this.heldMoments) {
      if (at - held.capturedAt > HELD_MOMENT_MS) this.heldMoments.delete(trackId);
    }
    for (const id of result.removed) this.heldMoments.delete(id);
    if (this.witnessSensors.size === 0) return;

    const confirmed = new Set(result.created);
    for (const sighting of result.sightings) {
      // confirmed in the same tick: the regular moment cuts this frame anyway
      if (confirmed.has(sighting.trackId)) continue;
      const box: BoundingBox = { x: sighting.x, y: sighting.y, width: sighting.width, height: sighting.height };
      const rendered = await this.renderMoment({ subject: box, base: box }, analysis);
      if (!rendered) continue;
      const score = sighting.confidence * Math.sqrt(sighting.width * sighting.height);
      this.heldMoments.set(sighting.trackId, {
        ...momentPictures(rendered),
        capturedAt: at,
        score,
        rank: MOMENT_RANK_OBJECT,
        stream: analysis.isMainStream ? 'main' : 'low',
      });
    }
  }

  private async captureMoments(result: PipelineResult, analysis: AnalysisFrame, at: number): Promise<void> {
    let subject: WorldObject | undefined;
    let bestScore = -1;
    let trigger = '';

    for (const event of result.events) {
      const obj = event.object;
      // closing events report absence, there is nothing to show
      if (!MOMENT_EVENTS.has(event.eventType)) continue;
      // a tentative first sighting or a stationary recovery holds no span
      if (!this.worldSpans.has(obj.trackId)) continue;
      const score = obj.confidence * Math.sqrt(obj.width * obj.height);
      if (score > bestScore) {
        bestScore = score;
        subject = obj;
        trigger = event.eventType;
      }
    }

    // one frame per tick, not one per object: they share the picture
    if (!subject) return;
    // confirmed through a witness after its only sighting: the held picture shows it, the current frame does not
    const held = this.heldMoments.get(subject.trackId);
    this.heldMoments.delete(subject.trackId);
    if (held && trigger === 'objectEntered' && subject.lastSeenMs < at) {
      if (!this.eventManager.wantsMoment(held.rank, held.score, held.stream, at)) return;
      this.eventManager.offerMoment({ ...held, capturedAt: at, shownAt: held.capturedAt });
      return;
    }
    if (!this.eventManager.wantsMoment(MOMENT_RANK_OBJECT, bestScore, analysis.isMainStream ? 'main' : 'low', at)) return;
    await this.captureMoment(subject, bestScore, trigger, result.tracked, analysis, at);
  }

  private anchorMomentDetections(reported: Detection[]): Detection[] {
    const anchors = [...this.anchorBoxes, ...this.farewellBoxes];
    if (anchors.length === 0 || reported.length === 0) return [];
    const subject = reported.find((d) => d.label !== 'motion') ?? reported[0];
    const clusters = clusterBoxes(anchors);
    const largest = Math.max(...clusters.map((b) => b.width * b.height));
    // specks would drag the base union across the frame
    return clusters.filter((b) => b.width * b.height >= largest * 0.2).map((b) => ({ label: subject.label, confidence: subject.confidence, box: b }));
  }

  private async captureExternalMoment(detections: Detection[], analysis: AnalysisFrame, at: number): Promise<void> {
    let subject: Detection | undefined;
    let bestScore = 0;
    for (const detection of detections) {
      const box = detection.box;
      if (!box) continue;
      const score = detection.confidence * Math.sqrt(box.width * box.height);
      if (score > bestScore) {
        bestScore = score;
        subject = detection;
      }
    }
    if (!subject) return;
    if (!this.eventManager.wantsMoment(MOMENT_RANK_OBJECT, bestScore, 'low', at)) return;

    const target: MomentTarget = { subject: subject.box, base: unionBox(detections.map((d) => d.box).filter(Boolean)) };
    const rendered = await this.renderMoment(target, analysis);
    if (!rendered) return;

    this.eventManager.offerMoment({ ...momentPictures(rendered), capturedAt: at, score: bestScore, rank: MOMENT_RANK_OBJECT, stream: 'low' });
    await this.recordMoment(target, rendered, analysis, `${subject.label}-external`, bestScore, 'external', at);
  }

  private async captureMoment(subject: WorldObject, score: number, trigger: string, tracked: TrackedDetection[], analysis: AnalysisFrame, at: number): Promise<void> {
    const box: BoundingBox = { x: subject.x, y: subject.y, width: subject.width, height: subject.height };
    const moving = tracked.filter(isMovingTrack).map((d) => d.box);
    const target: MomentTarget = { subject: box, base: unionBox([box, ...moving]), hint: directionOf(subject.velocityX, subject.velocityY) };
    const rendered = await this.renderMoment(target, analysis);
    if (!rendered) return;

    const stream = analysis.isMainStream ? 'main' : 'low';
    this.eventManager.offerMoment({ ...momentPictures(rendered), capturedAt: at, score, rank: MOMENT_RANK_OBJECT, stream });
    await this.recordMoment(target, rendered, analysis, `${subject.label}-${subject.trackId}`, score, trigger, at);
  }

  private async captureAttributeMoment(results: DetectionResults, analysis: AnalysisFrame, at: number): Promise<void> {
    const candidates: AttributeMomentCandidate[] = [];

    // only a span-holding subject hands over a picture, a bystander must not anchor an unrelated event
    const spanHolder = (parentTrackId?: number) => parentTrackId !== undefined && this.worldSpans.has(parentTrackId);

    for (const face of results.face?.detections ?? []) {
      const f = face as TrackedFaceDetection;
      if (!spanHolder(f.parentTrackId ?? faceNote(f)?.shared)) continue;
      candidates.push({ label: `face:${f.identity ?? 'unknown'}`, box: f.box, parentBox: f.parentBox, confidence: f.confidence });
    }
    for (const plate of results.licensePlate?.detections ?? []) {
      const p = plate as TrackedLicensePlateDetection;
      if (!p.plateText || !spanHolder(p.parentTrackId)) continue;
      candidates.push({ label: `plate:${normalizePlateText(p.plateText)}`, box: p.box, parentBox: p.parentBox, confidence: p.confidence });
    }

    // one picture per tick, the most legible subject frames the shot
    let best: AttributeMomentCandidate | undefined;
    let bestScore = -1;
    for (const candidate of candidates) {
      const cut = results.thumbnails?.find((t) => t.label === candidate.label);
      // a subject cut off by the frame edge makes a poor card
      if (cut?.onEdge) continue;
      // a few-pixel face or plate carries nothing even at max upscale, it stays an attribute tile
      const areaPx = candidate.box.width * analysis.frame.width * candidate.box.height * analysis.frame.height;
      if (areaPx < MOMENT_ATTRIBUTE_MIN_AREA) continue;
      const score = candidate.confidence * Math.sqrt(candidate.box.width * candidate.box.height);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    // ask before cutting, the same face rides on every tick and re-encoding a loser costs
    if (!best || !this.eventManager.wantsMoment(MOMENT_RANK_ATTRIBUTE, bestScore, analysis.isMainStream ? 'main' : 'low', at)) return;

    // frame the whole person around the face, the zoomed face already exists as a tile
    const target: MomentTarget = {
      subject: best.box,
      base: best.parentBox ?? best.box,
      hint: best.parentBox ? directionBetween(best.box, best.parentBox) : undefined,
    };
    const rendered = await this.renderMoment(target, analysis);
    if (!rendered) return;

    const stream = analysis.isMainStream ? 'main' : 'low';
    this.eventManager.offerMoment({ ...momentPictures(rendered), capturedAt: at, score: bestScore, rank: MOMENT_RANK_ATTRIBUTE, stream });
    await this.recordMoment(target, rendered, analysis, best.label.replace(':', '-'), bestScore, 'attributeFound', at);
  }

  private async renderMoment(target: MomentTarget, analysis: AnalysisFrame, card?: Buffer): Promise<RenderedMoment | null> {
    const start = Date.now();
    const rendered = new Map<MomentFormatName, Buffer>();
    const windows: Partial<Record<MomentFormatName, CropWindow>> = {};
    // a card handed in was cut elsewhere, its window is not the one computed here
    const cut = new Set<MomentFormatName>();
    if (card) rendered.set('card', card);

    try {
      for (const format of MOMENT_FORMATS) {
        const window = momentWindow(target, analysis.frame.width, analysis.frame.height, format);
        if (!window) continue;
        windows[format.name] = window;
        if (rendered.has(format.name)) continue;
        const jpeg = await analysis.scaler.cropWindowToJPEG(analysis.frame, window, format.width, format.height, MOMENT_QUALITY);
        if (jpeg) {
          rendered.set(format.name, jpeg);
          cut.add(format.name);
        }
      }
    } catch (error) {
      this.logger.debug('Moment crop failed:', error);
    }
    this.perf.jpegMs += Date.now() - start;

    const strip = rendered.get('strip');
    if (!strip) return null;
    const { width, height } = analysis.frame;
    return {
      strip,
      card: rendered.get('card'),
      windows,
      stripWindow: windows.strip && cut.has('strip') ? normalizedWindow(windows.strip, width, height) : undefined,
      cardWindow: windows.card && cut.has('card') ? normalizedWindow(windows.card, width, height) : undefined,
    };
  }

  private async recordMoment(
    target: MomentTarget,
    rendered: RenderedMoment,
    analysis: AnalysisFrame,
    subjectName: string,
    score: number,
    trigger: string,
    at: number,
  ): Promise<void> {
    if (!detectionRecord.active) return;

    const stream = analysis.isMainStream ? 'main' : 'low';
    const detail = `${subjectName}_${stream}_s${score.toFixed(3)}`;
    try {
      const frameJpeg = await analysis.scaler.frameToJPEG(analysis.frame, analysis.frame.width, 85);
      detectionRecord.moment({
        at,
        trigger,
        score,
        subject: target.subject,
        base: target.base,
        windows: rendered.windows,
        pictures: {
          strip: detectionRecord.picture(at, 'moment', `strip_${detail}`, rendered.strip),
          card: rendered.card ? detectionRecord.picture(at, 'moment', `card_${detail}`, rendered.card) : undefined,
        },
        frame: frameJpeg ? detectionRecord.picture(at, 'frame', detail, frameJpeg) : undefined,
      });
    } catch (error) {
      this.logger.debug('Moment record failed:', error);
    }
  }

  private async scaleForMotion(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const motionPlugin = this.plugins.get(SensorType.Motion);
    if (!motionPlugin?.requiresFrames) return undefined;
    return this.scaleForMotionInput(rawFrame);
  }

  private async scaleForMotionInput(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const maxWidth = MOTION_WIDTH_MAP[this.motionResolution];
    const scaled = await this.frameScaler.scaleProportional(rawFrame, maxWidth, 'gray');
    return scaled ? this.frameScaler.toVideoFrameData(scaled) : undefined;
  }

  private feedLocalizer(gray: VideoFrameData, t0: number, ptzSuppressed: boolean): void {
    this.lastLocalizeAt = t0;

    const data = Buffer.isBuffer(gray.data) ? gray.data : Buffer.from(gray.data);
    const boxes = this.localizer.localize({ data, width: gray.width, height: gray.height });

    // during ego-motion the diff is garbage, feeding keeps the reference alive
    this.anchorBoxes = ptzSuppressed ? [] : boxes;
  }

  private async seedLocalizerReference(): Promise<void> {
    if (!this.loopRunning || !this.localizerWanted || !this.frameSource.decodeOldestKeyframe) return;

    try {
      const frame = await this.frameSource.decodeOldestKeyframe();
      if (!frame) return;
      try {
        const gray = await this.scaleForMotionInput(frame);
        if (gray) {
          const data = Buffer.isBuffer(gray.data) ? gray.data : Buffer.from(gray.data);
          this.localizer.seedReference({ data, width: gray.width, height: gray.height });
        }
      } finally {
        frame[Symbol.dispose]?.();
      }
    } catch (error) {
      this.logger.debug('Localizer reference seed failed:', error);
    }
  }

  private trackDetectionCadence(): void {
    const now = Date.now();
    const previous = this.lastObjectCallAt;
    this.lastObjectCallAt = now;

    const delta = now - previous;
    if (previous === 0 || delta > 5000) return;

    if (this.objectIntervalMs === 0) {
      this.objectIntervalMs = delta;
      this.objectIntervalSamples = 1;
      return;
    }

    if (delta > this.objectIntervalMs * CADENCE_OUTLIER_BAND || delta < this.objectIntervalMs / CADENCE_OUTLIER_BAND) {
      this.objectIntervalOutliers++;
      if (this.objectIntervalOutliers >= CADENCE_OUTLIER_RESEED) {
        this.objectIntervalMs = delta;
        this.objectIntervalSamples = 1;
        this.objectIntervalOutliers = 0;
      }
      return;
    }
    this.objectIntervalOutliers = 0;

    this.objectIntervalMs = this.objectIntervalMs * 0.8 + delta * 0.2;
    this.objectIntervalSamples++;
    if (this.objectIntervalSamples < CADENCE_MIN_SAMPLES) return;
  }

  private async scaleForObject(rawFrame: Frame, scaler: FrameScaler, lease?: OutputLease): Promise<PluginFrame | undefined> {
    const objectPlugin = this.plugins.get(SensorType.Object);
    if (!objectPlugin?.requiresFrames) return undefined;
    return this.scaleFrameForPlugin(rawFrame, objectPlugin, scaler, lease);
  }

  private async runObjectDetection(objectPlugin: RegisteredPlugin, analysis: AnalysisFrame, pluginMotionBoxes: Detection[]): Promise<WindowDetection[] | undefined> {
    const inputSpec = objectPlugin.modelSpec?.input;
    const motionAnchors = [...this.anchorBoxes, ...pluginMotionBoxes.map((d) => d.box).filter((box): box is BoundingBox => box !== undefined), ...this.farewellBoxes];
    this.farewellBoxes = [];

    const windows = isVideoInputSpec(inputSpec)
      ? this.detectionWindow.plan(motionAnchors, this.trackAnchorBoxes, analysis.frame.width, analysis.frame.height, inputSpec.width)
      : null;

    // this plugin's buffers only, assist and the secondary stage allocate their own
    const lease = analysis.scaler.leaseOutputs();

    if (windows && windows.length > 0) {
      this.perf.zoomTicks++;
      this.perf.zoomWindows += windows.length;
      detectionRecord.zoom({ kind: 'object', anchors: motionAnchors, tracks: this.trackAnchorBoxes, windows });
      const inferStart = Date.now();
      const perWindow = await lease.releaseAfter(
        Promise.all(windows.map((window) => this.detectInWindow(objectPlugin, analysis.frame, analysis.scaler, window, inputSpec as VideoInputSpec, lease))),
      );
      this.perf.objectMs += Date.now() - inferStart;
      this.perf.objectCount++;
      for (const window of perWindow) this.perf.scaleMs += window.cropMs;
      return mergeWindowDetections(perWindow.flatMap((window) => window.detections));
    }

    const scaleStart = Date.now();
    const objectFrame = await this.scaleForObject(analysis.frame, analysis.scaler, lease);
    this.perf.scaleMs += Date.now() - scaleStart;
    if (!objectFrame || !this.loopRunning) return undefined;

    const inferStart = Date.now();
    const result = await lease.releaseAfter(
      PromiseTimeout(objectPlugin.proxy.detectObjects(objectFrame.model), DETECT_TIMEOUT_MS, undefined, `Object detection timed out after ${DETECT_TIMEOUT_MS}ms`),
    );
    this.perf.objectMs += Date.now() - inferStart;
    this.perf.objectCount++;
    return FrameScaler.undoLetterbox(ensureDetectionBoxes(result.detections), objectFrame.geometry);
  }

  private async detectInWindow(
    plugin: RegisteredPlugin,
    frame: Frame,
    scaler: FrameScaler,
    window: BoundingBox,
    spec: VideoInputSpec,
    lease?: OutputLease,
  ): Promise<{ detections: WindowDetection[]; cropMs: number }> {
    const scaleStart = Date.now();
    const cropped = await scaler.cropToSpec(frame, window, spec, lease);
    const cropMs = Date.now() - scaleStart;
    if (!cropped) return { detections: [], cropMs };

    const result = await PromiseTimeout(
      plugin.proxy.detectObjects(scaler.toVideoFrameData(cropped.padded, 'model')),
      DETECT_TIMEOUT_MS,
      undefined,
      `Object detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
    const detections = FrameScaler.undoLetterbox(ensureDetectionBoxes(result.detections), cropped.geometry);
    // the crop snaps to the scaler grid, the box ends where the crop ends
    const seen = cropped.geometry.window ?? window;
    return { detections: detections.map((d) => (clippedBy(d.box, seen) ? { ...d, clipped: true } : d)), cropMs };
  }

  private async scaleFrameForPlugin(
    rawFrame: Frame,
    plugin: RegisteredPlugin,
    scaler: FrameScaler = this.frameScaler,
    lease?: OutputLease,
  ): Promise<PluginFrame | undefined> {
    const inputSpec = plugin.modelSpec?.input;
    if (!isVideoInputSpec(inputSpec)) return undefined;

    const letterboxed = await scaler.letterboxToSpec(rawFrame, inputSpec, lease);
    if (!letterboxed) return undefined;

    return {
      model: scaler.toVideoFrameData(letterboxed.padded, 'model'),
      tracking: scaler.toVideoFrameData(letterboxed.inner, 'tracking'),
      geometry: letterboxed.geometry,
    };
  }

  private ingestAssistedObjects(sensorId: string, objects: { detections: Detection[]; assisted: boolean }): void {
    if (!objects.assisted) return;
    // the assist returns raw detector output, merge like the frame path or near-duplicates inflate the count
    const merged = this.pipeline.runMergeAndZoneFilter(objects.detections);
    const refiltered = this.applyExternalDetectionFilters(SensorType.Object, {
      detected: merged.length > 0,
      detections: merged,
    });
    detectionRecord.tick({
      assistIngest: {
        raw: objects.detections.map((d) => ({ label: d.label, score: d.confidence, box: d.box })),
        merged: merged.length,
        kept: ((refiltered.detections as Detection[] | undefined) ?? []).length,
      },
    });
    this.ingestDetectionResult(SensorType.Object, sensorId, refiltered);
  }

  private async runObjectAssist(frame: Frame, reported: Detection[], scaler: FrameScaler = this.frameScaler): Promise<{ detections: Detection[]; assisted: boolean }> {
    if (!this.plugins.hasEligibleObjectAssist()) {
      return { detections: reported, assisted: false };
    }
    const assist = this.plugins.get(SensorType.ObjectAssist)!;

    try {
      const inferStart = Date.now();
      // the plugin delivers from its floor, only boxes above the user threshold replace the report
      const boxed = this.pipeline.aboveThreshold(await this.assistDetections(assist, frame, scaler, reported));
      this.perf.assistMs += Date.now() - inferStart;
      this.perf.assistCount++;
      const reportedLabels = new Set(reported.map((d) => d.label.toLowerCase()));
      const found = boxed.filter((d) => reportedLabels.size === 0 || reportedLabels.has(d.label.toLowerCase()));
      if (found.length === 0) return { detections: reported, assisted: false };
      return { detections: found, assisted: true };
    } catch (error) {
      if (isNoRespondersError(error)) return { detections: reported, assisted: false };
      this.logger.debug('Object assist failed:', error);
      return { detections: reported, assisted: false };
    }
  }

  private async assistDetections(assist: RegisteredPlugin, frame: Frame, scaler: FrameScaler, reported: Detection[]): Promise<Detection[]> {
    const inputSpec = assist.modelSpec?.input;
    const reportedBoxes = reported.map((d) => d.box).filter((box): box is BoundingBox => box !== undefined);

    // a coordinate-less report zooms into the diff anchors instead of letterboxing the whole frame
    const anchors = reportedBoxes.length > 0 ? reportedBoxes : [...this.anchorBoxes, ...this.farewellBoxes];
    const pad = reportedBoxes.length > 0 ? TRACK_PAD : MOTION_PAD;

    if (isVideoInputSpec(inputSpec) && anchors.length > 0) {
      const windows = planWindowsOnce(anchors, pad, frame.width, frame.height, inputSpec.width);
      if (windows.length > 0) {
        detectionRecord.zoom({ kind: 'assist', anchors, windows });
        const perWindow = await Promise.all(windows.map((window) => this.detectInWindow(assist, frame, scaler, window, inputSpec)));
        return mergeWindowDetections(perWindow.flatMap((window) => window.detections));
      }
    }
    detectionRecord.tick({
      assistFullFrame: { anchors: anchors.length, videoSpec: isVideoInputSpec(inputSpec), loop: this.loopRunning, cascade: this.cascade.isActive },
    });

    const scaled = await this.scaleFrameForPlugin(frame, assist, scaler);
    if (!scaled) return [];

    const result = await PromiseTimeout(assist.proxy.detectObjects(scaled.model), DETECT_TIMEOUT_MS, undefined, `Object assist timed out after ${DETECT_TIMEOUT_MS}ms`);
    return FrameScaler.undoLetterbox(ensureDetectionBoxes(result?.detections ?? []), scaled.geometry);
  }
}
