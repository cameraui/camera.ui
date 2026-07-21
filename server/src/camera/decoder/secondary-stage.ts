import { PromiseTimeout } from '@camera.ui/common/utils';
import { isNoRespondersError } from '@camera.ui/rpc';
import { SensorType } from '@camera.ui/sdk';

import { NamespaceManager } from '../../rpc/namespaces.js';
import { EVENT_THUMB_MAX_WIDTH } from './event-thumbnailer.js';
import { MIN_PLATE_LENGTH, normalizePlateText } from './plate-vote.js';
import { hasSecondaryModelSpec, isVideoInputSpec } from './plugin-registry.js';
import { DETECT_TIMEOUT_MS } from './types.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Promisify, RPCClient } from '@camera.ui/rpc';
import type { ClassifierResult, ClipResult, Detection, FaceDetection, FaceResult, LicensePlateResult, ModelSpec, TrackedDetection, VideoFrameData } from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';
import type { CoreManagerInterface } from '../../rpc/interfaces/core.js';
import type { CroppedRegion, DetectionResults, DetectionThumbnail } from '../../rpc/interfaces/detection.js';
import type { TrackedClassifierDetection, TrackedClipEmbedding, TrackedFaceDetection, TrackedLicensePlateDetection } from './event-manager.js';
import type { DetectionCoordinator } from './detection-coordinator.js';
import type { DetectionPipeline } from './detection-pipeline.js';
import type { ConsumerSpec, ScaleTarget } from './frame-scaler.js';
import type { FrameScaler } from './frame-scaler.js';
import type { PluginRegistry } from './plugin-registry.js';

const DETECTION_THUMB_MAX_WIDTH = 640;
const DETECTION_THUMB_MIN_CROP = 160;
const DETECTION_THUMB_HQ_MAX_WIDTH = 640;
const DETECTION_THUMB_HQ_MIN_CROP = 640;
const DETECTION_THUMB_HQ_QUALITY = 80;
const ATTRIBUTE_THUMB_MAX_WIDTH = 640;
const ATTRIBUTE_THUMB_MIN_CROP = 128;

const SECONDARY_CONSUMERS: { type: SensorType; key: string }[] = [
  { type: SensorType.Face, key: 'face' },
  { type: SensorType.LicensePlate, key: 'lpd' },
  { type: SensorType.Clip, key: 'clip' },
];

interface NvrFaceMatcher {
  matchFaces(embeddings: number[][], embeddingModel: string): Promise<({ identity: string } | null)[]>;
}

export class SecondaryStage {
  private nvrProxy?: Promisify<NvrFaceMatcher>;
  private nvrProxyPromise?: Promise<Promisify<NvrFaceMatcher> | undefined>;

  constructor(
    private readonly coordinator: DetectionCoordinator,
    private readonly plugins: PluginRegistry,
    private readonly pipeline: DetectionPipeline,
    private readonly frameScaler: FrameScaler,
    private readonly proxy: RPCClient,
    private readonly logger: Logger,
  ) {}

  public async detect(rawFrame: Frame, objectDetections: Detection[], results: DetectionResults): Promise<void> {
    const regionMap = await this.prepareSecondaryRegions(rawFrame, objectDetections);
    await this.runAllSecondaries(regionMap, results);
  }

  // no loop frame available: secondaries see the whole frame instead of
  // per-detection crops, returns the scene JPEG for the event thumbnail
  public async detectFullFrame(rawFrame: Frame, results: DetectionResults): Promise<Buffer | null> {
    const regionMap = await this.prepareFullFrameRegions(rawFrame);

    if (regionMap.size > 0) {
      await this.runAllSecondaries(regionMap, results);
    }

    try {
      return await this.frameScaler.frameToJPEG(rawFrame, EVENT_THUMB_MAX_WIDTH);
    } catch (error) {
      this.logger.debug('Full-frame scene thumbnail failed:', error);
      return null;
    }
  }

