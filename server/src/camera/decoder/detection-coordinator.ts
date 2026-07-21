import { PromiseTimeout, sleep } from '@camera.ui/common/utils';
import { isNoRespondersError, RPCClass, RPCMethod } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { DETECTION_SENSOR_TYPES } from '../sensors/types.js';
import { normalizeZone } from '../utils/filter.js';
import { AudioDetectionLoop } from './audio-loop.js';
import { CascadeManager } from './cascade-manager.js';
import { DetectionPipeline } from './detection-pipeline.js';
import { DwellManager } from './dwell-manager.js';
import { DetectionEventManager } from './event-manager.js';
import { EventThumbnailer } from './event-thumbnailer.js';
import { FrameScaler } from './frame-scaler.js';
import { isVideoInputSpec, PluginRegistry } from './plugin-registry.js';
import { PtzAutotracker } from './ptz/autotracker.js';
import { ReconnectBackoff } from './reconnect-backoff.js';
import { SecondaryStage } from './secondary-stage.js';
import { FrameSource } from './sources/frame-source.js';
import { StationarySuppressor } from './stationary-suppressor.js';
import { DETECT_TIMEOUT_MS, MOTION_WIDTH_MAP } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { RPCClient } from '@camera.ui/rpc';
import type {
  AudioResult,
  CameraDetectionSettings,
  CameraFrameWorkerSettings,
  CameraUiSettings,
  ClassifierDetection,
  ClassifierResult,
  ClipEmbedding,
  ClipResult,
  Detection,
  DetectionLine,
  DetectionZone,
  FaceDetection,
  FaceResult,
  LicensePlateDetection,
  LicensePlateResult,
  MotionResult,
  ObjectResult,
  PtzAutotrackSettings,
  TrackedDetection,
  VideoFrameData,
} from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { CoordinatorSensorInfo, DetectionPluginInterface, DetectionResults } from '../../rpc/interfaces/detection.js';
import type { CameraDeviceInterface } from '../../rpc/interfaces/device.js';
import type { SensorWriteMessage } from '../../rpc/interfaces/sensor.js';
import type { LineCrossingEvent } from './detection-pipeline.js';
import type { NormalizedDetectionZone, ProcessedDetectionData } from './event-manager.js';
import type { FrameSourceConfig } from './sources/frame-source.js';
import type { CoordinatorSourceUrl } from './types.js';

export interface DetectionCoordinatorConfig {
  cameraId: string;
  streamUrl: string;
  snapshotUrl: string;
  audioStreamUrl: string;
  controllerSnapshotSourceId?: string;
  availableSources?: CoordinatorSourceUrl[];
  zones: DetectionZone[];
  lines: DetectionLine[];
  detectionSettings: CameraDetectionSettings;
  ptzAutotrack: PtzAutotrackSettings;
  frameWorkerSettings: CameraFrameWorkerSettings;
  interfaceSettings: CameraUiSettings;
}

const DEFAULT_CASCADE_TIMEOUT = 10;
const OBJECT_DWELL_SECONDS = 2;
const SECONDARY_BBOX_TTL_MS = 2000;

@RPCClass
export class DetectionCoordinator {
  private frameSource: FrameSource;
  private frameScaler: FrameScaler;

  private readonly plugins = new PluginRegistry();
  private readonly pipeline: DetectionPipeline;
  private readonly stationary: StationarySuppressor;
  private readonly secondaries: SecondaryStage;
  private readonly thumbnailer: EventThumbnailer;
  private readonly audioLoop: AudioDetectionLoop;
  private readonly ptzAutotracker: PtzAutotracker;
  private readonly eventManager: DetectionEventManager;
  private readonly cascade = new CascadeManager();
  private readonly dwell = new DwellManager();
  private readonly videoBackoff = new ReconnectBackoff();

  private loopRunning = false;
  private loopPromise?: Promise<void>;
  private videoStopPromise?: Promise<void>;
  private adHocVideoLoop = false;
  private processingExternalSecondary = false;

  private cascadeUnsubscribe?: () => void;
  private dwellUnsubscribe?: () => void;

  private readonly activeSensorTriggerTypes = new Map<string, string>();
  private readonly secondaryBboxSeen = new Map<string, number>();

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
    const frameSourceConfig: FrameSourceConfig = {
      streamUrl: config.streamUrl,
      snapshotUrl: config.snapshotUrl,
      fps: this.config.frameWorkerSettings.fps,
    };

