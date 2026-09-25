import { CameraWorld, merge as rustMerge, nms as rustNms, nmsIndices as rustNmsIndices } from '@camera.ui/rust-postprocessor';

import { boxInsidePolygon, normalizePolygon } from '../utils/filter.js';
import { detectionRecord } from './debug/detection-record.js';
import { iou } from './detection-window.js';
import { worldTrace } from './event-trace.js';
import { MIN_PLATE_LENGTH, normalizePlateText } from './plate-vote.js';

import type {
  MergeContainment,
  Detection as RustDetection,
  DetectionLine as RustDetectionLine,
  DetectionZone as RustDetectionZone,
  LineCrossingEvent as RustLineCrossingEvent,
  WorldEvent,
  WorldObject,
} from '@camera.ui/rust-postprocessor';
import type {
  BoundingBox,
  CameraDetectionSettings,
  Detection,
  DetectionLabel,
  DetectionLine,
  LicensePlateDetection,
  MotionZone,
  ObjectZone,
  Point,
  PrivacyZone,
  TrackedDetection,
  ZoneLabel,
} from '@camera.ui/sdk';
import type { TrainingSuggestion } from '../../rpc/interfaces/detection.js';
import type { TraceTick } from './event-trace.js';

const NMS_IOU_THRESHOLD = 0.45;
const NMS_CONFIDENCE_THRESHOLD = 0.25;
const OBJECT_MERGE_IOU_THRESHOLD = 0.3;
const OBJECT_MERGE_CLOSE_THRESHOLD = 0.0;
const PERSON_MERGE_CONTAINMENT: MergeContainment = { labels: ['person'], minShare: 0.85 };
const MOTION_MERGE_IOU_THRESHOLD = 0.01;
const MOTION_MERGE_CLOSE_THRESHOLD = 0.1;
const FACE_CONFIDENCE = 0.5;
const PLATE_CONFIDENCE = 0.3;
const PLATE_OCR_CONFIDENCE = 0.9;
const TRAINING_COVERED_IOU = 0.5;
export const PAN_TO_IMAGE_RATIO = 4.0;

export interface LineCrossingEvent {
  lineName: string;
  direction: 'a-to-b' | 'b-to-a';
  trackId: number;
  label: DetectionLabel;
  confidence: number;
  timestamp: number;
  prevPos: [number, number];
  currPos: [number, number];
  prevBox: [number, number, number, number];
  box: [number, number, number, number];
}

export interface PipelineResult {
  tracked: PresentTrackedDetection[];
  staticTracks: TrackedDetection[];
  trainingExtras: Detection[];
  trainingSuggestions: TrainingSuggestion[];
  crossings: LineCrossingEvent[];
  created: number[];
  removed: number[];
  events: WorldEvent[];
  sightings: WorldObject[];
  trace: TraceTick;
}

export type PresentTrackedDetection = TrackedDetection & { presentSince?: number };

function toRustDetection(det: Detection): RustDetection {
  return {
    x: det.box.x,
    y: det.box.y,
    width: det.box.width,
    height: det.box.height,
    confidence: det.confidence,
    label: det.label,
  };
}

function fromRustDetection(det: RustDetection): Detection {
  return {
    label: det.label as DetectionLabel,
    confidence: det.confidence,
    box: {
      x: det.x,
      y: det.y,
      width: det.width,
      height: det.height,
    },
  };
}

function fromWorldObject(obj: WorldObject): TrackedDetection {
  return {
    label: obj.label as DetectionLabel,
    confidence: obj.confidence,
    box: {
      x: obj.x,
      y: obj.y,
      width: obj.width,
      height: obj.height,
    },
    trackId: obj.trackId,
    trackAge: 0,
    trackLost: false,
    trackSpeed: obj.speed,
    trackVelocity: { x: obj.velocityX, y: obj.velocityY },
    ...(obj.stationarySinceMs !== undefined ? { stationarySince: obj.stationarySinceMs } : {}),
  };
}

// every privacy zone blacks its pixels out of the shipped training jpeg, so a
// box fully inside one would label nothing visible, dropDetections or not
function privacyPolygons(zones: PrivacyZone[]): Point[][] {
  return zones.map((zone) => normalizePolygon(zone.points));
}

