import { PromiseTimeout } from '@camera.ui/common/utils';
import { isNoRespondersError } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { detectionRecord } from './debug/detection-record.js';
import { EVENT_THUMB_MAX_WIDTH } from './event-thumbnailer.js';
import { directionBetween, MOMENT_QUALITY, momentFormat, momentWindow } from './moment-crop.js';
import { MIN_PLATE_LENGTH, normalizePlateText } from './plate-vote.js';
import { hasSecondaryModelSpec, isVideoInputSpec } from './plugin-registry.js';
import { SideQueue } from './side-queue.js';
import { DETECT_TIMEOUT_MS, ensureDetectionBoxes, FULL_FRAME_BOX } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { BoundingBox, ClassifierResult, Detection, FaceResult, LicensePlateResult, ModelSpec, Point, TrackedDetection, VideoFrameData } from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { CoreManagerInterface } from '../../rpc/interfaces/core.js';
import type { CroppedRegion, DetectionResults, DetectionThumbnail, ServerFaceDetection } from '../../rpc/interfaces/detection.js';
import type { DetectionCoordinator } from './detection-coordinator.js';
import type { DetectionPipeline } from './detection-pipeline.js';
import type { TrackedClassifierDetection, TrackedClipEmbedding, TrackedFaceDetection, TrackedLicensePlateDetection } from './event-manager.js';
import type { ConsumerSpec, CropFit, FrameScaler, ScaleTarget } from './frame-scaler.js';
import type { CropWindow } from './moment-crop.js';
import type { PerfTracker } from './perf-tracker.js';
import type { PluginRegistry } from './plugin-registry.js';

const SECONDARY_CONSUMERS: { type: SensorType; key: string; fit: CropFit }[] = [
  { type: SensorType.Face, key: 'face', fit: 'expand' },
  { type: SensorType.LicensePlate, key: 'lpd', fit: 'stretch' },
];

interface NvrFaceMatcher {
  matchFaces(embeddings: number[][], embeddingModel: string, sensitivity: string): Promise<({ identity: string } | null)[]>;
}

const MIN_FACE_PX = 40;
const FACE_CROP_PADDING = 0.25;
const EMBED_EVERY_MS = 1_000;
const GOOD_VECTORS_PER_TRACK = 3;
const EMBEDDED_TRACKS_MAX = 256;
const EMBEDDED_TRACK_IDLE_MS = 60_000;
const UNTRACKED_IDLE_MS = 5_000;
const UNTRACKED_GRID = 8;
const CLIP_EVERY_MS = 10_000;
const CLIP_AREA_FACTOR = 1.5;
const CLIP_TIMEOUT_MS = 5_000;
const FACE_TIMEOUT_MS = 5_000;
const CLIP_FULL_FRAME_KEY = 'full';

interface ClipTrack {
  at: number;
  area: number;
}

interface ClipJob {
  region: CroppedRegion;
  capturedAt: number;
}

interface FaceJob {
  face: TrackedFaceDetection;
  region: CroppedRegion;
  capturedAt: number;
  card?: { jpeg: Buffer; window: CropWindow; frameWidth: number; frameHeight: number };
}

interface EmbeddedTrack {
  attemptAt: number;
  seen: number;
  good: number;
  identity?: string;
}

export class SecondaryStage {
  private readonly embeddedTracks = new Map<string, EmbeddedTrack>();
  private readonly clipTracks = new Map<string, ClipTrack>();
  private readonly clipQueue = new SideQueue<ClipJob>(
    (jobs) => this.runClip(jobs),
    CLIP_TIMEOUT_MS,
    (error) => {
      if (this.coordinator.running && !isNoRespondersError(error)) this.logger.error('CLIP detection error:', error);
    },
    (jobs) => {
      for (const _job of jobs) this.coordinator.vectorJobSettled();
    },
  );

  private readonly faceQueue = new SideQueue<FaceJob>(
    (jobs) => this.runFaces(jobs),
    FACE_TIMEOUT_MS,
    (error) => {
      if (this.coordinator.running && !isNoRespondersError(error)) this.logger.error('Face recognition error:', error);
    },
    (jobs) => {
      for (const _job of jobs) this.coordinator.vectorJobSettled();
    },
  );

