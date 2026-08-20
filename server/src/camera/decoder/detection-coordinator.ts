import { PromiseTimeout, sleep } from '@camera.ui/common/utils';
import { isNoRespondersError, RPCClass, RPCMethod } from '@camera.ui/rpc';
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
import { clusterBoxes, DetectionWindow, mergeWindowDetections, MOTION_PAD, planWindowsOnce, TRACK_PAD } from './detection-window.js';
import { DwellManager } from './dwell-manager.js';
import { DetectionEventManager, MOMENT_RANK_ATTRIBUTE, MOMENT_RANK_OBJECT } from './event-manager.js';
import { EventThumbnailer } from './event-thumbnailer.js';
import { FrameScaler } from './frame-scaler.js';
import { hardwareDecodingAvailable } from './hardware.js';
import { directionBetween, directionOf, MOMENT_FORMATS, MOMENT_QUALITY, momentWindow, unionBox } from './moment-crop.js';
import { MotionLocalizer } from './motion-localizer.js';
import { PerfTracker } from './perf-tracker.js';
import { normalizePlateText } from './plate-vote.js';
import { isVideoInputSpec, modelIdentity, PluginRegistry } from './plugin-registry.js';
import { PtzAutotracker } from './ptz/autotracker.js';
import { SecondaryStage } from './secondary-stage.js';
import { BufferedSource } from './sources/buffered-source.js';
import { FrameSource } from './sources/frame-source.js';
import { DETECT_TIMEOUT_MS, DETECTOR_METRIC_TYPES, ensureDetectionBoxes, isFullFrameBox, MOTION_WIDTH_MAP } from './types.js';

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
  PtzAutotrackSettings,
  TrackedDetection,
  VideoFrameData,
  VideoInputSpec,
  ZoneLabel,
} from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { CoordinatorSensorInfo, DetectionPluginInterface, DetectionResults } from '../../rpc/interfaces/detection.js';
import type { CameraDeviceInterface } from '../../rpc/interfaces/device.js';
import type { SensorWriteMessage } from '../../rpc/interfaces/sensor.js';
import type { LineCrossingEvent, PipelineResult, ZoneConfig } from './detection-pipeline.js';
import type { NormalizedDetectionZone, ProcessedDetectionData, TrackedFaceDetection, TrackedLicensePlateDetection } from './event-manager.js';
import type { LetterboxGeometry } from './frame-scaler.js';
import type { CropWindow, MomentFormatName, MomentTarget } from './moment-crop.js';
import type { AnyModelSpec, RegisteredPlugin } from './plugin-registry.js';
import type { AnalysisSource } from './sources/analysis-source.js';
import type { SnapshotConfig } from './sources/snapshot-fetcher.js';
import type { CoordinatorSourceUrl, DetectorInfo, FrameWorkerPerfSnapshot, ObjectBenchmarkResult } from './types.js';

export interface DetectionCoordinatorConfig {
  cameraId: string;
  streamUrl: string;
  snapshotUrl: string;
  audioStreamUrl: string;
  controllerSnapshotSourceId?: string;
  availableSources?: CoordinatorSourceUrl[];
  zones: CameraZones;
  detectionSettings: CameraDetectionSettings;
  ptzAutotrack: PtzAutotrackSettings;
  frameWorkerSettings: CameraFrameWorkerSettings;
  interfaceSettings: CameraUiSettings;
  nvrRpc?: string;
  // the analysis source is allowed to stay connected, so it holds packets while
  // nothing is happening instead of waiting for a keyframe on every trigger
  streamHot?: boolean;
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
}

const MOMENT_EVENTS = new Set(['objectEntered', 'objectWoke', 'objectRecovered', 'bestShotUpdated']);
const MOMENT_MOVING_SPEED = 0.05;
const MOMENT_ATTRIBUTE_MIN_AREA = 600;

const DEFAULT_CASCADE_TIMEOUT = 10;
const OBJECT_DWELL_SECONDS = 2;
const SECONDARY_BBOX_TTL_MS = 2000;
const CADENCE_MIN_SAMPLES = 5;
const CADENCE_OUTLIER_BAND = 2.5;
const CADENCE_OUTLIER_RESEED = 5;
const IDLE_TICK_MS = 200;
const ACTIVE_TICK_MS = 100;
const MOTION_INTERVAL_MS = 200;
const TICK_SLACK_MS = 20;
const MAIN_STREAM_HOLD_MS = 5000;
const EXTERNAL_FRAME_MAX_AGE_MS = 1000;