function toRustZones(zones: ZoneConfig): RustDetectionZone[] {
  const out: RustDetectionZone[] = [];

  for (const zone of zones.privacy) {
    // a zone that only hides the picture keeps the detector watching
    if (!zone.dropDetections) continue;
    out.push({
      labels: [],
      filter: 'include' as RustDetectionZone['filter'],
      matchType: 'intersect' as RustDetectionZone['matchType'],
      isPrivacyMask: true,
      points: zone.points.map(([x, y]) => [x, y]),
    });
  }
  for (const zone of zones.motion) {
    out.push({
      labels: ['motion'],
      filter: 'include' as RustDetectionZone['filter'],
      matchType: 'intersect' as RustDetectionZone['matchType'],
      isPrivacyMask: false,
      points: zone.points.map(([x, y]) => [x, y]),
    });
  }
  for (const zone of zones.object) {
    out.push({
      labels: zone.labels,
      filter: 'include' as RustDetectionZone['filter'],
      matchType: zone.type as RustDetectionZone['matchType'],
      isPrivacyMask: false,
      points: zone.points.map(([x, y]) => [x, y]),
    });
  }

  return out;
}

function objectWhitelist(zones: ObjectZone[]): Set<string> | null {
  if (zones.length === 0) return null;
  // a zone that lists no label constrains where every object counts, not which ones
  if (zones.some((zone) => zone.labels.length === 0)) return null;

  const labels = new Set<string>();
  for (const zone of zones) {
    for (const label of zone.labels) labels.add(label.toLowerCase());
  }
  return labels;
}

function toRustLines(lines: DetectionLine[]): RustDetectionLine[] {
  return lines.map((line) => ({
    name: line.name,
    direction: line.direction as RustDetectionLine['direction'],
    labels: line.labels,
    points: [
      [line.points[0][0], line.points[0][1]],
      [line.points[1][0], line.points[1][1]],
    ],
  }));
}

function fromRustCrossing(event: RustLineCrossingEvent, lookup: Map<number, BoundingBox>): LineCrossingEvent {
  const box = lookup.get(event.trackId);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  return {
    lineName: event.lineName,
    direction: event.direction as 'a-to-b' | 'b-to-a',
    trackId: event.trackId,
    label: event.label as DetectionLabel,
    confidence: event.confidence,
    timestamp: event.timestampMs,
    prevPos: [event.prevX, event.prevY],
    currPos: [event.currX, event.currY],
    prevBox: [event.prevX - w / 2, event.prevY - h / 2, w, h],
    box: box ? [box.x, box.y, box.width, box.height] : [0, 0, 0, 0],
  };
}

export interface ZoneConfig {
  motion: MotionZone[];
  object: ObjectZone[];
  privacy: PrivacyZone[];
}

export class DetectionPipeline {
  private aspectRatio = 16 / 9;
  private world: CameraWorld;
  private lines: DetectionLine[] = [];
  private suppressStatic: boolean;
  private whitelist: Set<string> | null = null;
  private trainingMasks: Point[][] = [];
  private stillSince = new Map<number, number>();
  private settings: CameraDetectionSettings;

  constructor(zones: ZoneConfig, settings: CameraDetectionSettings) {
    this.settings = settings;
    this.world = new CameraWorld();
    const rustZones = toRustZones(zones);
    this.world.setZones(rustZones);
    this.whitelist = objectWhitelist(zones.object);
    this.trainingMasks = privacyPolygons(zones.privacy);
    this.applyConfidences(settings);
    this.suppressStatic = settings.object.suppressStatic ?? true;
    // debugging
    detectionRecord.config({ zones: rustZones, minConfidences: settings.object.confidences });
  }

  public updateZones(zones: ZoneConfig): void {
    const rustZones = toRustZones(zones);
    this.world.setZones(rustZones);
    this.whitelist = objectWhitelist(zones.object);
    this.trainingMasks = privacyPolygons(zones.privacy);
    // debugging
    detectionRecord.config({ zones: rustZones });
  }

  public updateLines(lines: DetectionLine[], aspectRatio?: number): void {
    if (aspectRatio !== undefined) this.aspectRatio = aspectRatio;
    this.lines = lines;
    const rustLines = toRustLines(lines);
    this.world.setLines(rustLines, this.aspectRatio);
    // debugging
    detectionRecord.config({ lines: rustLines, aspectRatio: this.aspectRatio });
  }

  public updateSettings(settings: CameraDetectionSettings): void {
    this.applyConfidences(settings);
    this.suppressStatic = settings.object.suppressStatic ?? true;
    // debugging
    detectionRecord.config({ minConfidences: settings.object.confidences });
  }

  public notifyCameraMove(): void {
    this.world.notifyCameraMove();
  }

  public attest(label: string, tMs = Date.now()): void {
    this.world.attest(label, tMs);
  }