    if (config.controllerSnapshotSourceId) {
      const sourceId = config.controllerSnapshotSourceId;
      const controllerProxy = this.proxy.createProxy<CameraDeviceInterface>(NamespaceManager.cameraNamespaces(config.cameraId).cameraControllerRpc);
      frameSourceConfig.snapshotProvider = async () => {
        const jpeg = await controllerProxy.snapshot(sourceId, true);
        if (!jpeg || jpeg.byteLength === 0) return null;
        return Buffer.from(jpeg);
      };
    }

    this.frameSource = new FrameSource(frameSourceConfig, logger);
    this.frameScaler = new FrameScaler(null, logger);
    this.pipeline = new DetectionPipeline(config.zones, config.detectionSettings);
    this.stationary = new StationarySuppressor(logger);
    this.secondaries = new SecondaryStage(this, this.plugins, this.pipeline, this.frameScaler, this.proxy, logger);

    if (config.lines.length > 0) {
      this.pipeline.updateLines(config.lines, this.videoAspectRatio);
    }

    this.eventManager = new DetectionEventManager(config.cameraId, this.proxy, this.logger);
    this.eventManager.onEventEnd(() => this.handleEventEnded());

    this.thumbnailer = new EventThumbnailer(
      { frameSource: this.frameSource, frameScaler: this.frameScaler, eventManager: this.eventManager, logger },
      config.availableSources,
    );
    this.thumbnailer.sync(this.config.frameWorkerSettings.hqSnapshots === true);

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
        this.pipeline.setReidHitCounterMax(this.cascadeTimeoutSeconds * this.targetFps);
        this.startAdHocVideoLoopIfNeeded();
      } else {
        this.pipeline.setReidHitCounterMax(0);
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
        if (!this.dwell.hasActive()) {
          this.eventManager.forceEndActiveEvent();
        }
      }
    });
  }

  public get running(): boolean {
    return this.loopRunning;
  }

  public get detectionSettings(): CameraDetectionSettings {
    return this.config.detectionSettings;
  }

  public updateZones(zones: DetectionZone[]): void {
    this.config.zones = zones;
    this.pipeline.updateZones(zones);
  }

  public updateLines(lines: DetectionLine[]): void {
    this.config.lines = lines;
    this.pipeline.updateLines(lines, this.videoAspectRatio);
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
    this.thumbnailer.sync(settings.hqSnapshots === true);
  }

  public updateInterfaceSettings(settings: CameraUiSettings): void {
    this.config.interfaceSettings = settings;
    if (this.config.lines.length > 0) {
      this.pipeline.updateLines(this.config.lines, this.videoAspectRatio);
    }
  }

  public async dispose(): Promise<void> {
    await this.stopVideoLoop();
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
    this.pipeline.cleanup();
    this.currentDetectionState = {};
  }

  @RPCMethod
  public async onSensorAdded(sensor: CoordinatorSensorInfo): Promise<void> {
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
    if (sensorType === SensorType.Object) {
      const filtered = this.applyExternalDetectionFilters(sensorType, properties);

      // presence feed keeps the autotracker's return-home timer alive even while
      // suppression gates everything below
      const externalDetections = (filtered.detections as Detection[] | undefined) ?? [];
      this.ptzAutotracker.handlePresenceDetections(externalDetections);

      if (this.ptzAutotracker.suppressionActive) return;

      this.ingestDetectionResult(SensorType.Object, sensorId, filtered);
      this.eventManager.processResults(this.buildSnapshot());

      if (!this.plugins.hasFrameBasedSecondary()) {
        // re-shoot the event thumbnail: smart-camera reports arrive after the
        // motion-start shot, often before the subject fully entered the frame
        if (filtered.detected === true && this.eventManager.hasActiveEvent()) {
          this.thumbnailer.fetchEventThumbnailAsync();
        }
        return;
      }
      if (this.processingExternalSecondary) return; // previous RPC still running

      this.processingExternalSecondary = true;
      try {
        // processExternal only adapts the shape, external boxes get no real tracking
        const rawExternal = (filtered.detections as Detection[] | undefined) ?? [];
        const objectDetections = this.pipeline.processExternal(rawExternal);

        const peeked = this.frameSource.peekLatestFrame();
        if (peeked) {
          try {
            const results: DetectionResults = { timestamp: Date.now() };
            await this.runSecondariesAndThumbnails(peeked.frame, objectDetections, results);
            this.ingestResultsForAllSecondaries(results);
            const snapshot = this.buildSnapshot();
            if (results.thumbnails && results.thumbnails.length > 0) {
              snapshot.thumbnails = results.thumbnails;
            }
            this.eventManager.processResults(snapshot);
          } finally {
            await peeked[Symbol.asyncDispose]();
          }
          return;
        }

        const fetched = await this.frameSource.fetchSnapshotFrame();
        if (!fetched) return;
        try {
          const results: DetectionResults = { timestamp: Date.now() };
          const sceneJpeg = await this.secondaries.detectFullFrame(fetched.frame, results);
          this.ingestResultsForAllSecondaries(results);
          const snapshot = this.buildSnapshot();
          if (sceneJpeg) snapshot.eventThumbnail = sceneJpeg;
          const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
          this.eventManager.processResults(snapshot);
          if (wantsEventThumb) {
            this.thumbnailer.upgradeEventThumbnailAsync();
          }
        } finally {
          await fetched[Symbol.asyncDispose]();
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
      this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
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

  private handleCascadeDeactivated(): void {
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

    for (const sensorId of clearTargets) {
      this.writeSensorProperties(sensorId, { detected: false, detections: [] });
      this.secondaryBboxSeen.delete(sensorId);
    }

    // segment ends here, the event itself continues while motion is active
    this.eventManager.processResults(this.buildSnapshot());
  }

  private handleEventEnded(): void {
    if (this.config.detectionSettings.object.suppressStatic ?? true) {
      this.stationary.retainAcrossEvent((trackIds) => this.pipeline.retainTracks(trackIds));
    } else {
      this.pipeline.cleanup();
      this.stationary.clear();
    }
    this.stationary.resetEventState();
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
    this.proxy.publish(NamespaceManager.sensorControllerNamespaces(this.config.cameraId).sensorWriteSubject, msg);
  }

  private buildSnapshot(): ProcessedDetectionData {
    const cs = this.currentDetectionState;
    return {
      hasCascadeTrigger: this.cascade.isActive,
      motion: cs.motion ? { detected: cs.motion.detected ?? false } : undefined,
      audio: cs.audio ? { detected: cs.audio.detected ?? false, detections: cs.audio.detections ?? [] } : undefined,
      cascadeTriggered: cs.cascadeTriggered,
      sensorTriggers: [...new Set(this.activeSensorTriggerTypes.values())],
      objects: cs.object?.detected ? cs.object.detections : [],
      faces: cs.face?.detections ?? [],
      faceEmbeddingModel: cs.faceEmbeddingModel,
      plates: cs.licensePlate?.detections ?? [],
      plateVoting: this.plugins.get(SensorType.LicensePlate)?.requiresFrames === true,
      plateMinConfidence: this.config.detectionSettings.licensePlate?.confidence,
      plateMinLength: this.config.detectionSettings.licensePlate?.minLength,
      faceMinConfidence: this.config.detectionSettings.face?.confidence,
      classifiers: cs.classifiers ? Object.values(cs.classifiers).flatMap((c) => c.detections) : [],
      clips: cs.clip?.embeddings ?? [],
      clipEmbeddingModel: cs.clipEmbeddingModel,
      thumbnails: undefined,
      lineCrossings: cs.lineCrossings,
      timestamp: Date.now(),
      segmentTimeout: 10,
      expectedEndTime: this.dwell.maxExpiry(),
      detectionZones: this.getNormalizedDetectionZones(),
    };
  }

  private getNormalizedDetectionZones(): NormalizedDetectionZone[] {
    if (!this.config.zones || this.config.zones.length === 0) return [];
    const result: NormalizedDetectionZone[] = [];
    for (const zone of this.config.zones) {
      if (zone.isPrivacyMask) continue;
      if (!zone.name) continue;
      const normalized = normalizeZone(zone);
      result.push({ name: zone.name, points: normalized.points });
    }
    return result;
  }

  private applyExternalDetectionFilters(sensorType: SensorType, properties: Record<string, unknown>): Record<string, unknown> {
    const raw = properties.detections;
    if (!Array.isArray(raw) || raw.length === 0) return properties;

    // older/third-party plugins can send box-less detections, but the zone
    // filter and rust merge assume a box on every detection
    const detections = raw.map((detection) => (detection.box ? detection : { ...detection, box: { x: 0, y: 0, width: 1, height: 1 } }));

    let filtered: Detection[];
    switch (sensorType) {
      case SensorType.Face:
        filtered = this.pipeline.runZoneFilterWithLabel(detections as FaceDetection[], 'person');
        break;
      case SensorType.LicensePlate:
        filtered = this.pipeline.runZoneFilterWithLabel(detections as LicensePlateDetection[], 'vehicle');
        break;
      case SensorType.Object:
      case SensorType.Classifier:
      case SensorType.Motion:
        filtered = this.pipeline.runZoneFilter(detections as Detection[]);
        break;
      default:
        return { ...properties, detections }; // audio etc, no zone filter
    }

    return {
      ...properties,
      detections: filtered,
      detected: filtered.length > 0,
    };
  }

  // PTZ-suppression gating happens upstream, callers decide what gets in here
  private ingestDetectionResult(sensorType: SensorType, sensorId: string, properties: Record<string, unknown>, pluginId?: string): void {
    this.updateBufferForType(sensorType, properties, pluginId);

    const detected = properties.detected === true;

    if (sensorType === SensorType.Motion && detected) {
      const motionTimeout = this.config.detectionSettings.motion.timeout;
      this.dwell.refresh(sensorId, motionTimeout);
      if (this.cascadeEnabled) {
        this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
      }
    } else if (sensorType === SensorType.Audio && detected) {
      const audioTimeout = this.config.detectionSettings.audio.timeout;
      this.dwell.refresh(sensorId, audioTimeout);
      if (this.cascadeEnabled) {
        this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
      }
    } else if (sensorType === SensorType.Object && detected) {
      // the dwell bridges single missed frames; anchored stationary tracks
      // don't refresh it, so parked objects can't hold events open
      const detections = (properties.detections as TrackedDetection[] | undefined) ?? [];
      if (this.stationary.evaluate(detections)) {
        this.dwell.refresh(sensorId, OBJECT_DWELL_SECONDS);
      } else {
        // clear detected + buffer so no segment opens, the UI still gets
        // the bboxes via the property publish below
        properties.detected = false;
        if (this.currentDetectionState.object) {
          this.currentDetectionState.object.detected = false;
          this.currentDetectionState.object.detections = [];
        }
        this.stationary.logSuppressedOnce(detections);
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

  private async registerDetectionPluginInternal(sensor: CoordinatorSensorInfo): Promise<void> {
    if (this.videoStopPromise) await this.videoStopPromise;
    await this.audioLoop.waitForStop();

    const wasVideoNeeded = this.plugins.shouldVideoBeActive();
    const wasAudioNeeded = this.plugins.shouldAudioBeActive();

    const namespaces = NamespaceManager.sensorProviderNamespaces(sensor.pluginId, this.config.cameraId, sensor.sensorId);
    const sensorProxy = this.proxy.createProxy<DetectionPluginInterface>(namespaces.sensorRpc);

    const registered = this.plugins.register({
      pluginId: sensor.pluginId,
      sensorId: sensor.sensorId,
      sensorType: sensor.sensorType,
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
      proxy: sensorProxy,
    });
    if (!registered) return;
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

    // image-space anchors don't survive a camera move, they re-form after
    this.stationary.dropForCameraMove();
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
    this.videoBackoff.reset();
    this.loopPromise = this.runDetectionLoop();
  }

  private async stopVideoLoop(): Promise<void> {
    if (!this.loopRunning) {
      if (this.videoStopPromise) await this.videoStopPromise;
      return;
    }

    this.logger.debug('Stopping video detection loop');
    this.loopRunning = false;

    const doStop = async () => {
      await this.frameSource.stop();
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
    if (!this.loopRunning && this.plugins.needsAdHocLoop()) {
      this.adHocVideoLoop = true;
      this.logger.debug('Starting ad-hoc video loop for sensor cascade trigger');
      this.startVideoLoop();
    }
  }

  private stopAdHocVideoLoopIfIdle(): void {
    if (this.adHocVideoLoop && !this.plugins.shouldVideoBeActive()) {
      this.adHocVideoLoop = false;
      this.logger.debug('Stopping ad-hoc video loop — cascade ended');
      this.stopVideoLoop();
    }
  }

  private async runDetectionLoop(): Promise<void> {
    while (this.loopRunning) {
      try {
        await this.frameSource.start();
        this.frameScaler.updateHardwareContext(this.frameSource.hardwareContext);

        this.logger.debug('Stream connected, processing frames...');
        this.videoBackoff.reset();

        let frameCount = 0;
        let lastFrameId = -1;

        while (this.loopRunning) {
          const snap = await this.frameSource.nextFrame(lastFrameId);
          if (!snap) break; // source ended (stop or EOF)

          lastFrameId = snap.id;
          frameCount++;

          try {
            await this.processRawFrame(snap.frame);
          } finally {
            try {
              snap.frame[Symbol.dispose]?.();
            } catch {
              // best-effort
            }
          }
        }

        const streamError = this.frameSource.lastError;
        await this.frameSource.stop();
        this.frameScaler.clearCache();

        if (this.loopRunning && streamError) {
          const delay = this.videoBackoff.nextDelayMs();
          this.logger.warn(`Stream ended with read error, reconnecting in ${delay / 1000}s: ${streamError.message}`);
          await sleep(delay);
        } else if (this.loopRunning && frameCount === 0) {
          this.logger.debug('Stream ended without frames, waiting before reconnect...');
          await sleep(this.videoBackoff.idleDelayMs);
        }
      } catch (error: any) {
        if (!this.loopRunning) break;

        await this.frameSource.stop();
        this.frameScaler.clearCache();

        const delay = this.videoBackoff.nextDelayMs();
        this.logger.warn(`Stream error, reconnecting in ${delay / 1000}s: ${error.message}`);
        await sleep(delay);
      }
    }

    await this.frameSource.stop();
    this.frameScaler.clearCache();
    this.logger.debug('Detection loop ended');
  }

  private async processRawFrame(rawFrame: Frame): Promise<void> {
    if (!this.loopRunning || !this.plugins.hasAny()) return;

    try {
      await this.processDetection(rawFrame);
    } catch (error) {
      this.logger.error('Detection processing error:', error);
    }
  }

  private async processDetection(rawFrame: Frame): Promise<void> {
    const t0 = Date.now();
    let motionDetected = false;
    let objectDetections: Detection[] = [];
    const results: DetectionResults = { timestamp: t0 };

    // keeps dead tracks from expiring during the cascade window
    if (this.cascade.isActive) {
      this.pipeline.refreshReid();
    }

    // while the PTZ repositions: motion and object keep running so the
    // background model and track ids survive the pan, but nothing below
    // reaches dwell/events until the settle window ends
    const ptzSuppressed = this.ptzAutotracker.suppressionActive;

    // motion runs every frame and re-arms the cascade; the cascade gates
    // object detection, not motion
    const motionPlugin = this.plugins.get(SensorType.Motion);

    if (motionPlugin?.requiresFrames) {
      const motionFrame = await this.scaleForMotion(rawFrame);
      if (!this.loopRunning) return;
      if (motionFrame) {
        try {
          const result = await motionPlugin.proxy.detectMotion(motionFrame);
          if (!this.loopRunning) return;
          if (ptzSuppressed) {
            // fed for the background model only, results discarded: frame-diff
            // is garbage during ego-motion, but skipping frames would leave a
            // stale background that lights up the whole scene after the move
          } else if (result.detections.length > 0) {
            const filtered = this.pipeline.runMergeAndZoneFilter(result.detections);
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
      const objectFrame = await this.scaleForObject(rawFrame);
      if (!this.loopRunning) return;
      if (objectFrame) {
        try {
          const result = await PromiseTimeout(
            objectPlugin.proxy.detectObjects(objectFrame),
            DETECT_TIMEOUT_MS,
            undefined,
            `Object detection timed out after ${DETECT_TIMEOUT_MS}ms`,
          );
          if (!this.loopRunning) return;

          // run the pipeline even on empty frames so Norfair advances its
          // Kalman state; the pose delta keeps predictions stable across pans
          const poseDelta = this.ptzAutotracker.consumePoseDelta();
          const pipelineResult = this.pipeline.process(result.detections, objectFrame, poseDelta);

          // track id churn is invisible in the event log without this
          if (pipelineResult.created.length > 0 || pipelineResult.removed.length > 0) {
            const born = pipelineResult.created.map((id) => {
              const t = pipelineResult.tracked.find((d) => d.trackId === id);
              return `${t?.label ?? 'unknown'}#${id}`;
            });
            const died = pipelineResult.removed.map((id) => `#${id}${this.stationary.isAnchored(id) ? ' (anchored!)' : ''}`);
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
          results.object = { ...result, detections: visibleTracks };
          if (pipelineResult.crossings.length > 0) results.lineCrossings = pipelineResult.crossings;

          // incl. extrapolated tracks, otherwise a single missed detector
          // frame flips the autotracker into LOST/REACQUIRE churn
          this.ptzAutotracker.handleObjectDetections(pipelineResult.tracked);
        } catch (error) {
          if (!this.loopRunning || isNoRespondersError(error)) return;
          this.logger.error('Object detection error:', error);
        }
      }
    }

    // tracker and autotracker are fed, everything event-facing stays quiet
    if (ptzSuppressed) {
      // object boxes stay live in the UI through the move, bbox publish only
      if (objectPlugin && results.object) {
        this.writeSensorProperties(objectPlugin.sensorId, { detections: results.object.detections });
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
      });
    }

    if (!this.loopRunning) return;

    if (objectDetections.length > 0) {
      await this.runSecondariesAndThumbnails(rawFrame, objectDetections, results);
    }

    if (!this.loopRunning) return;

    this.ingestResultsForAllSecondaries(results);
    this.clearStaleSecondaryBboxes();

    // one flush per frame, after detectors and thumbnails, so segment-start
    // messages already carry them
    if (!this.loopRunning) return;
    const snapshot = this.buildSnapshot();
    if (results.thumbnails && results.thumbnails.length > 0) {
      snapshot.thumbnails = results.thumbnails;
    }

    // pre-encode the event thumbnail when this frame starts an event, so the
    // start message carries it inline; attaching is harmless otherwise
    const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
    let hqThumbAttached = false;
    if (wantsEventThumb) {
      try {
        const thumb = await this.thumbnailer.captureEventThumbnail(rawFrame);
        if (thumb.jpeg) snapshot.eventThumbnail = thumb.jpeg;
        hqThumbAttached = thumb.fromHq;
      } catch (error) {
        this.logger.error('Event thumbnail generation error:', error);
      }
    }

    this.eventManager.processResults(snapshot);

    // covers the window where the HQ source wasn't ready at event start
    if (wantsEventThumb && !hqThumbAttached) {
      this.thumbnailer.upgradeEventThumbnailAsync();
    }
  }

  private async runSecondariesAndThumbnails(rawFrame: Frame, objectDetections: Detection[], results: DetectionResults): Promise<void> {
    objectDetections = this.stationary.excludeSealed(objectDetections);
    if (objectDetections.length === 0) return;

    await this.secondaries.detect(rawFrame, objectDetections, results);

    try {
      // detectors ran on the substream frame, thumbnails prefer the HQ frame
      const hq = await this.thumbnailer.acquireHqFrame({ width: rawFrame.width, height: rawFrame.height });
      try {
        results.thumbnails = await this.secondaries.generateThumbnails(hq?.frame ?? rawFrame, hq?.scaler ?? this.frameScaler, hq !== null, objectDetections, results);
      } finally {
        hq?.frame[Symbol.dispose]?.();
      }
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
        this.ingestDetectionResult(SensorType.Face, facePlugin.sensorId, {
          detected: results.face.detected,
          detections: results.face.detections,
        });
      }
    }
    if (results.licensePlate) {
      const lpdPlugin = this.plugins.get(SensorType.LicensePlate);
      if (lpdPlugin) {
        this.ingestDetectionResult(SensorType.LicensePlate, lpdPlugin.sensorId, {
          detected: results.licensePlate.detected,
          detections: results.licensePlate.detections,
        });
      }
    }
    if (results.classifiers) {
      for (const [pluginId, classifierResult] of Object.entries(results.classifiers)) {
        const plugin = this.plugins.getAll(SensorType.Classifier).find((p) => p.pluginId === pluginId);
        if (plugin) {
          this.ingestDetectionResult(
            SensorType.Classifier,
            plugin.sensorId,
            {
              detected: classifierResult.detected,
              detections: classifierResult.detections,
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

  private async scaleForMotion(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const motionPlugin = this.plugins.get(SensorType.Motion);
    if (!motionPlugin?.requiresFrames) return undefined;

    const maxWidth = MOTION_WIDTH_MAP[this.motionResolution];
    const scaled = await this.frameScaler.scaleProportional(rawFrame, maxWidth, 'gray');
    return scaled ? this.frameScaler.toVideoFrameData(scaled) : undefined;
  }

  private async scaleForObject(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const objectPlugin = this.plugins.get(SensorType.Object);
    if (!objectPlugin?.requiresFrames) return undefined;

    const inputSpec = objectPlugin.modelSpec?.input;
    if (!isVideoInputSpec(inputSpec)) return undefined;

    const scaled = await this.frameScaler.scaleToSpec(rawFrame, inputSpec);
    return scaled ? this.frameScaler.toVideoFrameData(scaled) : undefined;
  }
}