@RPCClass
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

  private readonly activeSensorTriggerTypes = new Map<string, string>();
  private readonly secondaryBboxSeen = new Map<string, number>();
  private readonly faceIdentities = new Set<string>();
  private readonly platesSeen = new Set<string>();
  private readonly classifierLabels = new Map<string, Set<string>>();
  private readonly feedingSensors = new Map<string, SensorType>();
  private readonly dwell = new DwellManager();
  private readonly privacy: PrivacyMask;

  // debugging
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
  private mainStreamActive = false;
  private idleSince = 0;
  private lastMotionAt = 0;

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
    licensePlate?: LicensePlateResult;
    classifiers?: Record<string, ClassifierResult>;
    clip?: ClipResult;
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
    this.secondaries = new SecondaryStage(this, this.plugins, this.pipeline, this.frameScaler, this.proxy, this.perf, logger);

    if (config.zones.lines.length > 0) {
      this.pipeline.updateLines(config.zones.lines, this.videoAspectRatio);
    }

    this.eventManager = new DetectionEventManager(config.cameraId, this.proxy, this.logger);
    this.eventManager.updateNvrRpc(config.nvrRpc);
    this.eventManager.onEventEnd(() => this.handleEventEnded());
    this.eventManager.onSegmentClosed(() => {
      if (!this.dwell.hasActive() && this.worldSpans.size === 0) {
        this.eventManager.forceEndActiveEvent();
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

    // debugging
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
      getFps: () => this.targetFps,
      onSuppressionActivated: () => this.handleSuppressionActivated(),
    });

    this.cascadeUnsubscribe = this.cascade.onChange((event) => {
      if (event.type === 'activated') {
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
    this.perf.reset();
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
      totalMs,
      perSecond: totalMs > 0 ? Math.round((completed / (totalMs / 1000)) * 10) / 10 : 0,
      handlerMs: completed > 0 ? Math.round((handlerMs / completed) * 10) / 10 : 0,
    };
  }

  public updateZoneConfig(zones: CameraZones): void {
    zones = normalizeZones(zones);
    this.config.zones = zones;
    this.pipeline.updateZones(this.pipelineZones());
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
  }

  public updateInterfaceSettings(settings: CameraUiSettings): void {
    this.config.interfaceSettings = settings;
    if (this.config.zones.lines.length > 0) {
      this.pipeline.updateLines(this.config.zones.lines, this.videoAspectRatio);
    }
  }

  public async dispose(): Promise<void> {
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
    this.classifierLabels.delete(sensorId);
    const sensorType = this.feedingSensors.get(sensorId);
    if (sensorType === SensorType.Face) this.faceIdentities.clear();
    if (sensorType === SensorType.LicensePlate) this.platesSeen.clear();
    if (sensorType !== undefined && this.feedingSensors.delete(sensorId)) {
      // a sensor removed mid-segment misses the cascade-end clear, so the
      // recognized lists must reset here or they survive the re-register
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
    // the registry only announces the plugin assigned for this type, everyone else reports into the void
    if (!this.feedingSensors.has(sensorId)) return;

    // a detector reports its spec again once its models finished loading
    if (properties.modelSpec) {
      this.applyModelSpec(sensorId, sensorType, properties.modelSpec as AnyModelSpec);
      if (Object.keys(properties).length === 1) return;
    }

    if (sensorType === SensorType.Object) {
      const filtered = this.applyExternalDetectionFilters(sensorType, properties);

      // presence feed keeps the autotracker's return-home timer alive even while
      // suppression gates everything below
      const externalDetections = (filtered.detections as Detection[] | undefined) ?? [];
      this.ptzAutotracker.handlePresenceDetections(externalDetections);

      if (this.ptzAutotracker.suppressionActive) return;

      detectionRecord.tick({
        externalObject: { detected: filtered.detected === true, count: ((filtered.detections as Detection[] | undefined) ?? []).length },
      });
      this.ingestDetectionResult(SensorType.Object, sensorId, filtered);
      this.eventManager.processResults(this.buildSnapshot());

      // re-shoot the event thumbnail: smart-camera reports arrive after the
      // motion-start shot, often before the subject fully entered the frame
      if (filtered.detected === true && this.eventManager.hasActiveEvent()) {
        this.thumbnailer.fetchEventThumbnailAsync();
      }

      // the camera reported the end (or zones dropped everything): nothing to
      // localize or crop, and an assist hit on leftover scene objects (a
      // parked car) would resurrect the span the camera just closed
      if (filtered.detected !== true) return;

      // assist alone is enough: its boxes upgrade zones, bboxes and thumbnails
      // even when no face/plate/clip secondary consumes them; without either,
      // the embedded diff's anchors can still localize a moment crop
      const hasAnchors = this.anchorBoxes.length > 0 || this.farewellBoxes.length > 0;
      if (!this.plugins.hasFrameBasedSecondary() && !this.plugins.hasEligibleObjectAssist() && !hasAnchors) return;
      if (this.processingExternalSecondary) return; // previous RPC still running

      this.processingExternalSecondary = true;
      try {
        const rawExternal = (filtered.detections as Detection[] | undefined) ?? [];

        const handle = await this.frameSource.getFrame(EXTERNAL_FRAME_MAX_AGE_MS);
        if (!handle) return;
        try {
          const results: DetectionResults = { timestamp: Date.now() };
          // anchors may have switched analysis to the main stream: the assist
          // windows and secondary crops should see those native pixels
          const analysis = await this.acquireAnalysisFrame(handle.frame);
          try {
            const objects = await this.runObjectAssist(analysis.frame, rawExternal, analysis.scaler);
            this.ingestAssistedObjects(sensorId, objects);

            if (objects.assisted) {
              // real boxes: crop the object like the frame pipeline, so face and
              // plate secondaries run on the subject instead of the whole scene
              // (processExternal only adapts the shape, external boxes get no real tracking)
              const objectDetections = this.pipeline.processExternal(objects.detections);
              detectionRecord.tick({ assistProcessed: { count: objectDetections.length, bufferedObjects: this.currentDetectionState.object?.detections?.length ?? 0 } });
              await this.runSecondariesAndThumbnails(analysis, objectDetections, results);
              await this.captureExternalMoment(objectDetections, analysis, results.timestamp);
              this.ingestResultsForAllSecondaries(results);
              const snapshot = this.buildSnapshot();
              detectionRecord.tick({ assistSnapshot: { objects: snapshot.objects.length } });
              if (results.thumbnails && results.thumbnails.length > 0) {
                snapshot.thumbnails = results.thumbnails;
              }
              this.eventManager.processResults(snapshot);
            } else {
              // no assist boxes: the diff's motion clusters are the only
              // localization, still better than a full-scene card
              const anchorDetections = this.anchorMomentDetections(rawExternal);
              if (anchorDetections.length > 0) {
                await this.captureExternalMoment(anchorDetections, analysis, results.timestamp);
              }
              const sceneJpeg = await this.secondaries.detectFullFrame(analysis.frame, results);
              try {
                results.thumbnails = await this.secondaries.generateThumbnails(analysis.frame, analysis.scaler, results);
              } catch (error) {
                this.logger.error('Thumbnail generation error:', error);
              }
              this.ingestResultsForAllSecondaries(results);
              const snapshot = this.buildSnapshot();
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
      this.ingestDetectionResult(SensorType.Motion, sensorId, filtered);
      this.eventManager.processResults(this.buildSnapshot());
      this.thumbnailer.fetchEventThumbnailAsync();
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

    // no loop frame to encode from, fetch async (no-op if already captured)
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
    // the registry only holds frame-based providers; a smart-camera object
    // sensor (Reolink AI, ONVIF) feeds externally and needs the anchors just
    // as much — for assist zoom windows and for framing its moment pictures
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

  private get targetFps(): number {
    return this.frameSource.fps;
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
    // the registry holds frame-based providers only; a smart-camera object
    // sensor (Reolink AI, ONVIF) lives in the feeding set, and its dwell is
    // what keeps the span open between its report edges
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

    // clear cascade-gated buffer slots, keep motion/audio
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

    this.faceIdentities.clear();
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

  private writeSensorProperties(sensorId: string, properties: Record<string, unknown>): void {
    const msg: SensorWriteMessage = {
      sensorId,
      properties,
      timestamp: Date.now(),
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
      faceEmbeddingModel: cs.faceEmbeddingModel,
      plates: cs.licensePlate?.detections ?? [],
      plateVoting: this.plugins.get(SensorType.LicensePlate)?.requiresFrames === true,
      plateMinConfidence: this.config.detectionSettings.licensePlate?.ocrConfidence,
      plateMinLength: this.config.detectionSettings.licensePlate?.minLength,
      faceMinConfidence: this.config.detectionSettings.face?.confidence,
      classifiers: cs.classifiers ? Object.values(cs.classifiers).flatMap((c) => c.detections) : [],
      clips: cs.clip?.embeddings ?? [],
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
    // a camera that reports a label without coordinates gives no position, a
    // zone cannot judge it and the object assist has not run yet
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
        return { ...properties, detections }; // audio etc, no zone filter
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
        // a frame-based motion sensor re-arms on every motion frame, so its
        // short tail is fine; an external sensor fires one edge and goes
        // quiet, that edge must arm the cascade for the whole belief window
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
        // the dwell bridges single missed frames; anchored stationary tracks
        // don't refresh it, so parked objects can't hold events open
        const detections = (properties.detections as TrackedDetection[] | undefined) ?? [];
        if (detections.length > 0) {
          // frame results re-arm every tick, so 2s only bridges a dropped
          // frame; an external report is an edge that must hold until the
          // camera reports the end (cleared below), capped by the object
          // timeout in case that end never arrives
          const dwellSeconds = frameBased ? OBJECT_DWELL_SECONDS : Math.max(this.config.detectionSettings.object.timeout ?? 15, OBJECT_DWELL_SECONDS);
          this.dwell.refresh(sensorId, dwellSeconds);
          // a confirmed object re-arms the cascade like motion does: a time-based
          // motion sensor (ONVIF cool-down) must not blind detection and split
          // the event while someone is still mid-frame
          if (this.cascadeEnabled) {
            this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
          }
        } else {
          // clear detected + buffer so no segment opens, the UI still gets
          // the bboxes via the property publish below
          properties.detected = false;
          if (this.currentDetectionState.object) {
            this.currentDetectionState.object.detected = false;
            this.currentDetectionState.object.detections = [];
          }
        }
      } else if (!frameBased) {
        // the camera's own end report closes the span; the segment linger
        // still bridges flicker between two alarms
        this.dwell.clear(sensorId);
      }
    }

    // dwell owns detected/blocked/lastTriggered for these types, a no-detection
    // frame would overwrite the dwell-set state, so strip before publishing
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
        break;
      case SensorType.LicensePlate:
        cs.licensePlate = { detected, detections: detections as LicensePlateDetection[] };
        break;
      case SensorType.Classifier:
        if (pluginId) {
          cs.classifiers ??= {};
          cs.classifiers[pluginId] = { detected, detections: detections as ClassifierDetection[] };
        }
        break;
      case SensorType.Clip:
        cs.clip = { embeddings: (properties.embeddings as ClipEmbedding[] | undefined) ?? [], embeddingModel: cs.clipEmbeddingModel ?? '' };
        break;
    }
  }

  private applyModelSpec(sensorId: string, sensorType: SensorType, modelSpec: AnyModelSpec): void {
    const current = this.plugins.get(sensorType);
    if (current?.sensorId !== sensorId) return;

    // another model means other numbers, keeping the old average would mislead;
    // load time is not part of the identity, a reload of the same model is not a change
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
    const sensorProxy = this.proxy.createProxy<DetectionPluginInterface>(namespaces.sensorRpc, {
      onTiming: (_method, timing) => this.perf.trackTiming(sensor.sensorType, timing.handlerMs, timing.transportMs),
    });

    const registered = this.plugins.register({
      pluginId: sensor.pluginId,
      sensorId: sensor.sensorId,
      sensorType: sensor.sensorType,
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
      proxy: sensorProxy,
    });
    if (!registered) {
      // re-push from the registry: the sensor is already live, only the spec may have changed
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

    // needsAdHocLoop, not shouldVideoBeActive: a loop still needed by a
    // frame-based object plugin must survive plugin hot-reloads
    if (this.adHocVideoLoop && !this.plugins.needsAdHocLoop()) {
      this.adHocVideoLoop = false;
      this.logger.debug('Stopping ad-hoc video loop — last frame-based consumer removed');
      this.stopVideoLoop();
    }

    // await, otherwise a rapid re-register starts a second loop while the
    // old one is still shutting down
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

    // motion is garbage during ego-motion and face/lpd inference pauses, their
    // boxes would float frozen through the pan; object keeps publishing live
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
    this.writeSensorProperties(sensorId, { detections: [] });
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
    // localizerWanted covers what the registry cannot see: an object assist or
    // an external object sensor needs the loop for the localizer's anchors
    if (!this.loopRunning && (this.plugins.needsAdHocLoop() || this.localizerWanted)) {
      this.adHocVideoLoop = true;
      this.logger.debug('Starting ad-hoc video loop for sensor cascade trigger');
      this.startVideoLoop();
    }
  }

  private stopAdHocVideoLoopIfIdle(): void {
    if (!this.adHocVideoLoop || this.plugins.shouldVideoBeActive()) return;
    // the localizer and assist still need frames while the event runs;
    // stopping on the cascade edge alone churned the main-stream decoder
    // open/closed mid-event, which starves the hw device (vaapi surface sync
    // failures) right when the next report arrives
    if (this.cascade.isActive || this.dwell.hasActive() || this.eventManager.hasActiveSegment()) return;
    this.adHocVideoLoop = false;
    this.logger.debug('Stopping ad-hoc video loop — idle');
    this.stopVideoLoop();
  }

  private async runDetectionLoop(): Promise<void> {
    // the source reconnects on its own, nextFrame simply waits it out
    const startedAt = Date.now();
    await this.frameSource.start();

    let lastFrameId = -1;
    let seenGeneration = -1;
    let firstFrame = true;

    while (this.loopRunning) {
      const tickStart = Date.now();
      const snap = await this.frameSource.nextFrame(lastFrameId);
      if (!snap) break; // source stopped

      if (firstFrame) {
        firstFrame = false;
        this.logger.debug(`Analysing after ${Date.now() - startedAt}ms`);
      }

      lastFrameId = snap.id;

      if (this.benchmarkRunning) {
        // the detector is saturated on purpose, feeding it real frames would
        // both distort the measurement and queue up behind it
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

        // motion always reads the low stream: switching its input resolution
        // would reset the background model on every transition
        const analysis = await this.acquireAnalysisFrame(snap.frame);
        // debugging
        detectionRecord.setFrame(analysis.isMainStream ? 'main' : 'low', analysis.frame.width, analysis.frame.height);
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
        // the stream keeps running, a broken tick must not end the loop
        this.logger.error('Detection tick failed:', error);
      } finally {
        try {
          snap.frame[Symbol.dispose]?.();
        } catch {
          // ignore
        }
      }

      const decode = this.frameSource.takeDecodeStats();
      this.perf.decodeMs += decode.ms;
      this.perf.decodedFrames += decode.frames;

      // activity, not stream choice: cameras without main-stream analysis still count as active
      if (this.worldSpans.size > 0 || this.eventManager.hasActiveSegment()) this.perf.activeTicks++;
      else this.perf.idleTicks++;
      this.perf.report(this.logger);

      const remaining = (this.mainStreamActive ? ACTIVE_TICK_MS : IDLE_TICK_MS) - (Date.now() - tickStart);
      if (remaining > 0) await sleep(remaining);
      this.perf.loopMs += Date.now() - tickStart;
    }

    await this.frameSource.detach();
    this.frameScaler.clearCache();
    this.logger.debug('Detection loop ended');
  }

  private async acquireAnalysisFrame(lowFrame: Frame): Promise<AnalysisFrame> {
    if (this.mainStreamActive) {
      const t0 = Date.now();
      try {
        const main = await this.thumbnailer.acquireHqFrame(0);
        if (main) {
          this.perf.mainFrames++;
          this.perf.mainDecodeMs += Date.now() - t0;
          return { frame: main.frame, scaler: main.scaler, isMainStream: true };
        }
      } catch (error) {
        this.logger.debug('Main stream frame unavailable:', error);
      }
    }

    return { frame: lowFrame, scaler: this.frameScaler, isMainStream: false };
  }

  private async acquireOpeningHqFrame(): Promise<AnalysisFrame | undefined> {
    if (!this.mainStreamAvailable) return undefined;
    const t0 = Date.now();
    try {
      const main = await this.thumbnailer.acquireHqFrame(0);
      if (main) {
        this.perf.mainFrames++;
        this.perf.mainDecodeMs += Date.now() - t0;
        return { frame: main.frame, scaler: main.scaler, isMainStream: true };
      }
    } catch (error) {
      this.logger.debug('HQ frame unavailable for the opening tick:', error);
    }
    return undefined;
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
    const results: DetectionResults = { timestamp: t0 };

    // while the PTZ repositions: motion and object keep running so the
    // background model and track ids survive the pan, but nothing below
    // reaches dwell/events until the settle window ends
    const ptzSuppressed = this.ptzAutotracker.suppressionActive;

    // motion runs every frame and re-arms the cascade; the cascade gates
    // object detection, not motion
    const motionPlugin = this.plugins.get(SensorType.Motion);

    if (motionPlugin?.requiresFrames) {
      // motion keeps its own rate, a background diff gains nothing from the active tick speed
      const motionDue = t0 - this.lastMotionAt >= MOTION_INTERVAL_MS - TICK_SLACK_MS;
      const motionScaleStart = Date.now();
      const motionFrame = motionDue ? await this.scaleForMotion(motionRawFrame) : undefined;
      if (motionDue) this.perf.scaleMs += Date.now() - motionScaleStart;
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
            // fed for the background model only, results discarded: frame-diff
            // is garbage during ego-motion, but skipping frames would leave a
            // stale background that lights up the whole scene after the move
          } else if (result.detections.length > 0) {
            const filtered = this.pipeline.runMergeAndZoneFilter(ensureDetectionBoxes(result.detections));
            motionDetected = filtered.length > 0;
            results.motion = { ...result, detections: filtered };
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
        this.perf.scaleMs += Date.now() - scaleStart;
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

    // object is cascade-gated, but keeps running during PTZ suppression so
    // the tracker holds its lock across pans
    const objectPlugin = this.plugins.get(SensorType.Object);
    const shouldDetectObjects = objectPlugin?.requiresFrames === true && (ptzSuppressed || !this.cascadeEnabled || this.cascade.isActive);

    if (shouldDetectObjects) {
      try {
        const detected = await this.runObjectDetection(objectPlugin, analysis, results.motion?.detections ?? []);
        if (!this.loopRunning) return;
        if (detected) {
          this.trackDetectionCadence();

          // run the pipeline even on empty frames so Norfair advances its
          // Kalman state; the pose delta keeps predictions stable across pans
          const poseDelta = this.ptzAutotracker.consumePoseDelta();
          const postStart = Date.now();
          const pipelineResult = this.pipeline.process(detected, poseDelta);
          this.perf.postMs += Date.now() - postStart;
          // the tick that opens a span analysed the low stream (the switch lands
          // next tick), its picture work is worth a one-off HQ decode
          if (this.updateWorldSpans(pipelineResult) && !analysis.isMainStream) {
            this.hqUpgrade = await this.acquireOpeningHqFrame();
          }
          await this.captureMoments(pipelineResult, this.hqUpgrade ?? analysis, t0);

          // open spans and a lingering segment keep the cascade armed: the
          // world can only observe absence or a reappearance while it still
          // receives ticks
          if (this.cascadeEnabled && (this.worldSpans.size > 0 || this.eventManager.hasActiveSegment())) {
            this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
          }

          // track id churn is invisible in the event log without this
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

          // extrapolated (Kalman-only) tracks smooth single-frame misses in
          // the UI, but must not float off-frame as ghost bboxes
          const visibleTracks = pipelineResult.tracked.filter((t) => {
            if (!t.trackLost) return true;
            const cx = t.box.x + t.box.width * 0.5;
            const cy = t.box.y + t.box.height * 0.5;
            return cx > -0.1 && cx < 1.1 && cy > -0.1 && cy < 1.1;
          });
          objectDetections = visibleTracks.filter((t) => !t.trackLost);
          results.object = { detected: objectDetections.length > 0, detections: visibleTracks };
          staticDetections = pipelineResult.staticTracks;
          if (pipelineResult.crossings.length > 0) results.lineCrossings = pipelineResult.crossings;

          // incl. extrapolated tracks, otherwise a single missed detector
          // frame flips the autotracker into LOST/REACQUIRE churn
          this.ptzAutotracker.handleObjectDetections(pipelineResult.tracked);

          // live tracks anchor the next tick's window; a track that just died
          // gets one farewell look at its last position
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
      // object boxes stay live in the UI through the move, bbox publish only
      if (objectPlugin && results.object) {
        this.writeSensorProperties(objectPlugin.sensorId, { detections: results.object.detections, staticDetections });
      }
      // keep an already-running object dwell alive so a chase doesn't end its
      // own event, but never activate it from suppressed frames
      if (objectPlugin && objectDetections.length > 0 && this.dwell.isActive(objectPlugin.sensorId)) {
        this.dwell.refresh(objectPlugin.sensorId, OBJECT_DWELL_SECONDS);
      }
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
      await this.runSecondariesAndThumbnails(images, objectDetections, results);
      if (!this.loopRunning) return;
      await this.captureAttributeMoment(results, images, t0);
    }

    if (!this.loopRunning) return;

    this.ingestResultsForAllSecondaries(results);
    this.clearStaleSecondaryBboxes();

    // one flush per frame, after detectors and thumbnails, so segment-start
    // messages already carry them
    if (!this.loopRunning) return;
    const snapshot = this.buildSnapshot(t0);
    if (results.thumbnails && results.thumbnails.length > 0) {
      snapshot.thumbnails = results.thumbnails;
    }

    // pre-encode the event thumbnail when this frame starts an event, so the
    // start message carries it inline; attaching is harmless otherwise
    const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
    let hqThumbAttached = false;
    if (wantsEventThumb) {
      try {
        const thumbStart = Date.now();
        const thumb = await this.thumbnailer.captureEventThumbnail((this.hqUpgrade ?? analysis).frame);
        this.perf.jpegMs += Date.now() - thumbStart;
        if (thumb.jpeg) snapshot.eventThumbnail = thumb.jpeg;
        hqThumbAttached = thumb.fromHq;
      } catch (error) {
        this.logger.error('Event thumbnail generation error:', error);
      }
    }

    this.eventManager.processResults(snapshot);

    // spans can outlive every trigger dwell (gate case); once spans, dwells
    // and the segment linger are all quiet the event ends here
    if (this.worldSpans.size === 0 && !this.dwell.hasActive() && !this.eventManager.hasActiveSegment()) {
      this.eventManager.forceEndActiveEvent();
    }

    // covers the window where the HQ source wasn't ready at event start
    if (wantsEventThumb && !hqThumbAttached) {
      this.thumbnailer.upgradeEventThumbnailAsync();
    }
  }

  private async runSecondariesAndThumbnails(analysis: AnalysisFrame, objectDetections: Detection[], results: DetectionResults): Promise<void> {
    if (objectDetections.length === 0) return;

    this.perf.objects += objectDetections.length;
    this.perf.framesWithObjects++;

    const secondaryStart = Date.now();
    await this.secondaries.detect(analysis.frame, analysis.scaler, objectDetections, results);
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
        // the crop path reaches ingestDetectionResult directly, so the zone
        // filter that guards the plugin path has to be applied here too
        const detections = this.pipeline.runZoneFilterWithLabel(results.face.detections, 'face');
        // no mid-segment clear: a turned-away head yields a no-face frame and
        // would flap the list, departure is reflected when the segment ends
        for (const detection of detections) {
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
            // the specific answer wins (subAttribute, e.g. the bird species)
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
    if (results.clip) {
      // clip has no sensor, embeddings flow through the buffer only
      this.currentDetectionState.clip = results.clip;
      this.currentDetectionState.clipEmbeddingModel = results.clipEmbeddingModel;
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

    return opened;
  }

  private async captureMoments(result: PipelineResult, analysis: AnalysisFrame, at: number): Promise<void> {
    let subject: WorldObject | undefined;
    let bestScore = -1;
    let trigger = '';

    for (const event of result.events) {
      const obj = event.object;
      // a moment is worth a picture when a span opens or the view got better;
      // closing events report absence, there is nothing to show
      if (!MOMENT_EVENTS.has(event.eventType)) continue;
      // and only for a track that holds a span: a tentative first sighting or a
      // stationary recovery opens nothing, so its picture is never handed over
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

    this.eventManager.offerMoment({ strip: rendered.strip, card: rendered.card, capturedAt: at, score: bestScore, rank: MOMENT_RANK_OBJECT, stream: 'low' });
    // debugging
    await this.recordMoment(target, rendered, analysis, `${subject.label}-external`, bestScore, 'external', at);
  }

  private async captureMoment(subject: WorldObject, score: number, trigger: string, tracked: TrackedDetection[], analysis: AnalysisFrame, at: number): Promise<void> {
    const box: BoundingBox = { x: subject.x, y: subject.y, width: subject.width, height: subject.height };
    const moving = tracked.filter((d) => (d.trackSpeed ?? 0) >= MOMENT_MOVING_SPEED).map((d) => d.box);
    const target: MomentTarget = { subject: box, base: unionBox([box, ...moving]), hint: directionOf(subject.velocityX, subject.velocityY) };
    const rendered = await this.renderMoment(target, analysis);
    if (!rendered) return;

    const stream = analysis.isMainStream ? 'main' : 'low';
    this.eventManager.offerMoment({ strip: rendered.strip, card: rendered.card, capturedAt: at, score, rank: MOMENT_RANK_OBJECT, stream });
    // debugging
    await this.recordMoment(target, rendered, analysis, `${subject.label}-${subject.trackId}`, score, trigger, at);
  }

  private async captureAttributeMoment(results: DetectionResults, analysis: AnalysisFrame, at: number): Promise<void> {
    const candidates: AttributeMomentCandidate[] = [];

    // same rule as the object rank: only a span-holding subject hands over a
    // picture. A face or plate riding on a settled bystander (the parked car
    // at the kerb) must not anchor the segment of an unrelated event
    const spanHolder = (parentTrackId?: number) => parentTrackId !== undefined && this.worldSpans.has(parentTrackId);

    for (const face of results.face?.detections ?? []) {
      const f = face as TrackedFaceDetection;
      if (!spanHolder(f.parentTrackId)) continue;
      candidates.push({ label: `face:${f.identity ?? 'unknown'}`, box: f.box, parentBox: f.parentBox, confidence: f.confidence });
    }
    for (const plate of results.licensePlate?.detections ?? []) {
      const p = plate as TrackedLicensePlateDetection;
      if (!p.plateText || !spanHolder(p.parentTrackId)) continue;
      candidates.push({ label: `plate:${normalizePlateText(p.plateText)}`, box: p.box, parentBox: p.parentBox, confidence: p.confidence });
    }

    // one picture per tick, never one per subject: with several faces the most
    // legible one frames the shot, the rest stay their own attribute tiles
    let best: AttributeMomentCandidate | undefined;
    let bestScore = -1;
    for (const candidate of candidates) {
      const cut = results.thumbnails?.find((t) => t.label === candidate.label);
      // a subject cut off by the frame edge makes a poor card
      if (cut?.onEdge) continue;
      // a few-pixel face or plate carries no information even at the crop's max
      // upscale: it stays an attribute tile, the anchor keeps the object shot
      const areaPx = candidate.box.width * analysis.frame.width * candidate.box.height * analysis.frame.height;
      if (areaPx < MOMENT_ATTRIBUTE_MIN_AREA) continue;
      const score = candidate.confidence * Math.sqrt(candidate.box.width * candidate.box.height);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    // ask before cutting: the same face rides along on every tick of a segment
    // and re-encoding for a picture that loses anyway is pure cost
    if (!best || !this.eventManager.wantsMoment(MOMENT_RANK_ATTRIBUTE, bestScore, analysis.isMainStream ? 'main' : 'low', at)) return;

    // the card frames the whole person with the face as its center, not the
    // bare face box: the zoomed face already exists as an attribute tile, and
    // a misdetected "face" zoomed to card size ruins the event picture
    const target: MomentTarget = {
      subject: best.box,
      base: best.parentBox ?? best.box,
      hint: best.parentBox ? directionBetween(best.box, best.parentBox) : undefined,
    };
    const rendered = await this.renderMoment(target, analysis);
    if (!rendered) return;

    const stream = analysis.isMainStream ? 'main' : 'low';
    this.eventManager.offerMoment({ strip: rendered.strip, card: rendered.card, capturedAt: at, score: bestScore, rank: MOMENT_RANK_ATTRIBUTE, stream });
    // debugging
    await this.recordMoment(target, rendered, analysis, best.label.replace(':', '-'), bestScore, 'attributeFound', at);
  }

  private async renderMoment(target: MomentTarget, analysis: AnalysisFrame, card?: Buffer): Promise<RenderedMoment | null> {
    const start = Date.now();
    const rendered = new Map<MomentFormatName, Buffer>();
    const windows: Partial<Record<MomentFormatName, CropWindow>> = {};
    if (card) rendered.set('card', card);

    try {
      for (const format of MOMENT_FORMATS) {
        const window = momentWindow(target, analysis.frame.width, analysis.frame.height, format);
        if (!window) continue;
        windows[format.name] = window;
        if (rendered.has(format.name)) continue;
        const jpeg = await analysis.scaler.cropWindowToJPEG(analysis.frame, window, format.width, format.height, MOMENT_QUALITY);
        if (jpeg) rendered.set(format.name, jpeg);
      }
    } catch (error) {
      this.logger.debug('Moment crop failed:', error);
    }
    this.perf.jpegMs += Date.now() - start;

    const strip = rendered.get('strip');
    return strip ? { strip, card: rendered.get('card'), windows } : null;
  }

  // debugging
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
    if (!this.localizerWanted || !this.frameSource.decodeOldestKeyframe) return;

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

  private async scaleForObject(rawFrame: Frame, scaler: FrameScaler): Promise<PluginFrame | undefined> {
    const objectPlugin = this.plugins.get(SensorType.Object);
    if (!objectPlugin?.requiresFrames) return undefined;
    return this.scaleFrameForPlugin(rawFrame, objectPlugin, scaler);
  }

  private async runObjectDetection(objectPlugin: RegisteredPlugin, analysis: AnalysisFrame, pluginMotionBoxes: Detection[]): Promise<Detection[] | undefined> {
    const inputSpec = objectPlugin.modelSpec?.input;
    const motionAnchors = [...this.anchorBoxes, ...pluginMotionBoxes.map((d) => d.box).filter((box): box is BoundingBox => box !== undefined), ...this.farewellBoxes];
    this.farewellBoxes = [];

    const windows = isVideoInputSpec(inputSpec)
      ? this.detectionWindow.plan(motionAnchors, this.trackAnchorBoxes, analysis.frame.width, analysis.frame.height, inputSpec.width)
      : null;

    if (windows && windows.length > 0) {
      this.perf.zoomTicks++;
      this.perf.zoomWindows += windows.length;
      detectionRecord.zoom({ kind: 'object', anchors: motionAnchors, tracks: this.trackAnchorBoxes, windows });
      const inferStart = Date.now();
      const perWindow = await Promise.all(
        windows.map((window) => this.detectInWindow(objectPlugin, analysis.frame, analysis.scaler, window, inputSpec as VideoInputSpec)),
      );
      this.perf.objectMs += Date.now() - inferStart;
      this.perf.objectCount++;
      return mergeWindowDetections(perWindow.flat());
    }

    const scaleStart = Date.now();
    const objectFrame = await this.scaleForObject(analysis.frame, analysis.scaler);
    this.perf.scaleMs += Date.now() - scaleStart;
    if (!objectFrame || !this.loopRunning) return undefined;

    const inferStart = Date.now();
    const result = await PromiseTimeout(
      objectPlugin.proxy.detectObjects(objectFrame.model),
      DETECT_TIMEOUT_MS,
      undefined,
      `Object detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
    this.perf.objectMs += Date.now() - inferStart;
    this.perf.objectCount++;
    return FrameScaler.undoLetterbox(ensureDetectionBoxes(result.detections), objectFrame.geometry);
  }

  private async detectInWindow(plugin: RegisteredPlugin, frame: Frame, scaler: FrameScaler, window: BoundingBox, spec: VideoInputSpec): Promise<Detection[]> {
    const scaleStart = Date.now();
    const cropped = await scaler.cropToSpec(frame, window, spec);
    this.perf.scaleMs += Date.now() - scaleStart;
    if (!cropped) return [];

    const result = await PromiseTimeout(
      plugin.proxy.detectObjects(scaler.toVideoFrameData(cropped.padded, 'model')),
      DETECT_TIMEOUT_MS,
      undefined,
      `Object detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
    return FrameScaler.undoLetterbox(ensureDetectionBoxes(result.detections), cropped.geometry);
  }

  private async scaleFrameForPlugin(rawFrame: Frame, plugin: RegisteredPlugin, scaler: FrameScaler = this.frameScaler): Promise<PluginFrame | undefined> {
    const inputSpec = plugin.modelSpec?.input;
    if (!isVideoInputSpec(inputSpec)) return undefined;

    const letterboxed = await scaler.letterboxToSpec(rawFrame, inputSpec);
    if (!letterboxed) return undefined;

    return {
      model: scaler.toVideoFrameData(letterboxed.padded, 'model'),
      tracking: scaler.toVideoFrameData(letterboxed.inner, 'tracking'),
      geometry: letterboxed.geometry,
    };
  }

  private ingestAssistedObjects(sensorId: string, objects: { detections: Detection[]; assisted: boolean }): void {
    if (!objects.assisted) return;
    // the assist returns raw detector output; the frame path dedupes via NMS
    // before ingest, so this path must merge too or near-identical candidate
    // boxes inflate the object count
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
      const boxed = await this.assistDetections(assist, frame, scaler, reported);
      this.perf.assistMs += Date.now() - inferStart;
      this.perf.assistCount++;
      const reportedLabels = new Set(reported.map((d) => d.label.toLowerCase()));
      const found = boxed.filter((d) => reportedLabels.size === 0 || reportedLabels.has(d.label.toLowerCase()));
      if (found.length === 0) return { detections: reported, assisted: false };
      this.perf.objects += found.length;
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

    // a coordinate-less report still has the localizer's diff anchors: zoom
    // the assist into the moving regions instead of letterboxing the whole
    // frame, which shrinks the subject to nothing on a main-stream frame
    const anchors = reportedBoxes.length > 0 ? reportedBoxes : [...this.anchorBoxes, ...this.farewellBoxes];
    const pad = reportedBoxes.length > 0 ? TRACK_PAD : MOTION_PAD;

    if (isVideoInputSpec(inputSpec) && anchors.length > 0) {
      const windows = planWindowsOnce(anchors, pad, frame.width, frame.height, inputSpec.width);
      if (windows.length > 0) {
        detectionRecord.zoom({ kind: 'assist', anchors, windows });
        const perWindow = await Promise.all(windows.map((window) => this.detectInWindow(assist, frame, scaler, window, inputSpec)));
        return mergeWindowDetections(perWindow.flat());
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