  public process(rawDetections: Detection[], poseDelta?: { panDelta: number; tiltDelta: number }, tMs = Date.now()): PipelineResult {
    // the label whitelist is ours, not rust's: a zone only constrains the
    // labels it lists, so a label no zone lists would otherwise pass anywhere
    const allowed = this.allowedByWhitelist(rawDetections);
    const flat = allowed.length === 0 ? [] : this.runNmsAndMergeFlat(allowed);
    const cameraMotion = poseDelta ? { x: -poseDelta.panDelta * PAN_TO_IMAGE_RATIO, y: poseDelta.tiltDelta * PAN_TO_IMAGE_RATIO } : undefined;
    const result = this.world.ingest(tMs, flat, cameraMotion);
    const tracked: PresentTrackedDetection[] = (this.suppressStatic ? result.tracked.filter((t) => t.state !== 'stationary') : result.tracked).map(fromWorldObject);
    const staticTracks = this.suppressStatic ? result.tracked.filter((t) => t.state === 'stationary').map(fromWorldObject) : [];

    // a standing subject is suppressed until it wakes; remember since when it
    // stood so its wake sighting can say how long it was already there
    const seen = new Set<number>();
    for (const t of result.tracked) {
      seen.add(t.trackId);
      if (t.stationarySinceMs !== undefined) this.stillSince.set(t.trackId, t.stationarySinceMs);
    }
    for (const id of this.stillSince.keys()) {
      if (!seen.has(id)) this.stillSince.delete(id);
    }
    for (const t of tracked) {
      if (t.trackId === undefined || t.stationarySince !== undefined) continue;
      const since = this.stillSince.get(t.trackId);
      if (since !== undefined) t.presentSince = since;
    }

    const boxLookup = new Map<number, BoundingBox>();
    for (const t of tracked) {
      if (t.trackId !== undefined) boxLookup.set(t.trackId, t.box);
    }

    const training = this.collectTraining(rawDetections, tracked, staticTracks);

    return {
      tracked,
      staticTracks,
      trainingExtras: training.extras,
      trainingSuggestions: training.suggestions,
      crossings: result.crossings.map((c) => fromRustCrossing(c, boxLookup)),
      created: result.created,
      removed: result.removed,
      events: result.events,
      sightings: result.sightings,
      trace: worldTrace(tMs, flat, cameraMotion, result),
    };
  }

  public runNms<T extends Detection>(rawDetections: T[]): T[] {
    if (rawDetections.length === 0) return [];
    const flat = rawDetections.map(toRustDetection).filter((d) => d.confidence >= NMS_CONFIDENCE_THRESHOLD);
    if (flat.length === 0) return [];
    const filteredMap: number[] = [];
    for (let i = 0; i < rawDetections.length; i++) {
      if (toRustDetection(rawDetections[i]).confidence >= NMS_CONFIDENCE_THRESHOLD) {
        filteredMap.push(i);
      }
    }
    const keptFilteredIndices = rustNmsIndices(flat, NMS_IOU_THRESHOLD);
    return keptFilteredIndices.map((fi) => rawDetections[filteredMap[fi]]);
  }

  public processExternal(detections: Detection[]): TrackedDetection[] {
    const zoneFiltered = this.runMergeAndZoneFilter(detections);
    return zoneFiltered.map((d) => ({ ...d, trackLost: false }));
  }

  public runMergeAndZoneFilter(detections: Detection[]): Detection[] {
    const allowed = this.allowedByWhitelist(detections);
    if (allowed.length === 0) return [];
    const flat = allowed.map(toRustDetection);
    const merged = rustMerge(flat, MOTION_MERGE_IOU_THRESHOLD, MOTION_MERGE_CLOSE_THRESHOLD);
    if (merged.length === 0) return [];
    const indices = this.world.filterIndices(merged);
    return indices.map((i) => fromRustDetection(merged[i]));
  }

  public runZoneFilter(detections: Detection[]): Detection[] {
    const allowed = this.allowedByWhitelist(detections);
    if (allowed.length === 0) return [];
    const flat = allowed.map(toRustDetection);
    const indices = this.world.filterIndices(flat);
    return indices.map((i) => allowed[i]);
  }

  public runZoneFilterWithLabel<T extends { box: BoundingBox; confidence: number }>(items: T[], label: ZoneLabel): T[] {
    if (items.length === 0 || !this.objectLabelAllowed(label)) return [];
    const flat: RustDetection[] = items.map((item) => ({
      x: item.box.x,
      y: item.box.y,
      width: item.box.width,
      height: item.box.height,
      confidence: item.confidence,
      label,
    }));
    const indices = this.world.filterIndices(flat);
    return indices.map((i) => items[i]);
  }

  public retainTracks(trackIds: number[]): number[] {
    return trackIds;
  }

  public objectLabelAllowed(label: string): boolean {
    if (this.whitelist === null) return true;
    const lower = label.toLowerCase();
    return lower === 'motion' || this.whitelist.has(lower);
  }

