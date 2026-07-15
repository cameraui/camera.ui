import {
  merge as rustMerge,
  nms as rustNms,
  nmsIndices as rustNmsIndices,
  ObjectTracker as RustObjectTracker,
  type Detection as RustDetection,
  type DetectionLine as RustDetectionLine,
  type DetectionZone as RustDetectionZone,
  type LineCrossingEvent as RustLineCrossingEvent,
  type TrackedDetection as RustTrackedDetection,
} from '@camera.ui/rust-postprocessor';

import type { BoundingBox, CameraDetectionSettings, Detection, DetectionLabel, DetectionLine, DetectionZone, TrackedDetection, VideoFrameData } from '@camera.ui/sdk';

const NMS_IOU_THRESHOLD = 0.45;
const NMS_CONFIDENCE_THRESHOLD = 0.25;
const OBJECT_MERGE_IOU_THRESHOLD = 0.3;
const OBJECT_MERGE_CLOSE_THRESHOLD = 0.0;
const MOTION_MERGE_IOU_THRESHOLD = 0.01;
const MOTION_MERGE_CLOSE_THRESHOLD = 0.1;
const TRACKER_IOU_THRESHOLD = 0.1;
const TRACKER_HIT_COUNTER_MAX = 30;
const TRACKER_INITIALIZATION_DELAY = 3;

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
  tracked: TrackedDetection[];
  crossings: LineCrossingEvent[];
  created: number[];
  removed: number[];
}

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

function fromRustTracked(det: RustTrackedDetection): TrackedDetection {
  return {
    label: det.label as DetectionLabel,
    confidence: det.confidence,
    box: {
      x: det.x,
      y: det.y,
      width: det.width,
      height: det.height,
    },
    trackId: det.trackId,
    trackAge: det.trackAge,
    trackLost: det.trackLost,
    trackSpeed: det.trackSpeed,
    trackVelocity: { x: det.trackVelocityX, y: det.trackVelocityY },
  };
}

function toRustZones(zones: DetectionZone[]): RustDetectionZone[] {
  return zones.map((zone) => ({
    labels: zone.labels,
    filter: zone.filter as RustDetectionZone['filter'],
    matchType: zone.type as RustDetectionZone['matchType'],
    isPrivacyMask: zone.isPrivacyMask,
    points: zone.points.map(([x, y]) => [x, y]),
  }));
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

export class DetectionPipeline {
  private aspectRatio: number;
  private readonly tracker: RustObjectTracker;

  constructor(zones: DetectionZone[], settings: CameraDetectionSettings) {
    this.aspectRatio = 16 / 9;
    this.tracker = new RustObjectTracker({
      iouThreshold: TRACKER_IOU_THRESHOLD,
      hitCounterMax: TRACKER_HIT_COUNTER_MAX,
      initializationDelay: TRACKER_INITIALIZATION_DELAY,
    });
    this.tracker.setMinConfidence(settings.object.confidence);
    this.tracker.setZones(toRustZones(zones));
  }

  public updateZones(zones: DetectionZone[]): void {
    this.tracker.setZones(toRustZones(zones));
  }

  public updateLines(lines: DetectionLine[], aspectRatio?: number): void {
    if (aspectRatio !== undefined) this.aspectRatio = aspectRatio;
    this.tracker.setLines(toRustLines(lines), this.aspectRatio);
  }

  public updateSettings(settings: CameraDetectionSettings): void {
    this.tracker.setMinConfidence(settings.object.confidence);
  }

  public setReidHitCounterMax(frames: number): void {
    this.tracker.setReidHitCounterMax(frames);
  }

  public refreshReid(): void {
    this.tracker.refreshReid();
  }

  public process(rawDetections: Detection[], frame: VideoFrameData, poseDelta?: { panDelta: number; tiltDelta: number }): PipelineResult {
    const flat = rawDetections.length === 0 ? [] : this.runNmsAndMergeFlat(rawDetections);
    // Norfair's movement_vector is the scene flow: panning right drifts the
    // scene left (x = -panDelta), tilting up drifts it down (y = +tiltDelta,
    // image y grows downward). The autotracker feeds an accumulated offset
    // from its reference pose, not a per-frame delta, so the Kalman state
    // keeps one consistent reference across frames.
    const cameraMotion = poseDelta ? { x: -poseDelta.panDelta * PAN_TO_IMAGE_RATIO, y: poseDelta.tiltDelta * PAN_TO_IMAGE_RATIO } : undefined;
    const result = this.tracker.update(flat, Date.now(), frame.data as Buffer, frame.width, frame.height, cameraMotion);

    // lost (Kalman-extrapolated) tracks stay in the output for smooth UI
    // bboxes, the coordinator excludes them from the event lifecycle
    const tracked = result.tracked.map(fromRustTracked);
    const boxLookup = new Map<number, BoundingBox>();
    for (const t of tracked) {
      if (t.trackId !== undefined) boxLookup.set(t.trackId, t.box);
    }

    return {
      tracked,
      crossings: result.crossings.map((c) => fromRustCrossing(c, boxLookup)),
      created: result.created,
      removed: result.removed,
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
    if (detections.length === 0) return [];
    const flat = detections.map(toRustDetection);
    const merged = rustMerge(flat, MOTION_MERGE_IOU_THRESHOLD, MOTION_MERGE_CLOSE_THRESHOLD);
    if (merged.length === 0) return [];
    const indices = this.tracker.filterIndices(merged);
    return indices.map((i) => fromRustDetection(merged[i]));
  }

  public runZoneFilter(detections: Detection[]): Detection[] {
    if (detections.length === 0) return [];
    const flat = detections.map(toRustDetection);
    const indices = this.tracker.filterIndices(flat);
    return indices.map((i) => detections[i]);
  }

  public runZoneFilterWithLabel<T extends { box: BoundingBox; confidence: number }>(items: T[], label: DetectionLabel): T[] {
    if (items.length === 0) return [];
    const flat: RustDetection[] = items.map((item) => ({
      x: item.box.x,
      y: item.box.y,
      width: item.box.width,
      height: item.box.height,
      confidence: item.confidence,
      label,
    }));
    const indices = this.tracker.filterIndices(flat);
    return indices.map((i) => items[i]);
  }

  public cleanup(): void {
    this.tracker.reset();
  }

  public retainTracks(trackIds: number[]): number[] {
    return this.tracker.retainTracks(trackIds);
  }

  private runNmsAndMergeFlat(rawDetections: Detection[]): RustDetection[] {
    const flat = rawDetections.map(toRustDetection).filter((d) => d.confidence >= NMS_CONFIDENCE_THRESHOLD);
    if (flat.length === 0) return [];
    const deduped = rustNms(flat, NMS_IOU_THRESHOLD);
    if (deduped.length === 0) return [];
    return rustMerge(deduped, OBJECT_MERGE_IOU_THRESHOLD, OBJECT_MERGE_CLOSE_THRESHOLD);
  }
}
