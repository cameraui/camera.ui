/* eslint-disable @stylistic/max-len */

import { isNoRespondersError, RPCClass, RPCMethod } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { DETECTION_SENSOR_TYPES, SENSOR_TYPE_CONFIG } from '../sensors/types.js';
import { normalizeZone } from '../utils/filter.js';
import { AudioSource } from './audio-source.js';
import { CascadeManager } from './cascade-manager.js';
import { DetectionPipeline } from './detection-pipeline.js';
import { DwellManager } from './dwell-manager.js';
import { DetectionEventManager } from './event-manager.js';
import { FrameScaler } from './frame-scaler.js';
import { FrameSource } from './frame-source.js';
import { PtzAutotracker } from './ptz-autotracker.js';
import { SnapshotSource } from './snapshot-source.js';
import { MOTION_WIDTH_MAP } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type {
  AudioFrameData,
  AudioModelSpec,
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
  ModelSpec,
  MotionResult,
  ObjectModelSpec,
  ObjectResult,
  PtzAutotrackSettings,
  StreamingRole,
  TrackedDetection,
  VideoFrameData,
  VideoInputSpec,
} from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { CoreManagerInterface } from '../../rpc/interfaces/core.js';
import type { CoordinatorSensorInfo, CroppedRegion, DetectionPluginInterface, DetectionResults, DetectionThumbnail } from '../../rpc/interfaces/detection.js';
import type { SensorWriteMessage } from '../../rpc/interfaces/sensor.js';
import type { AudioSourceConfig } from './audio-source.js';
import type { LineCrossingEvent } from './detection-pipeline.js';
import type {
  NormalizedDetectionZone,
  ProcessedDetectionData,
  TrackedClassifierDetection,
  TrackedClipEmbedding,
  TrackedFaceDetection,
  TrackedLicensePlateDetection,
} from './event-manager.js';
import type { ConsumerSpec, ScaleTarget } from './frame-scaler.js';
import type { FrameSourceConfig } from './frame-source.js';

type AnyModelSpec = ObjectModelSpec | ModelSpec | AudioModelSpec;

interface NvrFaceMatcher {
  matchFaces(embeddings: number[][], embeddingModel: string): Promise<({ identity: string } | null)[]>;
}

interface RegisteredPlugin {
  pluginId: string;
  sensorId: string;
  sensorType: SensorType;
  requiresFrames: boolean;
  modelSpec?: AnyModelSpec;
  proxy: Promisify<DetectionPluginInterface>;
}

export interface CoordinatorSourceUrl {
  role: StreamingRole;
  url: string;
}

export interface DetectionCoordinatorConfig {
  cameraId: string;
  streamUrl: string;
  snapshotUrl: string;
  audioStreamUrl: string;
  availableSources?: CoordinatorSourceUrl[];
  zones: DetectionZone[];
  lines: DetectionLine[];
  detectionSettings: CameraDetectionSettings;
  ptzAutotrack: PtzAutotrackSettings;
  frameWorkerSettings: CameraFrameWorkerSettings;
  interfaceSettings: CameraUiSettings;
}

// Default cascade hold-open window in seconds
export const DEFAULT_CASCADE_TIMEOUT = 10;

// Tracks below this speed (normalized units/s) are considered stationary.
// Typical values: parked bike ~0.0006, standing person ~0.003–0.03.
export const STATIONARY_SPEED_THRESHOLD = 0.002;

const OBJECT_DWELL_SECONDS = 2;
const DETECT_TIMEOUT_MS = 30_000;

const EVENT_THUMB_MAX_WIDTH = 640;
const DETECTION_THUMB_MAX_WIDTH = 640;
const DETECTION_THUMB_MIN_CROP = 160;
const DETECTION_THUMB_HQ_MAX_WIDTH = 640;
const DETECTION_THUMB_HQ_MIN_CROP = 640;
const DETECTION_THUMB_HQ_QUALITY = 80;
const ATTRIBUTE_THUMB_MAX_WIDTH = 640;
const ATTRIBUTE_THUMB_MIN_CROP = 128;
const EVENT_THUMB_HQ_MAX_WIDTH = 960;
const EVENT_THUMB_HQ_QUALITY = 75;
const HQ_FRAME_MAX_AGE_MS = 500;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} detection timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

@RPCClass
export class DetectionCoordinator {
  private frameSource: FrameSource;
  private frameScaler: FrameScaler;

  private singlePlugins = new Map<SensorType, RegisteredPlugin>();
  private multiPlugins = new Map<SensorType, Map<string, RegisteredPlugin>>();

  private loopRunning = false;
  private loopPromise?: Promise<void>;
  private videoStopPromise?: Promise<void>;

  private audioSource?: AudioSource;
  private audioLoopRunning = false;
  private audioLoopPromise?: Promise<void>;
  private audioStopPromise?: Promise<void>;
  private audioReconnectCount = 0;

  private reconnectCount = 0;
  private readonly maxReconnectCount = 10;
  private readonly normalReconnectDelay = 10000;
  private readonly maxReconnectDelay = 60000;

  private readonly ptzAutotracker: PtzAutotracker;
  private readonly eventManager: DetectionEventManager;
  private readonly cascade = new CascadeManager();
  private readonly dwell = new DwellManager();
  private pipeline: DetectionPipeline;

  private adHocVideoLoop = false;
  private processingExternalSecondary = false;

  private hqSnapshotSource?: SnapshotSource;
  private hqUpgradeInflight = false;
  private hqAspectWarned = false;

  private cascadeUnsubscribe?: () => void;
  private dwellUnsubscribe?: () => void;

  private seenStationaryTracks = new Set<number>();
  private readonly activeSensorTriggerTypes = new Map<string, string>();

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

  private get cascadeEnabled(): boolean {
    return this.config.detectionSettings.cascadeDetection !== false;
  }

  private get cascadeTimeoutSeconds(): number {
    return this.config.detectionSettings.cascadeTimeout ?? DEFAULT_CASCADE_TIMEOUT;
  }