  public threshold(label: string): number {
    const lower = label.toLowerCase();
    if (lower === 'face') return this.settings.face?.confidence ?? FACE_CONFIDENCE;
    if (lower === 'license_plate') return this.settings.licensePlate?.confidence ?? PLATE_CONFIDENCE;
    const confidences: Record<string, number> = this.settings.object.confidences;
    const values = Object.values(confidences);
    return confidences[lower] ?? (values.length > 0 ? Math.min(...values) : 0.5);
  }

  public aboveThreshold<T extends { label: string; confidence: number }>(detections: T[]): T[] {
    return detections.filter((d) => d.confidence >= this.threshold(d.label));
  }

  public splitFaces<T extends { confidence: number }>(faces: T[]): { kept: T[]; weak: T[] } {
    const threshold = this.threshold('face');
    return { kept: faces.filter((f) => f.confidence >= threshold), weak: faces.filter((f) => f.confidence < threshold) };
  }

  public splitPlates<T extends LicensePlateDetection>(plates: T[]): { kept: T[]; weak: T[] } {
    const threshold = this.threshold('license_plate');
    const ocrConfidence = this.settings.licensePlate?.ocrConfidence ?? PLATE_OCR_CONFIDENCE;
    const minLength = this.settings.licensePlate?.minLength ?? MIN_PLATE_LENGTH;
    const readable = (plate: T) =>
      normalizePlateText(plate.plateText ?? '').length >= minLength && (plate.ocrConfidence === undefined || plate.ocrConfidence >= ocrConfidence);
    const kept = plates.filter((p) => p.confidence >= threshold && readable(p));
    return { kept, weak: plates.filter((p) => !kept.includes(p)) };
  }

  public trainingSuggestionsFor(items: { box: BoundingBox; confidence: number }[], label: string): TrainingSuggestion[] {
    return items.filter((item) => !this.masked(item.box)).map((item) => ({ label, box: item.box, confidence: item.confidence }));
  }

  private applyConfidences(settings: CameraDetectionSettings): void {
    this.settings = settings;
    const values = Object.values(settings.object.confidences);
    this.world.setMinConfidence(values.length > 0 ? Math.min(...values) : 0.5);
    // faces and plates pass the same zone filter, each at its own threshold
    this.world.setMinConfidences({ ...settings.object.confidences, face: this.threshold('face'), license_plate: this.threshold('license_plate') });
  }

  private allowedByWhitelist<T extends { label: string }>(detections: T[]): T[] {
    if (detections.length === 0 || this.whitelist === null) return detections;
    return detections.filter((detection) => this.objectLabelAllowed(detection.label));
  }

  private collectTraining(
    rawDetections: Detection[],
    tracked: TrackedDetection[],
    staticTracks: TrackedDetection[],
  ): { extras: Detection[]; suggestions: TrainingSuggestion[] } {
    const flat = rawDetections.map(toRustDetection).filter((d) => d.confidence >= NMS_CONFIDENCE_THRESHOLD);
    if (flat.length === 0) return { extras: [], suggestions: [] };

    const kept = rustNms(flat, NMS_IOU_THRESHOLD);
    const strong = kept.filter((d) => d.confidence >= this.threshold(d.label));
    const weak = kept.filter((d) => d.confidence < this.threshold(d.label));
    const covered = (detection: Detection, by: Detection[]) => by.some((t) => t.label === detection.label && iou(t.box, detection.box) >= TRAINING_COVERED_IOU);

    const output: Detection[] = [...tracked, ...staticTracks];
    const merged = strong.length === 0 ? [] : rustMerge(strong, OBJECT_MERGE_IOU_THRESHOLD, OBJECT_MERGE_CLOSE_THRESHOLD, PERSON_MERGE_CONTAINMENT);
    const extras = merged.map(fromRustDetection).filter((d) => !this.masked(d.box) && !covered(d, output));
    const suggestions = weak
      .map(fromRustDetection)
      .filter((d) => !this.masked(d.box) && !covered(d, [...output, ...extras]))
      .map((d) => ({ label: d.label, box: d.box, confidence: d.confidence }));
    return { extras, suggestions };
  }

  private masked(box: BoundingBox): boolean {
    return this.trainingMasks.some((mask) => boxInsidePolygon(box, mask));
  }

  private runNmsAndMergeFlat(rawDetections: Detection[]): RustDetection[] {
    const flat = rawDetections.map(toRustDetection).filter((d) => d.confidence >= NMS_CONFIDENCE_THRESHOLD);
    if (flat.length === 0) return [];
    const deduped = rustNms(flat, NMS_IOU_THRESHOLD);
    if (deduped.length === 0) return [];
    return rustMerge(deduped, OBJECT_MERGE_IOU_THRESHOLD, OBJECT_MERGE_CLOSE_THRESHOLD, PERSON_MERGE_CONTAINMENT);
  }
}