  public async generateThumbnails(
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

    const settings = this.coordinator.detectionSettings;

    if (results.face?.detections) {
      const faceMinConfidence = settings.face?.confidence ?? 0;
      const faces = results.face.detections.filter((d) => d.confidence >= faceMinConfidence);
      const faceCrops = await scaler.cropToJPEG(sourceFrame, faces, {
        maxWidth: ATTRIBUTE_THUMB_MAX_WIDTH,
        padding: attributePadding,
        minCrop: ATTRIBUTE_THUMB_MIN_CROP,
      });
      for (const crop of faceCrops) {
        const detection = faces[crop.index];
        if (detection) {
          // enrichSegment persists unknown faces to the face store from this
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
      const plateMinConfidence = settings.licensePlate?.confidence ?? 0;
      const plateMinLength = settings.licensePlate?.minLength ?? MIN_PLATE_LENGTH;
      const plates = results.licensePlate.detections.filter((d) => {
        if (!d.plateText || normalizePlateText(d.plateText).length < plateMinLength) return false;
        return d.ocrConfidence === undefined || d.ocrConfidence >= plateMinConfidence;
      });
      const plateCrops = await scaler.cropToJPEG(sourceFrame, plates, {
        maxWidth: ATTRIBUTE_THUMB_MAX_WIDTH,
        padding: attributePadding,
        minCrop: ATTRIBUTE_THUMB_MIN_CROP,
      });
      for (const crop of plateCrops) {
        const detection = plates[crop.index];
        if (detection) {
          thumbnails.push({
            label: `plate:${normalizePlateText(detection.plateText)}`,
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
        const classifications = classifierResult.detections.filter((d) => d.subAttribute);
        const clsCrops = await scaler.cropToJPEG(sourceFrame, classifications, {
          maxWidth: detectionMaxWidth,
          padding: 0.3,
          minCrop: detectionMinCrop,
          quality: detectionQuality,
        });
        for (const crop of clsCrops) {
          const detection = classifications[crop.index];
          if (detection) {
            // keyed by subAttribute, the attribute label injectSegmentThumbnails looks up
            thumbnails.push({
              label: `class:${detection.subAttribute}`,
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

  private async runAllSecondaries(regionMap: Map<string, CroppedRegion[]>, results: DetectionResults): Promise<void> {
    await Promise.allSettled([
      this.runSecondaryDetection(SensorType.Face, results, () => this.runFaceDetection(regionMap.get('face') ?? [])),
      this.runSecondaryDetection(SensorType.LicensePlate, results, () => this.runLicensePlateDetection(regionMap.get('lpd') ?? [])),
      this.runSecondaryDetection(SensorType.Classifier, results, () => this.runClassifierDetections(regionMap)),
      this.runSecondaryDetection(SensorType.Clip, results, () => this.runClipDetection(regionMap.get('clip') ?? [])),
    ]);

    if (results.face?.detections.length) {
      const facePlugin = this.plugins.get(SensorType.Face);
      results.faceEmbeddingModel = (facePlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    }
  }

  private collectConsumers(requireFrames: boolean): ConsumerSpec[] {
    const consumers: ConsumerSpec[] = [];

    for (const { type, key } of SECONDARY_CONSUMERS) {
      const plugin = this.plugins.get(type);
      if (!plugin || (requireFrames && !plugin.requiresFrames)) continue;
      if (hasSecondaryModelSpec(plugin.modelSpec) && isVideoInputSpec(plugin.modelSpec.input)) {
        consumers.push({ key, triggerLabels: plugin.modelSpec.triggerLabels, input: plugin.modelSpec.input });
      }
    }

    for (const plugin of this.plugins.getAll(SensorType.Classifier)) {
      if (requireFrames && !plugin.requiresFrames) continue;
      if (hasSecondaryModelSpec(plugin.modelSpec) && isVideoInputSpec(plugin.modelSpec.input)) {
        consumers.push({ key: `classifier:${plugin.pluginId}`, triggerLabels: plugin.modelSpec.triggerLabels, input: plugin.modelSpec.input });
      }
    }

    return consumers;
  }

  private async prepareSecondaryRegions(rawFrame: Frame, objectDetections: Detection[]): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();
    const consumers = this.collectConsumers(false);
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

      // consumers with identical dimensions share one scaled region
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

  private async prepareFullFrameRegions(rawFrame: Frame): Promise<Map<string, CroppedRegion[]>> {
    const result = new Map<string, CroppedRegion[]>();
    const consumers = this.collectConsumers(true);
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

  private async runSecondaryDetection(
    type: SensorType.Face | SensorType.LicensePlate | SensorType.Classifier | SensorType.Clip,
    results: DetectionResults,
    fn: () => Promise<FaceResult | LicensePlateResult | ClipResult | { pluginId: string; result: ClassifierResult }[] | undefined>,
  ): Promise<void> {
    let detections: Awaited<ReturnType<typeof fn>>;

    try {
      detections = await fn();
    } catch (error) {
      if (!this.coordinator.running || isNoRespondersError(error)) return;
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
      const clipPlugin = this.plugins.get(SensorType.Clip);
      results.clipEmbeddingModel = (clipPlugin?.modelSpec as ModelSpec | undefined)?.embeddingModel;
    } else if (type === SensorType.Classifier) {
      results.classifiers ??= {};
      for (const { pluginId, result } of detections as { pluginId: string; result: ClassifierResult }[]) {
        results.classifiers[pluginId] = result;
      }
      if (Object.keys(results.classifiers).length === 0) delete results.classifiers;
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
      const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;

      for (const face of batchResults[i].detections) {
        const transformed = this.transformBoxToOriginal(face.box, croppedRegions[i]);
        allFaces.push({ ...face, box: transformed, parentTrackId });
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
      const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;
      for (const plate of batchResults[i].detections) {
        allPlates.push({ ...plate, box: this.transformBoxToOriginal(plate.box, croppedRegions[i]), parentTrackId });
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
          const parentTrackId = 'trackId' in croppedRegions[i].detection ? (croppedRegions[i].detection as TrackedDetection).trackId : undefined;
          for (const detection of batchResults[i].detections) {
            allDetections.push({ ...detection, box: this.transformBoxToOriginal(detection.box, croppedRegions[i]), parentTrackId });
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

  private async runClipDetection(croppedRegions: CroppedRegion[]): Promise<ClipResult | undefined> {
    const clipPlugin = this.plugins.get(SensorType.Clip);
    if (!clipPlugin || croppedRegions.length === 0) return undefined;

    const batchResults = await PromiseTimeout(
      clipPlugin.proxy.detectEmbeddings(this.prepareSecondaryFrames(croppedRegions)),
      DETECT_TIMEOUT_MS,
      undefined,
      `CLIP detection timed out after ${DETECT_TIMEOUT_MS}ms`,
    );
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

  private prepareSecondaryFrames(croppedRegions: CroppedRegion[]): VideoFrameData[] {
    return croppedRegions.map((r, i) => ({ ...r.frame, id: String(i), label: r.detection.label }));
  }

  private async resolveFaceIdentities(faces: FaceDetection[]): Promise<void> {
    const withEmbeddings = faces.filter((f) => f.embedding?.length);
    if (!withEmbeddings.length) return;

    const facePlugin = this.plugins.get(SensorType.Face);
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