  private nvrProxy?: Promisify<NvrFaceMatcher>;
  private nvrProxyPromise?: Promise<Promisify<NvrFaceMatcher> | undefined>;

  constructor(
    private readonly coordinator: DetectionCoordinator,
    private readonly plugins: PluginRegistry,
    private readonly pipeline: DetectionPipeline,
    private readonly frameScaler: FrameScaler,
    private readonly proxy: RPCClient,
    private readonly perf: PerfTracker,
    private readonly logger: Logger,
  ) {}

  public async detect(sourceFrame: Frame, scaler: FrameScaler, objectDetections: Detection[], results: DetectionResults): Promise<void> {
    await this.queueClip(sourceFrame, scaler, objectDetections);
    const regionMap = await this.prepareSecondaryRegions(sourceFrame, scaler, objectDetections);
    await this.runAllSecondaries(regionMap, results);
    await this.recognizeFaces(sourceFrame, scaler, results);
  }

  public async detectFullFrame(rawFrame: Frame, results: DetectionResults): Promise<Buffer | null> {
    await this.queueFullFrameClip(rawFrame);
    const regionMap = await this.prepareFullFrameRegions(rawFrame);

    if (regionMap.size > 0) {
      await this.runAllSecondaries(regionMap, results);
      await this.recognizeFaces(rawFrame, this.frameScaler, results);
    }

    try {
      return await this.frameScaler.frameToJPEG(rawFrame, EVENT_THUMB_MAX_WIDTH);
    } catch (error) {
      this.logger.debug('Full-frame scene thumbnail failed:', error);
      return null;
    }
  }

  public async generateThumbnails(sourceFrame: Frame, scaler: FrameScaler, results: DetectionResults): Promise<DetectionThumbnail[]> {
    const thumbnails: DetectionThumbnail[] = [];
    const settings = this.coordinator.detectionSettings;

    if (results.face?.detections) {
      const faceMinConfidence = settings.face?.confidence ?? 0;
      const faces = results.face.detections.filter((d) => d.confidence >= faceMinConfidence);
      for (const [detection, jpeg] of await this.attributeCrops(sourceFrame, scaler, faces)) {
        detection.thumbnail ??= jpeg;
        thumbnails.push(this.attributeThumbnail(`face:${detection.identity ?? 'unknown'}`, detection, jpeg));
      }
    }

    if (results.licensePlate?.detections) {
      const plateMinConfidence = settings.licensePlate?.ocrConfidence ?? 0;
      const plateMinLength = settings.licensePlate?.minLength ?? MIN_PLATE_LENGTH;
      const plates = results.licensePlate.detections.filter((d) => {
        if (!d.plateText || normalizePlateText(d.plateText).length < plateMinLength) return false;
        return d.ocrConfidence === undefined || d.ocrConfidence >= plateMinConfidence;
      });
      for (const [detection, jpeg] of await this.attributeCrops(sourceFrame, scaler, plates)) {
        thumbnails.push(this.attributeThumbnail(`plate:${normalizePlateText(detection.plateText)}`, detection, jpeg));
      }
    }

    if (results.classifiers) {
      for (const classifierResult of Object.values(results.classifiers)) {
        const classifications = classifierResult.detections.filter((d) => d.subAttribute);
        for (const [detection, jpeg] of await this.attributeCrops(sourceFrame, scaler, classifications)) {
          // keyed by subAttribute, the attribute label injectSegmentThumbnails looks up
          thumbnails.push(this.attributeThumbnail(`class:${detection.subAttribute}`, detection, jpeg));
        }
      }
    }

    return thumbnails;
  }

