import type { Detection as RustDetection, WorldEvent, WorldIngestResult } from '@camera.ui/rust-postprocessor';
import type { BoundingBox, ClassifierDetection, Detection, FaceDetection, LicensePlateDetection } from '@camera.ui/sdk';
import type { DetectionResults } from '../../rpc/interfaces/detection.js';
import type { TrackedSecondary } from './event-manager.js';

export type TraceBox = [number, number, number, number];

export interface TraceObject {
  id: number;
  label: string;
  conf: number;
  state: string;
  speed: number;
  box: TraceBox;
}

export interface TraceEvent {
  kind: string;
  id: number;
  label: string;
  state: string;
}

export interface TraceAttribute {
  type: 'face' | 'plate' | 'class';
  label: string;
  conf: number;
  parent?: number;
  box: TraceBox;
}

export interface TraceTick {
  tMs: number;
  rtp?: number;
  src?: string;
  objectRan: boolean;
  detections: RustDetection[];
  cameraMotion?: { x: number; y: number };
  world: TraceObject[];
  events: TraceEvent[];
  created?: number[];
  removed?: number[];
  motion?: TraceBox[];
  attrs?: TraceAttribute[];
}

const KEEP_INTERVAL_MS = 500;
const MOTION_ONLY_INTERVAL_MS = 1000;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function traceBox(box: BoundingBox): TraceBox {
  return [round(box.x), round(box.y), round(box.width), round(box.height)];
}

export function worldTrace(tMs: number, detections: RustDetection[], cameraMotion: { x: number; y: number } | undefined, result: WorldIngestResult): TraceTick {
  return {
    tMs,
    objectRan: true,
    detections: detections.map((d) => ({
      label: d.label,
      confidence: round(d.confidence),
      x: round(d.x),
      y: round(d.y),
      width: round(d.width),
      height: round(d.height),
    })),
    cameraMotion,
    world: result.tracked.map((t) => ({
      id: t.trackId,
      label: t.label,
      conf: round(t.confidence),
      state: t.state,
      speed: round(t.speed),
      box: [round(t.x), round(t.y), round(t.width), round(t.height)],
    })),
    events: [
      ...result.events.map((e: WorldEvent) => ({ kind: e.eventType, id: e.object.trackId, label: e.object.label, state: e.object.state })),
      ...result.crossings.map((c) => ({ kind: `line:${c.lineName}:${c.direction}`, id: c.trackId, label: c.label, state: 'crossed' })),
    ],
    created: result.created.length > 0 ? result.created : undefined,
    removed: result.removed.length > 0 ? result.removed : undefined,
  };
}

export function externalTrace(tMs: number, reported: Detection[], assisted: Detection[] | undefined): TraceTick {
  const withBox = (list: Detection[]) => list.filter((d) => d.box);
  const objects = assisted ? withBox(assisted) : withBox(reported);
  return {
    tMs,
    objectRan: assisted !== undefined,
    detections: (assisted ? withBox(reported) : []).map((d) => ({
      label: d.label,
      confidence: round(d.confidence),
      x: round(d.box.x),
      y: round(d.box.y),
      width: round(d.box.width),
      height: round(d.box.height),
    })),
    world: objects.map((d) => ({ id: 0, label: d.label, conf: round(d.confidence), state: 'external', speed: 0, box: traceBox(d.box) })),
    events: [],
  };
}

export function motionTrace(tMs: number, detections: Detection[]): TraceTick {
  return { tMs, objectRan: false, detections: [], world: [], events: [], motion: detections.map((d) => traceBox(d.box)) };
}

export function traceAttributes(results: DetectionResults): TraceAttribute[] | undefined {
  const attrs: TraceAttribute[] = [];
  const faces = (results.face?.detections ?? []) as (FaceDetection & TrackedSecondary)[];
  for (const d of faces) {
    attrs.push({ type: 'face', label: d.identity ?? 'unknown', conf: round(d.confidence), parent: d.parentTrackId, box: traceBox(d.box) });
  }
  const plates = (results.licensePlate?.detections ?? []) as (LicensePlateDetection & TrackedSecondary)[];
  for (const d of plates) {
    if (!d.plateText) continue;
    attrs.push({ type: 'plate', label: d.plateText, conf: round(d.ocrConfidence ?? d.confidence), parent: d.parentTrackId, box: traceBox(d.box) });
  }
  for (const classifier of Object.values(results.classifiers ?? {})) {
    for (const d of classifier.detections as (ClassifierDetection & TrackedSecondary)[]) {
      if (!d.subAttribute) continue;
      attrs.push({ type: 'class', label: d.subAttribute, conf: round(d.confidence), parent: d.parentTrackId, box: traceBox(d.box) });
    }
  }
  return attrs.length > 0 ? attrs : undefined;
}

export class EventTraceCollector {
  private ticks: TraceTick[] = [];
  private lastKeptAt = 0;
  private readonly seenReadings = new Set<string>();

  public add(tick: TraceTick): void {
    if (tick.world.length === 0 && tick.events.length === 0 && !tick.motion?.length && !tick.objectRan) return;

    const changed = tick.events.length > 0 || (tick.created?.length ?? 0) > 0 || (tick.removed?.length ?? 0) > 0 || this.hasNewReading(tick);
    const interval = tick.world.length > 0 ? KEEP_INTERVAL_MS : MOTION_ONLY_INTERVAL_MS;
    if (!changed && tick.tMs - this.lastKeptAt < interval) return;

    this.ticks.push(tick);
    this.lastKeptAt = tick.tMs;
  }

  public take(): TraceTick[] | undefined {
    if (this.ticks.length === 0) return undefined;
    const ticks = this.ticks;
    this.ticks = [];
    return ticks;
  }

  public reset(): void {
    this.ticks = [];
    this.lastKeptAt = 0;
    this.seenReadings.clear();
  }

  private hasNewReading(tick: TraceTick): boolean {
    let fresh = false;
    for (const attr of tick.attrs ?? []) {
      const key = `${attr.type}:${attr.label}`;
      if (this.seenReadings.has(key)) continue;
      this.seenReadings.add(key);
      fresh = true;
    }
    return fresh;
  }
}