  private get audioMinDecibels(): number {
    return this.config.detectionSettings.audio.minDecibels;
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

  private nvrProxy?: Promisify<NvrFaceMatcher>;
  private nvrProxyPromise?: Promise<Promisify<NvrFaceMatcher> | undefined>;

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
    this.frameSource = new FrameSource(frameSourceConfig, logger);
    this.frameScaler = new FrameScaler(null, logger);
    this.pipeline = new DetectionPipeline(config.zones, config.detectionSettings);

    const hqUrl = this.resolveHqSourceUrl(config.availableSources);
    if (hqUrl) {
      this.hqSnapshotSource = new SnapshotSource({ url: hqUrl }, logger);
    }
    this.syncHqSnapshotSource();

    if (config.lines.length > 0) {
      this.pipeline.updateLines(config.lines, this.videoAspectRatio);
    }

    this.eventManager = new DetectionEventManager(config.cameraId, this.proxy, this.logger);
    this.eventManager.onEventEnd(() => this.handleEventEnded());

    this.ptzAutotracker = new PtzAutotracker({
      logger: this.logger,
      proxy: this.proxy,
      cameraId: this.config.cameraId,
      settings: this.config.ptzAutotrack,
      onSuppressionActivated: () => this.clearMotionStateForSuppression(),
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
        // Only write detected/blocked for detection sensors (motion/audio/object).
        // Sensor triggers (contact/switch/light) manage their own properties.
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

  private handleCascadeDeactivated(): void {
    // Clear cascade-gated buffer slots but keep motion/audio intact
    const cs = this.currentDetectionState;
    cs.object = undefined;
    cs.face = undefined;
    cs.licensePlate = undefined;
    cs.classifiers = undefined;
    cs.clip = undefined;
    cs.lineCrossings = undefined;
    cs.cascadeTriggered = undefined;

    // Publish empty detections for all cascade-gated sensors so UI clears bboxes
    const clearTargets: { sensorId: string; type: SensorType }[] = [];
    for (const [type, plugin] of this.singlePlugins) {
      if (type === SensorType.Object || type === SensorType.Face || type === SensorType.LicensePlate) {
        clearTargets.push({ sensorId: plugin.sensorId, type });
      }
    }
    const classifierPlugins = this.multiPlugins.get(SensorType.Classifier);
    if (classifierPlugins) {
      for (const plugin of classifierPlugins.values()) {
        clearTargets.push({ sensorId: plugin.sensorId, type: SensorType.Classifier });
      }
    }

    for (const { sensorId } of clearTargets) {
      this.writeSensorProperties(sensorId, { detected: false, detections: [] });
    }

    // Tick EventManager — segment ends but event continues (motion still active)
    this.eventManager.processResults(this.buildSnapshot());
  }

  private handleEventEnded(): void {
    this.pipeline.cleanup();
    this.seenStationaryTracks.clear();
    this.activeSensorTriggerTypes.clear();
    this.currentDetectionState = {};
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
    const detections = properties.detections;
    if (!Array.isArray(detections) || detections.length === 0) return properties;

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
        return properties; // Audio etc — no zone filter
    }

    return {
      ...properties,
      detections: filtered,
      detected: filtered.length > 0,
    };
  }

  // PTZ-suppression gating happens upstream — callers decide whether a write
  // belongs in the full pipeline or autotracker-only.
  private ingestDetectionResult(sensorType: SensorType, sensorId: string, properties: Record<string, unknown>, pluginId?: string): void {
    this.updateBufferForType(sensorType, properties, pluginId);

    const detected = properties.detected === true;

    // Motion/Audio: dwell drives the detected/blocked/lastTriggered lifecycle
    // entirely (see dwell.onChange in the constructor); motion also cascades.
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
      // Object dwell — anti-chatter: a single missed frame must not split the
      // event. Stationary tracks refresh the dwell only ONCE (first sighting);
      // afterwards they're in seenStationaryTracks and don't count, so parked
      // cars/bikes can't keep events alive forever. Moving tracks always count.
      // The set is cleared on cascade deactivate (event boundary).
      const detections = (properties.detections as TrackedDetection[] | undefined) ?? [];
      let hasActiveTrack = false;
      for (const t of detections) {
        if (t.trackLost) continue;
        const isStationary = (t.trackSpeed ?? 0) < STATIONARY_SPEED_THRESHOLD;
        if (isStationary) {
          if (t.trackId !== undefined && !this.seenStationaryTracks.has(t.trackId)) {
            this.seenStationaryTracks.add(t.trackId);
            hasActiveTrack = true;
          }
        } else {
          hasActiveTrack = true;
        }
      }
      if (hasActiveTrack) {
        this.dwell.refresh(sensorId, OBJECT_DWELL_SECONDS);
      } else {
        // Only known stationary tracks — suppress detected and clear buffered
        // detections so the EventManager doesn't open a new segment; the UI
        // still gets the bboxes via the property publish below.
        properties.detected = false;
        if (this.currentDetectionState.object) {
          this.currentDetectionState.object.detected = false;
          this.currentDetectionState.object.detections = [];
        }
      }
    }

    // Dwell is the SOLE owner of detected/blocked/lastTriggered for these
    // types — a "no detection" frame must not overwrite the dwell-set state,
    // so strip them from the publish; dwell.onChange is the only writer.
    let publishProps = properties;
    if (sensorType === SensorType.Motion || sensorType === SensorType.Audio || sensorType === SensorType.Object) {
      const { detected: _d, blocked: _b, lastTriggered: _t, ...rest } = properties;
      publishProps = rest;
    }
    if (Object.keys(publishProps).length > 0) {
      this.writeSensorProperties(sensorId, publishProps);
    }
    // EventManager is NOT ticked here — processDetection flushes once per frame.
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
    this.syncHqSnapshotSource();
  }

  public updateInterfaceSettings(settings: CameraUiSettings): void {
    this.config.interfaceSettings = settings;
    if (this.config.lines.length > 0) {
      this.pipeline.updateLines(this.config.lines, this.videoAspectRatio);
    }
  }

  public async dispose(): Promise<void> {
    await this.stopVideoLoop();
    await this.stopAudioLoop();
    await this.hqSnapshotSource?.stop();
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

  private async registerDetectionPluginInternal(sensor: CoordinatorSensorInfo): Promise<void> {
    // Wait for any in-progress stop to complete before starting a new loop
    if (this.videoStopPromise) await this.videoStopPromise;
    if (this.audioStopPromise) await this.audioStopPromise;

    const wasVideoNeeded = this.shouldVideoBeActive();
    const wasAudioNeeded = this.shouldAudioBeActive();

    const namespaces = NamespaceManager.sensorProviderNamespaces(sensor.pluginId, this.config.cameraId, sensor.sensorId);
    const sensorProxy = this.proxy.createProxy<DetectionPluginInterface>(namespaces.sensorRpc);

    const pluginInfo: RegisteredPlugin = {
      pluginId: sensor.pluginId,
      sensorId: sensor.sensorId,
      sensorType: sensor.sensorType,
      requiresFrames: sensor.requiresFrames,
      modelSpec: sensor.modelSpec,
      proxy: sensorProxy,
    };

    if (this.isMultiProvider(sensor.sensorType)) {
      if (!this.multiPlugins.has(sensor.sensorType)) {
        this.multiPlugins.set(sensor.sensorType, new Map());
      }
      const typePlugins = this.multiPlugins.get(sensor.sensorType)!;
      if (typePlugins.has(sensor.pluginId)) return;

      typePlugins.set(sensor.pluginId, pluginInfo);
      this.logger.trace(`Multi-provider plugin registered: ${sensor.pluginId} for ${sensor.sensorType}`);
    } else {
      if (this.singlePlugins.has(sensor.sensorType)) return;

      this.singlePlugins.set(sensor.sensorType, pluginInfo);
      this.logger.trace(`Plugin registered: ${sensor.pluginId} for ${sensor.sensorType}`);
    }

    if (!wasVideoNeeded && this.shouldVideoBeActive()) {
      this.adHocVideoLoop = false;
      this.startVideoLoop();
    }
    if (!wasAudioNeeded && this.shouldAudioBeActive()) {
      this.startAudioLoop();
    }

    if (this.cascade.isActive) {
      this.startAdHocVideoLoopIfNeeded();
    }
  }

  private async removeDetectionPluginBySensor(sensorId: string): Promise<void> {
    const wasVideoNeeded = this.shouldVideoBeActive();
    const wasAudioNeeded = this.shouldAudioBeActive();
    let removed = false;

    for (const [sensorType, plugin] of this.singlePlugins) {
      if (plugin.sensorId === sensorId) {
        this.singlePlugins.delete(sensorType);
        removed = true;
        this.logger.trace(`Plugin unregistered: ${plugin.pluginId} (${sensorType})`);
      }
    }

    for (const [sensorType, typePlugins] of this.multiPlugins) {
      for (const [pluginId, plugin] of typePlugins) {
        if (plugin.sensorId === sensorId) {
          typePlugins.delete(pluginId);
          removed = true;
          this.logger.trace(`Multi-provider plugin unregistered: ${pluginId} (${sensorType})`);
        }
      }
      if (typePlugins.size === 0) this.multiPlugins.delete(sensorType);
    }

    if (!removed) return;

    if (!this.singlePlugins.has(SensorType.Object)) {
      this.adHocVideoLoop = false;
    }

    // Hot-reload: uses needsAdHocLoop() (not shouldVideoBeActive) so a loop
    // still needed by a frame-based object plugin isn't stopped accidentally.
    if (this.adHocVideoLoop && !this.needsAdHocLoop()) {
      this.adHocVideoLoop = false;
      this.logger.debug('Stopping ad-hoc video loop — last frame-based consumer removed');
      this.stopVideoLoop();
    }

    // Await to prevent race: a rapid re-register could start a second loop
    // while the old one is still shutting down.
    if (wasVideoNeeded && !this.shouldVideoBeActive() && !this.adHocVideoLoop) {
      await this.stopVideoLoop();
    }
    if (wasAudioNeeded && !this.shouldAudioBeActive()) {
      await this.stopAudioLoop();
    }
  }

  @RPCMethod
  public async reportSensorWrite(sensorId: string, sensorType: SensorType, properties: Record<string, unknown>): Promise<void> {
    if (sensorType === SensorType.Object) {
      const filtered = this.applyExternalDetectionFilters(sensorType, properties);

      // Always feed the autotracker (even during suppression, so it can decide
      // when to stop). External writes are presence-only — the presence channel
      // holds the return-to-home timer without driving the motor.
      const externalDetections = (filtered.detections as Detection[] | undefined) ?? [];
      this.ptzAutotracker.handlePresenceDetections(externalDetections);

      // During suppression tracker/pipeline/events stay gated — no stale
      // bboxes or false events from the camera pose change.
      if (this.ptzAutotracker.suppressionActive) return;

      this.ingestDetectionResult(SensorType.Object, sensorId, filtered);
      this.eventManager.processResults(this.buildSnapshot());

      if (!this.hasFrameBasedSecondary()) return;
      if (this.processingExternalSecondary) return; // busy-skip: previous RPC still running

      this.processingExternalSecondary = true;
      try {
        // Wrap external boxes as TrackedDetection (shape adapter, no real
        // tracking) so the secondary pipeline treats them like loop output.
        const rawExternal = (filtered.detections as Detection[] | undefined) ?? [];
        const objectDetections = this.pipeline.processExternal(rawExternal);

        // Fast path: loop is running and has a frame → crop mode.
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

        // Slow path: no loop frame yet → snapshot fetch, secondaries run
        // full-frame (no per-detection crops).
        const fetched = await this.frameSource.fetchSnapshotFrame();
        if (!fetched) return;
        try {
          const results: DetectionResults = { timestamp: Date.now() };
          const sceneJpeg = await this.runSecondariesFullFrame(fetched.frame, results);
          this.ingestResultsForAllSecondaries(results);
          const snapshot = this.buildSnapshot();
          if (sceneJpeg) snapshot.eventThumbnail = sceneJpeg;
          const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
          this.eventManager.processResults(snapshot);
          if (wantsEventThumb) {
            this.upgradeEventThumbnailAsync();
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
      // Fully gated during suppression — frame-diff is fake while the camera repositions.
      if (this.ptzAutotracker.suppressionActive) return;

      const filtered = this.applyExternalDetectionFilters(sensorType, properties);
      this.ingestDetectionResult(SensorType.Motion, sensorId, filtered);
      this.eventManager.processResults(this.buildSnapshot());
      this.fetchEventThumbnailAsync();
      return;
    }

    // External secondaries: direct ingest, no pixel work. Classifier (multi-
    // provider) needs the owning pluginId for buffer keying.
    let pluginId: string | undefined;
    if (sensorType === SensorType.Classifier) {
      const typePlugins = this.multiPlugins.get(SensorType.Classifier);
      if (typePlugins) {
        for (const plugin of typePlugins.values()) {
          if (plugin.sensorId === sensorId) {
            pluginId = plugin.pluginId;
            break;
          }
        }
      }
    }

    const filtered = this.applyExternalDetectionFilters(sensorType, properties);
    this.ingestDetectionResult(sensorType, sensorId, filtered, pluginId);
    this.eventManager.processResults(this.buildSnapshot());
  }

  @RPCMethod
  public reportSensorTrigger(sensorId: string, triggerType: string, action: 'activate' | 'deactivate', _sustained: boolean, timeoutSeconds: number): void {
    // Namespaced dwell key so trigger dwells don't overwrite the sensor's own
    // detected/blocked properties (contact/switch/light manage those themselves).
    const dwellKey = `trigger:${sensorId}`;

    if (action === 'activate') {
      this.activeSensorTriggerTypes.set(dwellKey, triggerType);
    }

    this.dwell.refresh(dwellKey, timeoutSeconds);

    if (action === 'activate' && this.cascadeEnabled) {
      this.cascade.triggerMomentary(this.cascadeTimeoutSeconds);
    }

    this.eventManager.processResults(this.buildSnapshot());

    // Trigger-only path (doorbell, contact) has no loop frame to encode from —
    // fetch the event thumb async; no-op if one was already captured.
    if (action === 'activate') {
      this.fetchEventThumbnailAsync();
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

  private clearMotionStateForSuppression(): void {
    const cs = this.currentDetectionState;
    cs.motion = undefined;

    const motionPlugin = this.singlePlugins.get(SensorType.Motion);
    if (motionPlugin) {
      this.writeSensorProperties(motionPlugin.sensorId, { detections: [] });
    }
  }

  @RPCMethod
  public hasPlugin(sensorType: SensorType): boolean {
    if (this.isMultiProvider(sensorType)) {
      const typePlugins = this.multiPlugins.get(sensorType);
      return typePlugins !== undefined && typePlugins.size > 0;
    }
    return this.singlePlugins.has(sensorType);
  }

  public getPlugin(sensorType: SensorType): RegisteredPlugin | undefined {
    return this.singlePlugins.get(sensorType);
  }

  public getPluginsForType(sensorType: SensorType): RegisteredPlugin[] {
    if (this.isMultiProvider(sensorType)) {
      const typePlugins = this.multiPlugins.get(sensorType);
      return typePlugins ? Array.from(typePlugins.values()) : [];
    }
    const plugin = this.singlePlugins.get(sensorType);
    return plugin ? [plugin] : [];
  }

  public getPlugins(): RegisteredPlugin[] {
    const allPlugins: RegisteredPlugin[] = [];
    for (const plugin of this.singlePlugins.values()) allPlugins.push(plugin);
    for (const typePlugins of this.multiPlugins.values()) {
      for (const plugin of typePlugins.values()) allPlugins.push(plugin);
    }
    return allPlugins;
  }

  public hasAnyPlugins(): boolean {
    if (this.singlePlugins.size > 0) return true;
    for (const typePlugins of this.multiPlugins.values()) {
      if (typePlugins.size > 0) return true;
    }
    return false;
  }

  public isRunning(): boolean {
    return this.loopRunning;
  }

  public isStreaming(): boolean {
    return this.frameSource.isStreaming;
  }

  private hasSecondaryModelSpec(spec: AnyModelSpec | undefined): spec is ModelSpec {
    return spec !== undefined && 'triggerLabels' in spec && Array.isArray(spec.triggerLabels);
  }

  private isVideoInputSpec(spec: unknown): spec is VideoInputSpec {
    return spec != null && typeof spec === 'object' && 'width' in spec && 'height' in spec && 'format' in spec;
  }

  private isOnEdge(box: { x: number; y: number; width: number; height: number }): boolean {
    return box.x < 0.02 || box.y < 0.02 || box.x + box.width > 0.98 || box.y + box.height > 0.98;
  }

  private isAudioModelSpec(spec: AnyModelSpec | undefined): spec is AudioModelSpec {
    return spec !== undefined && 'input' in spec && typeof spec.input === 'object' && 'sampleRate' in spec.input;
  }

  private isMultiProvider(sensorType: SensorType): boolean {
    return SENSOR_TYPE_CONFIG[sensorType]?.multiProvider === true;
  }

  // Video stream is permanently needed when: (1) frame-based motion detection, or
  // (2) audio plugin + object plugin for continuous audio-triggered cascade.
  // External motion (requiresFrames=false) and sensor cascade triggers use an ad-hoc
  // video loop — started on-demand, stopped when cascade ends. This prevents blocking
  // event-based cameras (e.g. Ring) that stop firing events while the stream is consumed.
  private shouldVideoBeActive(): boolean {
    const motionPlugin = this.singlePlugins.get(SensorType.Motion);
    const objectPlugin = this.singlePlugins.get(SensorType.Object);
    const audioPlugin = this.singlePlugins.get(SensorType.Audio);

    if (motionPlugin?.requiresFrames) return true;
    if (audioPlugin && objectPlugin?.requiresFrames) return true;

    return false;
  }

  private shouldAudioBeActive(): boolean {
    const audioPlugin = this.singlePlugins.get(SensorType.Audio);
    return audioPlugin?.requiresFrames === true;
  }

  private startVideoLoop(): void {
    if (this.loopRunning || this.videoStopPromise) return;

    this.logger.debug('Starting video detection loop');
    this.loopRunning = true;
    this.reconnectCount = 0;
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

  private startAudioLoop(): void {
    if (this.audioLoopRunning || this.audioStopPromise) return;

    this.logger.debug('Starting audio detection loop');
    this.audioLoopRunning = true;
    this.audioReconnectCount = 0;
    this.audioLoopPromise = this.runAudioDetectionLoop();
  }

  private async stopAudioLoop(): Promise<void> {
    if (!this.audioLoopRunning) {
      if (this.audioStopPromise) await this.audioStopPromise;
      return;
    }

    this.logger.debug('Stopping audio detection loop');
    this.audioLoopRunning = false;

    const doStop = async () => {
      await this.audioSource?.stop();
      await this.audioLoopPromise;
      this.audioLoopPromise = undefined;
    };

    this.audioStopPromise = doStop();
    try {
      await this.audioStopPromise;
    } finally {
      this.audioStopPromise = undefined;
    }
  }

  private hasFrameBasedSecondary(): boolean {
    const face = this.singlePlugins.get(SensorType.Face);
    if (face?.requiresFrames) return true;
    const lpd = this.singlePlugins.get(SensorType.LicensePlate);
    if (lpd?.requiresFrames) return true;
    const clip = this.singlePlugins.get(SensorType.Clip);
    if (clip?.requiresFrames) return true;
    const classifiers = this.multiPlugins.get(SensorType.Classifier);
    if (classifiers) {
      for (const p of classifiers.values()) {
        if (p.requiresFrames) return true;
      }
    }
    return false;
  }

  private needsAdHocLoop(): boolean {
    const obj = this.singlePlugins.get(SensorType.Object);
    if (!obj) return false;
    if (obj.requiresFrames) return true;
    return this.hasFrameBasedSecondary();
  }

  private startAdHocVideoLoopIfNeeded(): void {
    if (!this.loopRunning && this.needsAdHocLoop()) {
      this.adHocVideoLoop = true;
      this.logger.debug('Starting ad-hoc video loop for sensor cascade trigger');
      this.startVideoLoop();
    }
  }

  private stopAdHocVideoLoopIfIdle(): void {
    if (this.adHocVideoLoop && !this.shouldVideoBeActive()) {
      this.adHocVideoLoop = false;
      this.logger.debug('Stopping ad-hoc video loop — cascade ended');
      this.stopVideoLoop();
    }
  }

  private fetchEventThumbnailAsync(): void {
    void (async () => {
      try {
        const hqJpeg = await this.hqSnapshotSource?.snapshotJpeg(EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
        if (hqJpeg) {
          this.eventManager.publishEventThumbnail(hqJpeg);
          return;
        }

        await using handle = await this.frameSource.fetchSnapshotFrame();
        if (!handle) return;
        const jpeg = await this.frameScaler.frameToJPEG(handle.frame, EVENT_THUMB_MAX_WIDTH);
        if (!jpeg) return;
        this.eventManager.publishEventThumbnail(jpeg);
      } catch (e) {
        this.logger.debug('event-thumb snapshot failed:', e);
      }
    })();
  }

  // Fallback: async snapshot replacement of a substream event thumbnail —
  // only reached when the HQ source couldn't deliver a frame inline at event
  // start (still connecting, buffer not warm yet).
  private upgradeEventThumbnailAsync(): void {
    const source = this.hqSnapshotSource;
    if (!source?.isRunning || !source.hasBuffer || this.hqUpgradeInflight) return;

    this.hqUpgradeInflight = true;
    void (async () => {
      try {
        const jpeg = await source.snapshotJpeg(EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
        if (jpeg && this.eventManager.hasActiveEvent()) {
          this.eventManager.publishEventThumbnail(jpeg);
        }
      } catch (error) {
        this.logger.debug('Snapshot event thumbnail upgrade failed:', error);
      } finally {
        this.hqUpgradeInflight = false;
      }
    })();
  }

  // Recent snapshot frame + its scaler (own hardware context); caller disposes
  // the frame. With a reference size the aspect ratios must match — normalized
  // boxes only transfer between streams showing the same sensor area.
  private async acquireHqFrame(reference?: { width: number; height: number }): Promise<{ frame: Frame; scaler: FrameScaler } | null> {
    const source = this.hqSnapshotSource;
    if (!source?.isRunning || !source.hasBuffer) return null;
    const scaler = source.scaler;
    if (!scaler) return null;

    const frame = await source.getFrame(HQ_FRAME_MAX_AGE_MS);
    if (!frame) return null;

    if (reference) {
      const refAspect = reference.width / reference.height;
      const hqAspect = frame.width / frame.height;
      if (Math.abs(refAspect - hqAspect) / refAspect > 0.02) {
        if (!this.hqAspectWarned) {
          this.hqAspectWarned = true;
          this.logger.warn(
            `[hq-thumb] aspect mismatch (detection ${reference.width}x${reference.height} vs snapshot ${frame.width}x${frame.height}) — detection crops stay on the substream`,
          );
        }
        frame[Symbol.dispose]?.();
        return null;
      }
    }

    return { frame, scaler };
  }

  private resolveHqSourceUrl(sources?: CoordinatorSourceUrl[]): string | undefined {
    if (!sources?.length) return undefined;

    const order: CoordinatorSourceUrl['role'][] = ['high-resolution', 'mid-resolution', 'low-resolution'];
    const byRole = new Map(sources.map((s) => [s.role, s]));

    // Detection consumes the LOWEST available role (worker: lowRes ?? midRes
    // ?? streamSource) — the HQ companion is only worth a session when a
    // strictly higher-resolution role exists.
    const detectionRole = [...order].reverse().find((role) => byRole.has(role));
    const hqRole = order.find((role) => byRole.has(role));
    if (!detectionRole || !hqRole || hqRole === detectionRole) return undefined;

    return byRole.get(hqRole)!.url;
  }

  private syncHqSnapshotSource(): void {
    if (!this.hqSnapshotSource) return;

    const wanted = this.config.frameWorkerSettings.hqSnapshots === true;
    if (wanted && !this.hqSnapshotSource.isRunning) {
      this.hqSnapshotSource.start();
    } else if (!wanted && this.hqSnapshotSource.isRunning) {
      this.hqSnapshotSource.stop();
    }
  }

  private calculateDBFS(data: Buffer, format: 'pcm16' | 'float32'): number {
    let sumSquares = 0;
    let sampleCount = 0;

    if (format === 'float32') {
      const floatView = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
      sampleCount = floatView.length;
      for (let i = 0; i < sampleCount; i++) sumSquares += floatView[i] * floatView[i];
    } else {
      // PCM16: normalize [-32768, 32767] → [-1.0, 1.0]
      const int16View = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      sampleCount = int16View.length;
      for (let i = 0; i < sampleCount; i++) {
        const normalized = int16View[i] / 32768;
        sumSquares += normalized * normalized;
      }
    }

    if (sampleCount === 0) return -100;

    const rms = Math.sqrt(sumSquares / sampleCount);
    return rms > 0 ? 20 * Math.log10(Math.max(rms, 1e-10)) : -100;
  }

  private async runAudioDetectionLoop(): Promise<void> {
    const audioPlugin = this.singlePlugins.get(SensorType.Audio);
    if (!audioPlugin?.requiresFrames) return;

    const audioSpec = this.isAudioModelSpec(audioPlugin.modelSpec) ? audioPlugin.modelSpec : undefined;
    const sampleRate = audioSpec?.input.sampleRate ?? 16000;
    const channels = audioSpec?.input.channels ?? 1;
    const format = audioSpec?.input.format ?? 'float32';
    const samplesPerFrame = audioSpec?.input.samplesPerFrame;

    const audioConfig: AudioSourceConfig = {
      streamUrl: this.config.audioStreamUrl,
      sampleRate,
      channels,
      format,
      samplesPerFrame,
    };

    while (this.audioLoopRunning) {
      try {
        this.audioSource = new AudioSource(audioConfig, this.logger);
        await this.audioSource.start();

        this.logger.debug('Audio stream connected, processing audio frames...');
        this.audioReconnectCount = 0;

        let frameCount = 0;
        let lastAudioFrameId = -1;

        while (this.audioLoopRunning) {
          const snap = await this.audioSource.nextFrame(lastAudioFrameId);
          if (!snap) break; // source ended (stop or EOF)
          lastAudioFrameId = snap.id;
          const rawFrame = snap.frame;
          frameCount++;

          try {
            const frameData = rawFrame.data;
            if (!frameData?.[0]) continue;

            const rawData = frameData[0];
            const dBFS = this.calculateDBFS(rawData, format);
            if (dBFS < this.audioMinDecibels) continue;

            const audioFrame: AudioFrameData = {
              cameraId: this.config.cameraId,
              data: rawData,
              sampleRate,
              channels,
              format,
              timestamp: Date.now(),
            };

            const result = await audioPlugin.proxy.detectAudio(audioFrame);
            if (!result) continue;

            // Frame-based audio detection: cascade trigger when detected (Motion's
            // dwell counterpart for audio is handled in ingestDetectionResult).
            if (result.detected && this.cascadeEnabled) {
              const audioTimeout = this.config.detectionSettings.audio.timeout;
              this.cascade.triggerMomentary(audioTimeout);
            }

            // Funnel through the unified ingest path — same as external audio writes.
            this.ingestDetectionResult(SensorType.Audio, audioPlugin.sensorId, {
              detected: result.detected,
              detections: result.detections ?? [],
              ...(result.decibels !== undefined ? { decibels: result.decibels } : {}),
            });
          } catch (error) {
            this.logger.error('Audio detection error:', error);
          } finally {
            try {
              rawFrame[Symbol.dispose]?.();
            } catch {
              // Best effort
            }
          }
        }

        const streamError = this.audioSource.lastError;
        await this.audioSource.stop();

        if (this.audioLoopRunning && streamError) {
          this.audioReconnectCount = Math.min(this.audioReconnectCount + 1, this.maxReconnectCount);
          const delay = this.audioReconnectCount >= this.maxReconnectCount ? this.maxReconnectDelay : this.normalReconnectDelay;
          this.logger.warn(`Audio stream ended with read error, reconnecting in ${delay / 1000}s: ${streamError.message}`);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        } else if (this.audioLoopRunning && frameCount === 0) {
          this.logger.debug('Audio stream ended without frames, waiting before reconnect...');
          await new Promise<void>((resolve) => setTimeout(resolve, this.normalReconnectDelay));
        }
      } catch (error: any) {
        if (!this.audioLoopRunning) break;

        await this.audioSource?.stop();

        this.audioReconnectCount = Math.min(this.audioReconnectCount + 1, this.maxReconnectCount);
        const delay = this.audioReconnectCount >= this.maxReconnectCount ? this.maxReconnectDelay : this.normalReconnectDelay;

        this.logger.warn(`Audio stream error, reconnecting in ${delay / 1000}s: ${error.message}`);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    await this.audioSource?.stop();
    this.audioSource = undefined;
    this.logger.debug('Audio detection loop ended');
  }

  private async runDetectionLoop(): Promise<void> {
    while (this.loopRunning) {
      try {
        await this.frameSource.start();
        this.frameScaler.updateHardwareContext(this.frameSource.hardwareContext);

        this.logger.debug('Stream connected, processing frames...');
        this.reconnectCount = 0;

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
              // Best effort
            }
          }
        }

        const streamError = this.frameSource.lastError;
        await this.frameSource.stop();
        this.frameScaler.clearCache();

        if (this.loopRunning && streamError) {
          this.reconnectCount = Math.min(this.reconnectCount + 1, this.maxReconnectCount);
          const delay = this.reconnectCount >= this.maxReconnectCount ? this.maxReconnectDelay : this.normalReconnectDelay;
          this.logger.warn(`Stream ended with read error, reconnecting in ${delay / 1000}s: ${streamError.message}`);
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
        } else if (this.loopRunning && frameCount === 0) {
          this.logger.debug('Stream ended without frames, waiting before reconnect...');
          await new Promise<void>((resolve) => setTimeout(resolve, this.normalReconnectDelay));
        }
      } catch (error: any) {
        if (!this.loopRunning) break;

        await this.frameSource.stop();
        this.frameScaler.clearCache();

        this.reconnectCount = Math.min(this.reconnectCount + 1, this.maxReconnectCount);
        const delay = this.reconnectCount >= this.maxReconnectCount ? this.maxReconnectDelay : this.normalReconnectDelay;

        this.logger.warn(`Stream error, reconnecting in ${delay / 1000}s: ${error.message}`);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    await this.frameSource.stop();
    this.frameScaler.clearCache();
    this.logger.debug('Detection loop ended');
  }

  private async processRawFrame(rawFrame: Frame): Promise<void> {
    if (!this.loopRunning || !this.hasAnyPlugins()) return;

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

    // Refresh ReID every frame while cascade is active so dead tracks never
    // expire during the cascade window.
    if (this.cascade.isActive) {
      this.pipeline.refreshReid();
    }

    // PTZ suppression: motion is skipped entirely (frame-diff is garbage while
    // the camera repositions); object keeps running — Norfair gets the pose
    // delta so track ids survive pans, and the autotracker gates motor
    // commands on its own isPtzMoving state.
    const ptzSuppressed = this.ptzAutotracker.suppressionActive;

    // 1. Motion — every frame regardless of cascade state: keeps UI bboxes
    // fresh AND re-triggers the cascade so sustained motion keeps it alive.
    // The cascade gates OBJECT detection, not motion.
    const motionPlugin = this.singlePlugins.get(SensorType.Motion);

    if (motionPlugin?.requiresFrames && !ptzSuppressed) {
      const motionFrame = await this.scaleForMotion(rawFrame);
      if (!this.loopRunning) return;
      if (motionFrame) {
        try {
          const result = await motionPlugin.proxy.detectMotion(motionFrame);
          if (!this.loopRunning) return;
          if (result.detections.length > 0) {
            const filtered = this.pipeline.runMergeAndZoneFilter(result.detections);
            motionDetected = filtered.length > 0;
            results.motion = { ...result, detections: filtered };
          } else {
            // Plugin reports no motion this frame — record empty so UI clears stale bboxes
            results.motion = { detected: false, detections: [] };
          }
        } catch (error) {
          if (!this.loopRunning || isNoRespondersError(error)) return;
          this.logger.error('Motion detection error:', error);
        }
      }
    } else if (this.cascade.isActive) {
      // No frame-based motion plugin — cascade is the only motion-equivalent signal
      motionDetected = true;
      results.cascadeTriggered = true;
    }

    // `detected` is re-derived from post-zone-filter detections — the plugin's
    // own flag is ignored on purpose, zone filtering wins.
    if (results.motion && motionPlugin) {
      this.ingestDetectionResult(SensorType.Motion, motionPlugin.sensorId, {
        detected: motionDetected,
        detections: results.motion.detections,
      });
    }

    // 2. Object — gated by the cascade (wake sources: motion, audio, sensor
    // trigger), always-on when cascade is disabled, and kept running during
    // PTZ suppression so the tracker holds its lock across pans.
    const objectPlugin = this.singlePlugins.get(SensorType.Object);
    const shouldDetectObjects = objectPlugin?.requiresFrames === true && (ptzSuppressed || !this.cascadeEnabled || this.cascade.isActive);

    if (shouldDetectObjects) {
      const objectFrame = await this.scaleForObject(rawFrame);
      if (!this.loopRunning) return;
      if (objectFrame) {
        try {
          const result = await withTimeout(objectPlugin.proxy.detectObjects(objectFrame), DETECT_TIMEOUT_MS, 'Object');
          if (!this.loopRunning) return;

          // Full pipeline even on empty frames so Norfair advances Kalman
          // state; the PTZ pose delta keeps predictions world-stable across
          // pans (track ids survive instead of LOST → REACQUIRE).
          const poseDelta = this.ptzAutotracker.consumePoseDelta();
          const pipelineResult = this.pipeline.process(result.detections, objectFrame, poseDelta);

          // Extrapolated (Kalman-only) tracks smooth single-frame detector
          // misses in the UI, but are dropped once they drift off-frame —
          // otherwise ghost bboxes float outside the stream.
          const visibleTracks = pipelineResult.tracked.filter((t) => {
            if (!t.trackLost) return true;
            const cx = t.box.x + t.box.width * 0.5;
            const cy = t.box.y + t.box.height * 0.5;
            return cx > -0.1 && cx < 1.1 && cy > -0.1 && cy < 1.1;
          });
          objectDetections = visibleTracks.filter((t) => !t.trackLost);
          results.object = { ...result, detections: visibleTracks };
          if (pipelineResult.crossings.length > 0) results.lineCrossings = pipelineResult.crossings;

          // Feed the autotracker ALL tracked detections incl. extrapolated —
          // a single missed detector frame must not flip it into LOST/REACQUIRE
          // churn. It gates motor decisions on its own isPtzMoving flag.
          this.ptzAutotracker.handleObjectDetections(pipelineResult.tracked);
        } catch (error) {
          if (!this.loopRunning || isNoRespondersError(error)) return;
          this.logger.error('Object detection error:', error);
        }
      }
    }

    if (results.lineCrossings && results.lineCrossings.length > 0) {
      for (const c of results.lineCrossings) {
        this.logger.debug(`Line crossing: ${c.label}#${c.trackId} crossed "${c.lineName}" dir=${c.direction} conf=${c.confidence.toFixed(2)}`);
      }
      // Buffer line crossings so the EventManager snapshot picks them up
      this.currentDetectionState.lineCrossings = results.lineCrossings;
    }

    // Same rule as motion: detected is re-derived from post-pipeline detections.
    if (results.object && objectPlugin) {
      this.ingestDetectionResult(SensorType.Object, objectPlugin.sensorId, {
        detected: objectDetections.length > 0,
        detections: results.object.detections,
      });
    }

    if (!this.loopRunning) return;

    // 3. Secondary detectors + per-detection thumbnails. Result-collection
    // only — the shared ingest below keeps loop tick and external-RPC path
    // on the same helper.
    if (objectDetections.length > 0) {
      await this.runSecondariesAndThumbnails(rawFrame, objectDetections, results);
    }

    if (!this.loopRunning) return;

    // 4. Unified ingest.
    this.ingestResultsForAllSecondaries(results);

    // 5. Single flush per frame, AFTER all detectors + thumbnails — so
    // segment-start messages already carry thumbnails and secondary data.
    if (!this.loopRunning) return;
    const snapshot = this.buildSnapshot();
    if (results.thumbnails && results.thumbnails.length > 0) {
      snapshot.thumbnails = results.thumbnails;
    }

    // Event-level thumbnail — generated lazily when the EventManager still
    // needs one OR this frame's triggers will start an event (pre-encode so
    // the 'start' message carries it inline). Attaching is harmless either
    // way; EventManager only consumes it while needsEventThumbnail is true.
    // Full frame prefers the snapshot source (no aspect constraint needed).
    const wantsEventThumb = this.eventManager.needsThumbnail() || this.snapshotWillStartEvent(snapshot);
    let hqThumbAttached = false;
    if (wantsEventThumb) {
      try {
        const hq = await this.acquireHqFrame();
        try {
          if (hq) {
            const jpeg = await hq.scaler.frameToJPEG(hq.frame, EVENT_THUMB_HQ_MAX_WIDTH, EVENT_THUMB_HQ_QUALITY);
            if (jpeg) {
              snapshot.eventThumbnail = jpeg;
              hqThumbAttached = true;
            }
          }
          if (!snapshot.eventThumbnail) {
            const jpeg = await this.frameScaler.frameToJPEG(rawFrame, EVENT_THUMB_MAX_WIDTH);
            if (jpeg) snapshot.eventThumbnail = jpeg;
          }
        } finally {
          hq?.frame[Symbol.dispose]?.();
        }
      } catch (error) {
        this.logger.error('Event thumbnail generation error:', error);
      }
    }

    this.eventManager.processResults(snapshot);

    // Inline HQ succeeded → nothing to upgrade; otherwise the async path
    // covers the window where the HQ source wasn't ready at event start.
    if (wantsEventThumb && !hqThumbAttached) {
      this.upgradeEventThumbnailAsync();
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

  private async resolveFaceIdentities(faces: FaceDetection[]): Promise<void> {
    const withEmbeddings = faces.filter((f) => f.embedding?.length);
    if (!withEmbeddings.length) return;

    const facePlugin = this.singlePlugins.get(SensorType.Face);
    const embeddingModel = (facePlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    if (!embeddingModel) return;

    const nvr = await this.getNvrProxy();
    if (!nvr) return;

    try {
      const embeddings = withEmbeddings.map((f) => f.embedding!);
      const matches = await nvr.matchFaces(embeddings, embeddingModel);
      for (let i = 0; i < withEmbeddings.length; i++) {
        if (matches[i]) {
          withEmbeddings[i].identity = matches[i]!.identity;
        }
      }
    } catch (error) {
      if (!this.loopRunning || isNoRespondersError(error)) return;
      this.logger.error('Could not resolve face identities:', error);
    }
  }

  private async scaleForMotion(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const motionPlugin = this.singlePlugins.get(SensorType.Motion);
    if (!motionPlugin?.requiresFrames) return undefined;

    const maxWidth = MOTION_WIDTH_MAP[this.motionResolution];
    const scaled = await this.frameScaler.scaleProportional(rawFrame, maxWidth, 'gray');
    return scaled ? this.frameScaler.toVideoFrameData(scaled) : undefined;
  }

  private async scaleForObject(rawFrame: Frame): Promise<VideoFrameData | undefined> {
    const objectPlugin = this.singlePlugins.get(SensorType.Object);
    if (!objectPlugin?.requiresFrames) return undefined;

    const inputSpec = objectPlugin.modelSpec?.input;
    if (!this.isVideoInputSpec(inputSpec)) return undefined;

    const scaled = await this.frameScaler.scaleToSpec(rawFrame, inputSpec);
    return scaled ? this.frameScaler.toVideoFrameData(scaled) : undefined;
  }

  private async prepareSecondaryRegions(rawFrame: Frame, objectDetections: Detection[]): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();

    const consumers: ConsumerSpec[] = [];

    const facePlugin = this.singlePlugins.get(SensorType.Face);
    if (facePlugin && this.hasSecondaryModelSpec(facePlugin.modelSpec) && this.isVideoInputSpec(facePlugin.modelSpec.input)) {
      consumers.push({ key: 'face', triggerLabels: facePlugin.modelSpec.triggerLabels, input: facePlugin.modelSpec.input });
    }

    const lpdPlugin = this.singlePlugins.get(SensorType.LicensePlate);
    if (lpdPlugin && this.hasSecondaryModelSpec(lpdPlugin.modelSpec) && this.isVideoInputSpec(lpdPlugin.modelSpec.input)) {
      consumers.push({ key: 'lpd', triggerLabels: lpdPlugin.modelSpec.triggerLabels, input: lpdPlugin.modelSpec.input });
    }

    const clipPlugin = this.singlePlugins.get(SensorType.Clip);
    if (clipPlugin && this.hasSecondaryModelSpec(clipPlugin.modelSpec) && this.isVideoInputSpec(clipPlugin.modelSpec.input)) {
      consumers.push({ key: 'clip', triggerLabels: clipPlugin.modelSpec.triggerLabels, input: clipPlugin.modelSpec.input });
    }

    const classifierPlugins = this.multiPlugins.get(SensorType.Classifier);
    if (classifierPlugins) {
      for (const [pluginId, classifierPlugin] of classifierPlugins) {
        if (this.hasSecondaryModelSpec(classifierPlugin.modelSpec) && this.isVideoInputSpec(classifierPlugin.modelSpec.input)) {
          consumers.push({ key: `classifier:${pluginId}`, triggerLabels: classifierPlugin.modelSpec.triggerLabels, input: classifierPlugin.modelSpec.input });
        }
      }
    }

    if (consumers.length === 0) return result;

    for (const detection of objectDetections) {
      const detLabel = detection.label.toLowerCase();
      const targets: ScaleTarget[] = [];

      for (const consumer of consumers) {
        if (consumer.triggerLabels.length === 0 || consumer.triggerLabels.some((l) => l.toLowerCase() === detLabel)) {
          targets.push({ key: consumer.key, width: consumer.input.width, height: consumer.input.height, format: consumer.input.format });
        }
      }

      if (targets.length === 0) continue;

      // Consumers with identical dimensions share one scaled region
      const uniqueTargets: ScaleTarget[] = [];
      const dupeMap = new Map<string, string[]>(); // sizeKey → [consumerKey, ...]
      for (const t of targets) {
        const sizeKey = `${t.width}x${t.height}_${t.format}`;
        const existing = dupeMap.get(sizeKey);
        if (existing) {
          existing.push(t.key);
        } else {
          dupeMap.set(sizeKey, [t.key]);
          uniqueTargets.push(t);
        }
      }

      const regions = await this.frameScaler.cropAndScaleMulti(rawFrame, detection, uniqueTargets);

      for (const [_sizeKey, consumerKeys] of dupeMap) {
        const primaryKey = consumerKeys[0];
        const region = regions.get(primaryKey);
        if (!region) continue;
        for (const key of consumerKeys) {
          const list = result.get(key);
          if (list) {
            list.push(region);
          } else {
            result.set(key, [region]);
          }
        }
      }
    }

    return result;
  }

  private async runSecondaryDetection(
    type: SensorType.Face | SensorType.LicensePlate | SensorType.Classifier | SensorType.Clip,
    results: DetectionResults,
    fn: () => Promise<any> | Promise<any>[],
  ): Promise<void> {
    let detections: FaceResult | LicensePlateResult | ClipResult | { pluginId: string; result: ClassifierResult }[] | undefined = undefined;

    try {
      detections = await fn();
    } catch (error) {
      if (!this.loopRunning || isNoRespondersError(error)) return;
      const logType = type === SensorType.Face ? 'Face' : type === SensorType.LicensePlate ? 'License plate' : type === SensorType.Clip ? 'CLIP' : 'Classifier';
      this.logger.error(`${logType} detection error:`, error);
    }

    if (!detections) return;

    if (type === SensorType.Face) {
      results.face = detections as FaceResult;
      await this.resolveFaceIdentities(results.face.detections);
    } else if (type === SensorType.LicensePlate) {
      results.licensePlate = detections as LicensePlateResult;
    } else if (type === SensorType.Clip) {
      results.clip = detections as ClipResult;
      const clipPlugin = this.singlePlugins.get(SensorType.Clip);
      results.clipEmbeddingModel = (clipPlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    } else if (type === SensorType.Classifier) {
      results.classifiers ??= {};
      for (const { pluginId, result } of detections as { pluginId: string; result: ClassifierResult }[]) {
        results.classifiers[pluginId] = result;
      }
      if (Object.keys(results.classifiers).length === 0) delete results.classifiers;
    }
  }

  private ingestResultsForAllSecondaries(results: DetectionResults): void {
    if (results.face) {
      const facePlugin = this.singlePlugins.get(SensorType.Face);
      if (facePlugin) {
        this.ingestDetectionResult(SensorType.Face, facePlugin.sensorId, {
          detected: results.face.detected,
          detections: results.face.detections,
        });
      }
    }
    if (results.licensePlate) {
      const lpdPlugin = this.singlePlugins.get(SensorType.LicensePlate);
      if (lpdPlugin) {
        this.ingestDetectionResult(SensorType.LicensePlate, lpdPlugin.sensorId, {
          detected: results.licensePlate.detected,
          detections: results.licensePlate.detections,
        });
      }
    }
    if (results.classifiers) {
      const classifierPlugins = this.multiPlugins.get(SensorType.Classifier);
      if (classifierPlugins) {
        for (const [pluginId, classifierResult] of Object.entries(results.classifiers)) {
          const plugin = classifierPlugins.get(pluginId);
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
    }
    if (results.clip) {
      // Clip has no sensor properties — embeddings flow through buffer only.
      this.currentDetectionState.clip = results.clip;
      this.currentDetectionState.clipEmbeddingModel = results.clipEmbeddingModel;
    }
  }

  private async runSecondariesAndThumbnails(rawFrame: Frame, objectDetections: Detection[], results: DetectionResults): Promise<void> {
    if (objectDetections.length === 0) return;

    const regionMap = await this.prepareSecondaryRegions(rawFrame, objectDetections);

    await Promise.allSettled([
      this.runSecondaryDetection(SensorType.Face, results, () => this.runFaceDetection(regionMap.get('face') ?? [])),
      this.runSecondaryDetection(SensorType.LicensePlate, results, () => this.runLicensePlateDetection(regionMap.get('lpd') ?? [])),
      this.runSecondaryDetection(SensorType.Classifier, results, () => this.runClassifierDetections(regionMap)),
      this.runSecondaryDetection(SensorType.Clip, results, () => this.runClipDetection(regionMap.get('clip') ?? [])),
    ]);

    if (results.face?.detections.length) {
      const facePlugin = this.singlePlugins.get(SensorType.Face);
      results.faceEmbeddingModel = (facePlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
      this.currentDetectionState.faceEmbeddingModel = results.faceEmbeddingModel;
    }

    try {
      // Detectors consumed the substream frame above; images destined for the
      // event (chips, scene) prefer the snapshot frame when available.
      const hq = await this.acquireHqFrame({ width: rawFrame.width, height: rawFrame.height });
      try {
        results.thumbnails = await this.generateThumbnails(hq?.frame ?? rawFrame, hq?.scaler ?? this.frameScaler, hq !== null, objectDetections, results);
      } finally {
        hq?.frame[Symbol.dispose]?.();
      }
    } catch (error) {
      this.logger.error('Thumbnail generation error:', error);
    }
  }

  private async runSecondariesFullFrame(rawFrame: Frame, results: DetectionResults): Promise<Buffer | null> {
    const regionMap = await this.prepareFullFrameRegions(rawFrame);

    if (regionMap.size > 0) {
      await Promise.allSettled([
        this.runSecondaryDetection(SensorType.Face, results, () => this.runFaceDetection(regionMap.get('face') ?? [])),
        this.runSecondaryDetection(SensorType.LicensePlate, results, () => this.runLicensePlateDetection(regionMap.get('lpd') ?? [])),
        this.runSecondaryDetection(SensorType.Classifier, results, () => this.runClassifierDetections(regionMap)),
        this.runSecondaryDetection(SensorType.Clip, results, () => this.runClipDetection(regionMap.get('clip') ?? [])),
      ]);

      if (results.face?.detections.length) {
        const facePlugin = this.singlePlugins.get(SensorType.Face);
        results.faceEmbeddingModel = (facePlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
        this.currentDetectionState.faceEmbeddingModel = results.faceEmbeddingModel;
      }
    }

    try {
      return await this.frameScaler.frameToJPEG(rawFrame, EVENT_THUMB_MAX_WIDTH);
    } catch (error) {
      this.logger.debug('Full-frame scene thumbnail failed:', error);
      return null;
    }
  }

  private async prepareFullFrameRegions(rawFrame: Frame): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();
    const consumers: ConsumerSpec[] = [];

    const facePlugin = this.singlePlugins.get(SensorType.Face);
    if (facePlugin?.requiresFrames && this.hasSecondaryModelSpec(facePlugin.modelSpec) && this.isVideoInputSpec(facePlugin.modelSpec.input)) {
      consumers.push({ key: 'face', triggerLabels: facePlugin.modelSpec.triggerLabels, input: facePlugin.modelSpec.input });
    }
    const lpdPlugin = this.singlePlugins.get(SensorType.LicensePlate);
    if (lpdPlugin?.requiresFrames && this.hasSecondaryModelSpec(lpdPlugin.modelSpec) && this.isVideoInputSpec(lpdPlugin.modelSpec.input)) {
      consumers.push({ key: 'lpd', triggerLabels: lpdPlugin.modelSpec.triggerLabels, input: lpdPlugin.modelSpec.input });
    }
    const clipPlugin = this.singlePlugins.get(SensorType.Clip);
    if (clipPlugin?.requiresFrames && this.hasSecondaryModelSpec(clipPlugin.modelSpec) && this.isVideoInputSpec(clipPlugin.modelSpec.input)) {
      consumers.push({ key: 'clip', triggerLabels: clipPlugin.modelSpec.triggerLabels, input: clipPlugin.modelSpec.input });
    }
    const classifierPlugins = this.multiPlugins.get(SensorType.Classifier);
    if (classifierPlugins) {
      for (const [pluginId, plugin] of classifierPlugins) {
        if (plugin.requiresFrames && this.hasSecondaryModelSpec(plugin.modelSpec) && this.isVideoInputSpec(plugin.modelSpec.input)) {
          consumers.push({ key: `classifier:${pluginId}`, triggerLabels: plugin.modelSpec.triggerLabels, input: plugin.modelSpec.input });
        }
      }
    }

    if (consumers.length === 0) return result;

    const frameWidth = rawFrame.width;
    const frameHeight = rawFrame.height;
    const fullFrameDetection: Detection = {
      label: 'person',
      confidence: 1.0,
      box: { x: 0, y: 0, width: 1, height: 1 },
    };

    for (const consumer of consumers) {
      const scaled = await this.frameScaler.scaleToSpec(rawFrame, consumer.input);
      if (!scaled) continue;
      const region: CroppedRegion = {
        frame: this.frameScaler.toVideoFrameData(scaled, `fullframe:${consumer.key}`),
        detection: fullFrameDetection,
        offset: { x: 0, y: 0 },
        cropSize: { width: frameWidth, height: frameHeight },
        originalSize: { width: frameWidth, height: frameHeight },
      };
      result.set(consumer.key, [region]);
    }

    return result;
  }

  private prepareSecondaryFrames(croppedRegions: CroppedRegion[]): VideoFrameData[] {
    return croppedRegions.map((r, i) => ({ ...r.frame, id: String(i), label: r.detection.label }));
  }

  private async runFaceDetection(croppedRegions: CroppedRegion[]): Promise<FaceResult | undefined> {
    const facePlugin = this.singlePlugins.get(SensorType.Face);
    if (!facePlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await withTimeout(facePlugin.proxy.detectFaces(this.prepareSecondaryFrames(croppedRegions)), DETECT_TIMEOUT_MS, 'Face');
    const allFaces: TrackedFaceDetection[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;

      for (const face of batchResults[i].detections) {
        const transformed = this.transformBoxToOriginal(face.box, croppedRegions[i]);
        allFaces.push({ ...face, box: transformed, parentTrackId });
      }
    }

    if (allFaces.length === 0) return { detected: false, detections: [] };
    // NMS only — zone filter is skipped because face crops come from
    // object detections that already passed zone filtering in process().
    const deduped = this.pipeline.runNms(allFaces);
    return { detected: deduped.length > 0, detections: deduped };
  }

  private async runLicensePlateDetection(croppedRegions: CroppedRegion[]): Promise<LicensePlateResult | undefined> {
    const lpdPlugin = this.singlePlugins.get(SensorType.LicensePlate);
    if (!lpdPlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await withTimeout(lpdPlugin.proxy.detectLicensePlates(this.prepareSecondaryFrames(croppedRegions)), DETECT_TIMEOUT_MS, 'License plate');
    const allPlates: TrackedLicensePlateDetection[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;
      for (const plate of batchResults[i].detections) {
        allPlates.push({ ...plate, box: this.transformBoxToOriginal(plate.box, croppedRegions[i]), parentTrackId });
      }
    }

    if (allPlates.length === 0) return { detected: false, detections: [] };
    // NMS only — zone filter skipped (crops from already-filtered object boxes).
    const deduped = this.pipeline.runNms(allPlates);
    return { detected: deduped.length > 0, detections: deduped };
  }

  private runClassifierDetections(regionMap: Map<string, CroppedRegion[]>): Promise<{ pluginId: string; result: ClassifierResult } | undefined>[] {
    const classifierPlugins = this.multiPlugins.get(SensorType.Classifier);
    if (!classifierPlugins || classifierPlugins.size === 0) return [];

    const promises: Promise<{ pluginId: string; result: ClassifierResult } | undefined>[] = [];

    for (const [pluginId, classifierPlugin] of classifierPlugins) {
      const croppedRegions = regionMap.get(`classifier:${pluginId}`);
      if (!croppedRegions || croppedRegions.length === 0) continue;

      const runClassifier = async (): Promise<{ pluginId: string; result: ClassifierResult } | undefined> => {
        const batchResults = await withTimeout(
          classifierPlugin.proxy.detectClassifications(this.prepareSecondaryFrames(croppedRegions)),
          DETECT_TIMEOUT_MS,
          'Classifier',
        );
        const allDetections: TrackedClassifierDetection[] = [];

        for (let i = 0; i < batchResults.length; i++) {
          const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;
          for (const detection of batchResults[i].detections) {
            allDetections.push({ ...detection, box: this.transformBoxToOriginal(detection.box, croppedRegions[i]), parentTrackId });
          }
        }

        if (allDetections.length === 0) return undefined;
        const deduped = this.pipeline.runNms(allDetections);
        if (deduped.length === 0) return undefined;
        return { pluginId, result: { detected: true, detections: deduped } };
      };

      promises.push(runClassifier());
    }

    return promises;
  }

  private async runClipDetection(croppedRegions: CroppedRegion[]): Promise<ClipResult | undefined> {
    const clipPlugin = this.singlePlugins.get(SensorType.Clip);
    if (!clipPlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await withTimeout(clipPlugin.proxy.detectEmbeddings(this.prepareSecondaryFrames(croppedRegions)), DETECT_TIMEOUT_MS, 'CLIP');
    const allEmbeddings: TrackedClipEmbedding[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      if (batchResults[i].embeddings && batchResults[i].embeddings.length > 0) {
        const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;
        for (const emb of batchResults[i].embeddings) {
          const transformed = this.transformBoxToOriginal(emb.box, croppedRegions[i]);
          allEmbeddings.push({ ...emb, box: transformed, parentTrackId });
        }
      }
    }

    if (allEmbeddings.length === 0) return undefined;
    const embeddingModel = (clipPlugin.modelSpec as ModelSpec | undefined)?.embeddingModel ?? '';
    return { embeddings: allEmbeddings, embeddingModel };
  }

  private async generateThumbnails(
    sourceFrame: Frame,
    scaler: FrameScaler,
    usingHq: boolean,
    objectDetections: Detection[],
    results: DetectionResults,
  ): Promise<DetectionThumbnail[]> {
    const thumbnails: DetectionThumbnail[] = [];
    const attributePadding = usingHq ? 0.4 : 0.75;
    const detectionMaxWidth = usingHq ? DETECTION_THUMB_HQ_MAX_WIDTH : DETECTION_THUMB_MAX_WIDTH;
    const detectionMinCrop = usingHq ? DETECTION_THUMB_HQ_MIN_CROP : DETECTION_THUMB_MIN_CROP;
    const detectionQuality = usingHq ? DETECTION_THUMB_HQ_QUALITY : undefined;

    // Object thumbnails — objectDetections are TrackedDetection[] when tracker ran
    const objectCrops = await scaler.cropToJPEG(sourceFrame, objectDetections, {
      maxWidth: detectionMaxWidth,
      padding: 0.3,
      minCrop: detectionMinCrop,
      quality: detectionQuality,
    });
    for (const crop of objectCrops) {
      const detection = objectDetections[crop.index];
      if (detection) {
        thumbnails.push({
          label: detection.label,
          score: detection.confidence,
          jpeg: crop.jpeg,
          area: detection.box.width * detection.box.height,
          onEdge: this.isOnEdge(detection.box),
          trackId: 'trackId' in detection ? (detection as TrackedDetection).trackId : undefined,
          speed: 'trackSpeed' in detection ? (detection as TrackedDetection).trackSpeed : undefined,
        });
      }
    }

    if (results.face?.detections) {
      const faceCrops = await scaler.cropToJPEG(sourceFrame, results.face.detections, {
        maxWidth: ATTRIBUTE_THUMB_MAX_WIDTH,
        padding: attributePadding,
        minCrop: ATTRIBUTE_THUMB_MIN_CROP,
      });
      for (const crop of faceCrops) {
        const detection = results.face.detections[crop.index];
        if (detection) {
          // Inline on the detection so enrichSegment can persist unknown
          // faces to the face store.
          detection.thumbnail ??= crop.jpeg;
          thumbnails.push({
            label: `face:${detection.identity ?? 'unknown'}`,
            score: detection.confidence,
            jpeg: crop.jpeg,
            area: detection.box.width * detection.box.height,
            onEdge: this.isOnEdge(detection.box),
          });
        }
      }
    }

    if (results.licensePlate?.detections) {
      const plateCrops = await scaler.cropToJPEG(sourceFrame, results.licensePlate.detections, {
        maxWidth: ATTRIBUTE_THUMB_MAX_WIDTH,
        padding: attributePadding,
        minCrop: ATTRIBUTE_THUMB_MIN_CROP,
      });
      for (const crop of plateCrops) {
        const detection = results.licensePlate.detections[crop.index];
        if (detection) {
          thumbnails.push({
            label: `plate:${detection.plateText ?? 'unknown'}`,
            score: detection.confidence,
            jpeg: crop.jpeg,
            area: detection.box.width * detection.box.height,
            onEdge: this.isOnEdge(detection.box),
          });
        }
      }
    }

    if (results.classifiers) {
      for (const classifierResult of Object.values(results.classifiers)) {
        const clsCrops = await scaler.cropToJPEG(sourceFrame, classifierResult.detections, {
          maxWidth: detectionMaxWidth,
          padding: 0.3,
          minCrop: detectionMinCrop,
          quality: detectionQuality,
        });
        for (const crop of clsCrops) {
          const detection = classifierResult.detections[crop.index];
          if (detection) {
            thumbnails.push({
              label: `class:${detection.label}`,
              score: detection.confidence,
              jpeg: crop.jpeg,
              area: detection.box.width * detection.box.height,
              onEdge: this.isOnEdge(detection.box),
            });
          }
        }
      }
    }

    return thumbnails;
  }

  private transformBoxToOriginal(
    box: { x: number; y: number; width: number; height: number },
    region: CroppedRegion,
  ): { x: number; y: number; width: number; height: number } {
    // box coordinates are normalized (0-1) relative to the scaled frame (e.g. 320x320),
    // but must be mapped back through the original crop dimensions (before scaling)
    const pixelX = box.x * region.cropSize.width + region.offset.x;
    const pixelY = box.y * region.cropSize.height + region.offset.y;
    const pixelW = box.width * region.cropSize.width;
    const pixelH = box.height * region.cropSize.height;

    return {
      x: pixelX / region.originalSize.width,
      y: pixelY / region.originalSize.height,
      width: pixelW / region.originalSize.width,
      height: pixelH / region.originalSize.height,
    };
  }

  private getNvrProxy(): Promise<Promisify<NvrFaceMatcher> | undefined> {
    if (this.nvrProxy) return Promise.resolve(this.nvrProxy);

    this.nvrProxyPromise ??= this.resolveNvrProxy().finally(() => {
      this.nvrProxyPromise = undefined;
    });

    return this.nvrProxyPromise;
  }

  private async resolveNvrProxy(): Promise<Promisify<NvrFaceMatcher> | undefined> {
    try {
      const coreManagerProxy = this.proxy.createProxy<CoreManagerInterface>(NamespaceManager.coreManagerNamespaces().coreManagerRpc);
      const plugin = await coreManagerProxy.getPlugin('@camera.ui/camera-ui-nvr');
      if (!plugin) {
        return undefined;
      }

      const ns = NamespaceManager.pluginNamespaces(plugin.id);
      const connection = this.proxy.createProxy<NvrFaceMatcher>(ns.pluginChildRpc, { isolatedConnection: true });
      this.nvrProxy = connection.proxy;
      return this.nvrProxy;
    } catch (error) {
      this.logger.error('NVR proxy resolution failed:', error);
      return undefined;
    }
  }
}