  private async attributeCrops<T extends { box: BoundingBox; parentBox?: BoundingBox }>(
    sourceFrame: Frame,
    scaler: FrameScaler,
    detections: T[],
  ): Promise<[T, Buffer, CropWindow][]> {
    const format = momentFormat('card');
    const crops: [T, Buffer, CropWindow][] = [];

    for (const detection of detections) {
      const hint = detection.parentBox ? directionBetween(detection.box, detection.parentBox) : undefined;
      const window = momentWindow({ subject: detection.box, hint }, sourceFrame.width, sourceFrame.height, format);
      if (!window) continue;
      try {
        const jpeg = await scaler.cropWindowToJPEG(sourceFrame, window, format.width, format.height, MOMENT_QUALITY);
        if (jpeg) crops.push([detection, jpeg, window]);
      } catch (error) {
        this.logger.debug('Attribute crop failed:', error);
      }
    }

    return crops;
  }

  private attributeThumbnail(label: string, detection: { box: BoundingBox; confidence: number }, jpeg: Buffer): DetectionThumbnail {
    const thumbnail: DetectionThumbnail = {
      label,
      score: detection.confidence,
      jpeg,
      area: detection.box.width * detection.box.height,
      onEdge: this.isOnEdge(detection.box),
    };
    // every candidate, not just the winner: a crop that loses the ranking is
    // the only way to see why the shipped one is worse than what was available
    // debugging
    detectionRecord.attributeCandidate(label, { score: thumbnail.score, area: thumbnail.area, onEdge: thumbnail.onEdge, box: detection.box }, jpeg);
    return thumbnail;
  }

  private async runAllSecondaries(regionMap: Map<string, CroppedRegion[]>, results: DetectionResults): Promise<void> {
    await Promise.allSettled([
      this.runSecondaryDetection(SensorType.Face, results, () => this.runFaceDetection(regionMap.get('face') ?? [])),
      this.runSecondaryDetection(SensorType.LicensePlate, results, () => this.runLicensePlateDetection(regionMap.get('lpd') ?? [])),
      this.runSecondaryDetection(SensorType.Classifier, results, () => this.runClassifierDetections(regionMap)),
    ]);

    if (results.face?.detections.length) {
      const embedPlugin = this.plugins.get(SensorType.FaceEmbedder);
      results.faceEmbeddingModel = (embedPlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    }
  }

  private async recognizeFaces(sourceFrame: Frame, scaler: FrameScaler, results: DetectionResults): Promise<void> {
    if (!results.face?.detections.length) return;
    await this.queueFaces(sourceFrame, scaler, results.face.detections);
    this.carryTrackIdentities(results.face.detections);
  }

  private async queueFaces(sourceFrame: Frame, scaler: FrameScaler, faces: ServerFaceDetection[]): Promise<void> {
    const plugin = this.plugins.get(SensorType.FaceEmbedder);
    const spec = plugin?.modelSpec as ModelSpec | undefined;
    const input = spec && isVideoInputSpec(spec.input) ? spec.input : undefined;
    if (!input) return;

    for (const face of faces) {
      if (!this.wantsEmbedding(face, sourceFrame)) continue;

      const scaled = await scaler.cropAndScaleMulti(
        sourceFrame,
        face,
        // a stretched face drifts away from its enrolled picture: same crop, cosine p10 0.35 stretched, 0.60 square
        [{ key: 'faceEmbed', width: input.width, height: input.height, format: input.format, fit: 'expand' }],
        FACE_CROP_PADDING,
      );
      const region = scaled.get('faceEmbed');
      if (!region) continue;

      const [crop] = await this.attributeCrops(sourceFrame, scaler, [face]);
      const card = crop ? { jpeg: crop[1], window: crop[2], frameWidth: sourceFrame.width, frameHeight: sourceFrame.height } : undefined;

      this.markAttempt(face);
      const job: FaceJob = { face: { ...(face as TrackedFaceDetection) }, region, capturedAt: Date.now(), card };
      if (!this.faceQueue.push(this.embedKey(face), job)) this.coordinator.vectorJobStarted();
    }
  }

  private async runFaces(jobs: FaceJob[]): Promise<void> {
    const plugin = this.plugins.get(SensorType.FaceEmbedder);
    if (!plugin || !this.coordinator.running) return;

    const started = Date.now();
    const embedded = await plugin.proxy.embedFaces(jobs.map((job, index) => ({ ...job.region.frame, id: String(index) })));
    this.perf.faceEmbedMs += Date.now() - started;
    this.perf.faceEmbedCount += jobs.length;

    const faces: TrackedFaceDetection[] = [];
    for (let i = 0; i < jobs.length; i++) {
      const { face, region, card } = jobs[i];
      const { embedding, landmarks, quality } = embedded[i] ?? {};
      if (!embedding?.length) continue;

      face.embedding = embedding;
      face.quality = quality;
      face.landmarks = landmarks?.map((point) => this.cropPointToFrame(point, region));
      if (card) {
        face.thumbnail = card.jpeg;
        face.thumbnailLandmarks = face.landmarks?.map((point): Point => [
          (point[0] * card.frameWidth - card.window.x) / card.window.width,
          (point[1] * card.frameHeight - card.window.y) / card.window.height,
        ]);
      }
      faces.push(face);
    }

    await this.resolveFaceIdentities(faces);
    for (const face of faces) this.markGoodVector(face);
    if (faces.length === 0 || !this.coordinator.running) return;

    const embeddingModel = (plugin.modelSpec as ModelSpec | undefined)?.embeddingModel ?? '';
    for (const job of jobs) {
      if (job.face.embedding?.length) this.coordinator.acceptFaceVectors([job.face], embeddingModel, job.capturedAt);
    }
  }

  private wantsEmbedding(face: ServerFaceDetection, frame: Frame): boolean {
    const shortest = Math.min(face.box.width * frame.width, face.box.height * frame.height);
    if (shortest < MIN_FACE_PX) return false;

    const now = Date.now();
    const key = this.embedKey(face);
    const seen = this.embeddedTracks.get(key);
    // without a track a cell is all there is, and the next face in it may be someone else
    if (!seen || (key.startsWith('u') && now - seen.seen > UNTRACKED_IDLE_MS)) {
      this.embeddedTracks.delete(key);
      return true;
    }
    seen.seen = now;
    if (seen.identity || seen.good >= GOOD_VECTORS_PER_TRACK) return false;
    return now - seen.attemptAt >= EMBED_EVERY_MS;
  }

  private markAttempt(face: ServerFaceDetection): void {
    const now = Date.now();
    const key = this.embedKey(face);
    const seen = this.embeddedTracks.get(key);
    this.embeddedTracks.set(key, { good: 0, ...seen, attemptAt: now, seen: now });

    if (this.embeddedTracks.size <= EMBEDDED_TRACKS_MAX) return;
    for (const [id, track] of this.embeddedTracks) {
      if (now - track.seen > EMBEDDED_TRACK_IDLE_MS) this.embeddedTracks.delete(id);
    }
  }

  private markGoodVector(face: ServerFaceDetection): void {
    const seen = this.embeddedTracks.get(this.embedKey(face));
    if (!seen) return;
    seen.good++;
    if (face.identity && (face as TrackedFaceDetection).parentTrackId !== undefined) seen.identity = face.identity;
  }

  private cropPointToFrame(point: Point, region: CroppedRegion): Point {
    return [
      (region.offset.x + point[0] * region.cropSize.width) / region.originalSize.width,
      (region.offset.y + point[1] * region.cropSize.height) / region.originalSize.height,
    ];
  }

  private carryTrackIdentities(faces: ServerFaceDetection[]): void {
    const now = Date.now();
    for (const face of faces) {
      if ((face as TrackedFaceDetection).parentTrackId === undefined) continue;
      const seen = this.embeddedTracks.get(this.embedKey(face));
      if (!seen) continue;
      seen.seen = now;
      if (face.identity) seen.identity = face.identity;
      else face.identity = seen.identity;
    }
  }

  private embedKey(face: ServerFaceDetection): string {
    const trackId = (face as TrackedFaceDetection).parentTrackId;
    if (trackId !== undefined) return `t${trackId}`;
    const cellX = Math.floor((face.box.x + face.box.width / 2) * UNTRACKED_GRID);
    const cellY = Math.floor((face.box.y + face.box.height / 2) * UNTRACKED_GRID);
    return `u${cellX}:${cellY}`;
  }

  private collectConsumers(requireFrames: boolean): ConsumerSpec[] {
    const consumers: ConsumerSpec[] = [];

    for (const { type, key, fit } of SECONDARY_CONSUMERS) {
      const plugin = this.plugins.get(type);
      if (!plugin || (requireFrames && !plugin.requiresFrames)) continue;
      if (hasSecondaryModelSpec(plugin.modelSpec) && isVideoInputSpec(plugin.modelSpec.input)) {
        consumers.push({ key, triggerLabels: plugin.modelSpec.triggerLabels, input: plugin.modelSpec.input, fit });
      }
    }

    for (const plugin of this.plugins.getAll(SensorType.Classifier)) {
      if (requireFrames && !plugin.requiresFrames) continue;
      if (hasSecondaryModelSpec(plugin.modelSpec) && isVideoInputSpec(plugin.modelSpec.input)) {
        consumers.push({ key: `classifier:${plugin.pluginId}`, triggerLabels: plugin.modelSpec.triggerLabels, input: plugin.modelSpec.input, fit: 'expand' });
      }
    }

    return consumers;
  }

  private async prepareSecondaryRegions(rawFrame: Frame, scaler: FrameScaler, objectDetections: Detection[]): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();
    const consumers = this.collectConsumers(false);
    if (consumers.length === 0) return result;

    for (const detection of objectDetections) {
      const detLabel = detection.label.toLowerCase();
      const targets: ScaleTarget[] = [];

      for (const consumer of consumers) {
        if (consumer.triggerLabels.length === 0 || consumer.triggerLabels.some((l) => l.toLowerCase() === detLabel)) {
          targets.push({ key: consumer.key, width: consumer.input.width, height: consumer.input.height, format: consumer.input.format, fit: consumer.fit });
        }
      }

      if (targets.length === 0) continue;

      // consumers with identical dimensions and fit share one scaled region
      const uniqueTargets: ScaleTarget[] = [];
      const dupeMap = new Map<string, string[]>(); // sizeKey → [consumerKey, ...]
      for (const t of targets) {
        const sizeKey = `${t.width}x${t.height}_${t.format}_${t.fit ?? 'stretch'}`;
        const existing = dupeMap.get(sizeKey);
        if (existing) {
          existing.push(t.key);
        } else {
          dupeMap.set(sizeKey, [t.key]);
          uniqueTargets.push(t);
        }
      }

      const regions = await scaler.cropAndScaleMulti(rawFrame, detection, uniqueTargets);

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

  private async prepareFullFrameRegions(rawFrame: Frame): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();
    const consumers = this.collectConsumers(true);
    if (consumers.length === 0) return result;

    for (const consumer of consumers) {
      const region = await this.fullFrameRegion(rawFrame, consumer.input, consumer.key);
      if (region) result.set(consumer.key, [region]);
    }

    return result;
  }

  private async fullFrameRegion(
    rawFrame: Frame,
    input: { width: number; height: number; format: ScaleTarget['format'] },
    key: string,
  ): Promise<CroppedRegion | undefined> {
    const letterboxed = await this.frameScaler.letterboxToSpec(rawFrame, input);
    if (!letterboxed) return undefined;
    const g = letterboxed.geometry;
    return {
      frame: this.frameScaler.toVideoFrameData(letterboxed.padded, `fullframe:${key}`),
      detection: { label: 'person', confidence: 1.0, box: { ...FULL_FRAME_BOX } },
      // a virtual crop covering frame plus fill bars, so the linear box
      // mapping in transformBoxToOriginal un-letterboxes for free
      offset: { x: (-g.padX / g.innerWidth) * rawFrame.width, y: (-g.padY / g.innerHeight) * rawFrame.height },
      cropSize: { width: (g.targetWidth / g.innerWidth) * rawFrame.width, height: (g.targetHeight / g.innerHeight) * rawFrame.height },
      originalSize: { width: rawFrame.width, height: rawFrame.height },
    };
  }

  private async runSecondaryDetection(
    type: SensorType.Face | SensorType.LicensePlate | SensorType.Classifier,
    results: DetectionResults,
    fn: () => Promise<FaceResult | LicensePlateResult | { pluginId: string; result: ClassifierResult }[] | undefined>,
  ): Promise<void> {
    let detections: Awaited<ReturnType<typeof fn>>;
    const startedAt = Date.now();

    try {
      detections = await fn();
      if (detections) this.trackTiming(type, Date.now() - startedAt);
    } catch (error) {
      if (!this.coordinator.running || isNoRespondersError(error)) return;
      const logType = type === SensorType.Face ? 'Face' : type === SensorType.LicensePlate ? 'License plate' : 'Classifier';
      this.logger.error(`${logType} detection error:`, error);
    }

    if (!detections) return;

    if (type === SensorType.Face) {
      results.face = detections as FaceResult;
    } else if (type === SensorType.LicensePlate) {
      results.licensePlate = detections as LicensePlateResult;
    } else if (type === SensorType.Classifier) {
      results.classifiers ??= {};
      for (const { pluginId, result } of detections as { pluginId: string; result: ClassifierResult }[]) {
        results.classifiers[pluginId] = result;
      }
      if (Object.keys(results.classifiers).length === 0) delete results.classifiers;
    }
  }

  private trackTiming(type: SensorType.Face | SensorType.LicensePlate | SensorType.Classifier, ms: number): void {
    if (type === SensorType.Face) {
      this.perf.faceMs += ms;
      this.perf.faceCount++;
    } else if (type === SensorType.LicensePlate) {
      this.perf.plateMs += ms;
      this.perf.plateCount++;
    } else {
      this.perf.classifierMs += ms;
      this.perf.classifierCount++;
    }
  }

  private async runFaceDetection(croppedRegions: CroppedRegion[]): Promise<FaceResult | undefined> {
    const facePlugin = this.plugins.get(SensorType.Face);
    if (!facePlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await PromiseTimeout(
      facePlugin.proxy.detectFaces(this.prepareSecondaryFrames(croppedRegions)),
      DETECT_TIMEOUT_MS,
      undefined,
      `Face detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
    const allFaces: TrackedFaceDetection[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      for (const face of ensureDetectionBoxes(batchResults[i].detections)) {
        const transformed = this.transformBoxToOriginal(face.box, croppedRegions[i]);
        const parent = this.faceParent(transformed, croppedRegions, i);
        const parentTrackId = parent && 'trackId' in parent ? (parent as TrackedDetection).trackId : undefined;
        allFaces.push({ ...face, box: transformed, parentTrackId, parentBox: parent?.box });
      }
    }

    if (allFaces.length === 0) return { detected: false, detections: [] };
    // NMS only, the crops come from already zone-filtered object detections
    const deduped = this.pipeline.runNms(allFaces);
    return { detected: deduped.length > 0, detections: deduped };
  }

  private async runLicensePlateDetection(croppedRegions: CroppedRegion[]): Promise<LicensePlateResult | undefined> {
    const lpdPlugin = this.plugins.get(SensorType.LicensePlate);
    if (!lpdPlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await PromiseTimeout(
      lpdPlugin.proxy.detectLicensePlates(this.prepareSecondaryFrames(croppedRegions)),
      DETECT_TIMEOUT_MS,
      undefined,
      `License plate detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
    const allPlates: TrackedLicensePlateDetection[] = [];

    for (let i = 0; i < batchResults.length; i++) {
      const parent = croppedRegions[i].detection;
      const parentTrackId = 'trackId' in parent ? (parent as TrackedDetection).trackId : undefined;
      for (const plate of ensureDetectionBoxes(batchResults[i].detections)) {
        allPlates.push({ ...plate, box: this.transformBoxToOriginal(plate.box, croppedRegions[i]), parentTrackId, parentBox: parent.box });
      }
    }

    if (allPlates.length === 0) return { detected: false, detections: [] };
    // NMS only, the crops come from already zone-filtered object detections
    const deduped = this.pipeline.runNms(allPlates);
    return { detected: deduped.length > 0, detections: deduped };
  }

  private async runClassifierDetections(regionMap: Map<string, CroppedRegion[]>): Promise<{ pluginId: string; result: ClassifierResult }[]> {
    const classifierPlugins = this.plugins.getAll(SensorType.Classifier);
    if (classifierPlugins.length === 0) return [];

    const promises: Promise<{ pluginId: string; result: ClassifierResult } | undefined>[] = [];

    for (const classifierPlugin of classifierPlugins) {
      const croppedRegions = regionMap.get(`classifier:${classifierPlugin.pluginId}`);
      if (!croppedRegions || croppedRegions.length === 0) continue;

      const runClassifier = async (): Promise<{ pluginId: string; result: ClassifierResult } | undefined> => {
        const batchResults = await PromiseTimeout(
          classifierPlugin.proxy.detectClassifications(this.prepareSecondaryFrames(croppedRegions)),
          DETECT_TIMEOUT_MS,
          undefined,
          `Classifier detection timed out after ${DETECT_TIMEOUT_MS}ms`,
        );
        const allDetections: TrackedClassifierDetection[] = [];

        for (let i = 0; i < batchResults.length; i++) {
          const parent = croppedRegions[i].detection;
          const parentTrackId = 'trackId' in parent ? (parent as TrackedDetection).trackId : undefined;
          for (const detection of ensureDetectionBoxes(batchResults[i].detections)) {
            allDetections.push({ ...detection, box: this.transformBoxToOriginal(detection.box, croppedRegions[i]), parentTrackId, parentBox: parent.box });
          }
        }

        if (allDetections.length === 0) return undefined;
        const deduped = this.pipeline.runNms(allDetections);
        if (deduped.length === 0) return undefined;
        return { pluginId: classifierPlugin.pluginId, result: { detected: true, detections: deduped } };
      };

      promises.push(runClassifier());
    }

    const settled = await Promise.all(promises);
    return settled.filter((r): r is { pluginId: string; result: ClassifierResult } => r !== undefined);
  }

  private async queueClip(sourceFrame: Frame, scaler: FrameScaler, objectDetections: Detection[]): Promise<void> {
    const target = this.clipTarget(false);
    if (!target) return;

    for (const detection of objectDetections) {
      const label = detection.label.toLowerCase();
      if (target.triggerLabels.length > 0 && !target.triggerLabels.some((l) => l.toLowerCase() === label)) continue;

      const trackId = 'trackId' in detection ? (detection as TrackedDetection).trackId : undefined;
      const key = trackId !== undefined ? `t${trackId}` : `l${label}`;
      if (!this.clipDue(key, detection.box.width * detection.box.height)) continue;

      const regions = await scaler.cropAndScaleMulti(sourceFrame, detection, [target.scale]);
      const region = regions.get('clip');
      if (region) this.pushClipJob(key, region);
    }
  }

  private pushClipJob(key: string, region: CroppedRegion): void {
    if (!this.clipQueue.push(key, { region, capturedAt: Date.now() })) this.coordinator.vectorJobStarted();
  }

  private async queueFullFrameClip(rawFrame: Frame): Promise<void> {
    const target = this.clipTarget(true);
    if (!target || !this.clipDue(CLIP_FULL_FRAME_KEY, 1)) return;

    const region = await this.fullFrameRegion(rawFrame, target.scale, 'clip');
    if (region) this.pushClipJob(CLIP_FULL_FRAME_KEY, region);
  }

  private clipTarget(requireFrames: boolean): { triggerLabels: string[]; scale: ScaleTarget } | undefined {
    const plugin = this.plugins.get(SensorType.Clip);
    if (!plugin || (requireFrames && !plugin.requiresFrames)) return undefined;
    if (!hasSecondaryModelSpec(plugin.modelSpec) || !isVideoInputSpec(plugin.modelSpec.input)) return undefined;
    const { input, triggerLabels } = plugin.modelSpec;
    return { triggerLabels, scale: { key: 'clip', width: input.width, height: input.height, format: input.format, fit: 'expand' } };
  }

  private clipDue(key: string, area: number): boolean {
    const now = Date.now();
    const seen = this.clipTracks.get(key);
    if (seen && area < seen.area * CLIP_AREA_FACTOR && now - seen.at < CLIP_EVERY_MS) return false;
    this.clipTracks.set(key, { at: now, area: Math.max(area, seen?.area ?? 0) });

    if (this.clipTracks.size > EMBEDDED_TRACKS_MAX) {
      for (const [id, track] of this.clipTracks) {
        if (now - track.at > EMBEDDED_TRACK_IDLE_MS) this.clipTracks.delete(id);
      }
    }
    return true;
  }

  private async runClip(jobs: ClipJob[]): Promise<void> {
    const clipPlugin = this.plugins.get(SensorType.Clip);
    if (!clipPlugin || !this.coordinator.running) return;

    const started = Date.now();
    const batchResults = await clipPlugin.proxy.detectEmbeddings(this.prepareSecondaryFrames(jobs.map((job) => job.region)));
    this.perf.clipMs += Date.now() - started;
    this.perf.clipCount++;
    if (!this.coordinator.running) return;

    const embeddingModel = (clipPlugin.modelSpec as ModelSpec | undefined)?.embeddingModel ?? '';
    for (let i = 0; i < batchResults.length && i < jobs.length; i++) {
      const { region, capturedAt } = jobs[i];
      const parentTrackId = 'trackId' in region.detection ? (region.detection as TrackedDetection).trackId : undefined;
      const embeddings = ensureDetectionBoxes(batchResults[i].embeddings ?? []).map((emb): TrackedClipEmbedding => ({
        ...emb,
        box: this.transformBoxToOriginal(emb.box, region),
        parentTrackId,
      }));
      this.coordinator.acceptClipVectors(embeddings, embeddingModel, capturedAt);
    }
  }

  private faceParent(face: BoundingBox, regions: CroppedRegion[], cropIndex: number): Detection | undefined {
    const cx = face.x + face.width / 2;
    const cy = face.y + face.height / 2;
    let best: Detection | undefined;
    for (const { detection } of regions) {
      const box = detection.box;
      if (cx < box.x || cx > box.x + box.width || cy < box.y || cy > box.y + box.height) continue;
      if (!best || box.width * box.height < best.box.width * best.box.height) best = detection;
    }
    if (best) return best;
    const own = regions[cropIndex].detection;
    const inside = cx >= own.box.x && cx <= own.box.x + own.box.width && cy <= own.box.y + own.box.height;
    return inside ? own : undefined;
  }

  private prepareSecondaryFrames(croppedRegions: CroppedRegion[]): VideoFrameData[] {
    return croppedRegions.map((r, i) => ({ ...r.frame, id: String(i), label: r.detection.label }));
  }

  private async resolveFaceIdentities(faces: ServerFaceDetection[]): Promise<void> {
    const withEmbeddings = faces.filter((f) => f.embedding?.length);
    if (!withEmbeddings.length) return;

    const embedPlugin = this.plugins.get(SensorType.FaceEmbedder);
    const embeddingModel = (embedPlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    if (!embeddingModel) return;

    const nvr = await this.getNvrProxy();
    if (!nvr) return;

    try {
      const embeddings = withEmbeddings.map((f) => f.embedding!);
      const matches = await nvr.matchFaces(embeddings, embeddingModel, this.coordinator.detectionSettings.face?.matchSensitivity ?? 'balanced');
      for (let i = 0; i < withEmbeddings.length; i++) {
        if (matches[i]) {
          withEmbeddings[i].identity = matches[i]!.identity;
        }
      }
    } catch (error) {
      if (!this.coordinator.running || isNoRespondersError(error)) return;
      this.logger.error('Could not resolve face identities:', error);
    }
  }

  private transformBoxToOriginal(
    box: { x: number; y: number; width: number; height: number },
    region: CroppedRegion,
  ): { x: number; y: number; width: number; height: number } {
    // boxes are normalized to the scaled crop, map back through the original
    // crop dimensions before scaling
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

  private isOnEdge(box: { x: number; y: number; width: number; height: number }): boolean {
    return box.x < 0.02 || box.y < 0.02 || box.x + box.width > 0.98 || box.y + box.height > 0.98;
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
