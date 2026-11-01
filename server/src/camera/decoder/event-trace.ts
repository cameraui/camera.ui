import { createRequire } from 'node:module';

import { faceNote } from './face-tracks.js';

import type {
  Detection as RustDetection,
  DetectionLine as RustDetectionLine,
  DetectionZone as RustDetectionZone,
  WorldEvent,
  WorldIngestResult,
  WorldObject,
} from '@camera.ui/rust-postprocessor';
import type { BoundingBox, ClassifierDetection, Detection, FaceDetection, LicensePlateDetection } from '@camera.ui/sdk';
import type { DetectionResults, PlateShortfall, ServerFaceDetection, WeakPlate } from '../../rpc/interfaces/detection.js';
import type { PlanRecord, WindowMode } from './detection-window.js';
import type { TrackedSecondary } from './event-manager.js';
import type { FaceTally } from './face-tracks.js';

export type TraceBox = [number, number, number, number];
export type TraceInputBox = [label: string, conf: number, x: number, y: number, width: number, height: number, id: number, clipped?: 1];
export type TraceDetection = RustDetection & { id?: number };
export type FaceLabelSource = 'track' | 'cell' | 'own' | 'single';

export const TRACE_CONTEXT = Symbol('traceContext');

export interface TraceObject {
  id: number;
  label: string;
  conf: number;
  score?: number;
  state: string;
  speed: number;
  box: TraceBox;
  handover?: string;
  handoverTier?: string;
  unseenMs?: number;
}

export interface TraceEvent {
  kind: string;
  id: number;
  label: string;
  state: string;
  attested?: boolean;
  wakeCause?: string;
  anchorDistance?: number;
}

export interface TraceAttribute {
  type: 'face' | 'plate' | 'class';
  label: string;
  conf: number;
  parent?: number;
  box: TraceBox;
  weak?: 'confidence' | PlateShortfall;
  key?: string;
  source?: FaceLabelSource;
  age?: number;
  shared?: number;
  epoch?: number;
}

export interface TraceReadFrame {
  tMs: number;
  rtp?: number;
  src?: string;
}

export interface TraceFaceRead {
  at: number;
  frame?: TraceReadFrame;
  trigger?: string;
  key?: string;
  px?: number;
  parent?: number;
  box: TraceBox;
  quality?: number;
  empty?: true;
  failed?: true;
  match?: string;
  score?: number;
  closest?: string;
  closestScore?: number;
  runnerUp?: string;
  runnerUpScore?: number;
  name?: string;
  leader?: string;
  votes?: number;
  reads?: number;
  single?: boolean;
  source?: FaceLabelSource;
  epoch?: number;
}

export interface TraceAttest {
  label: string;
  at: number;
}

export interface TraceDoubt {
  id: number;
  cause: string;
  tMs: number;
}

export interface TraceFaceTick {
  faceSearch?: number[];
  doubt?: TraceDoubt[];
}

export interface TraceInput {
  tMs: number;
  boxes?: TraceInputBox[];
  cameraMotion?: { x: number; y: number };
  attest?: TraceAttest[];
  win?: WindowMode;
  winReason?: string;
  windows?: TraceBox[];
  motion?: TraceBox[];
}

export interface TraceMotionOnly {
  tMs: number;
  motion: TraceBox[];
  external?: true;
}

export interface TraceWorldConfig {
  zones?: RustDetectionZone[];
  minConfidence?: number;
  minConfidences?: Record<string, number>;
  lines?: RustDetectionLine[];
  aspectRatio?: number;
}

export interface TraceStart {
  format: 2;
  world?: string;
  server?: string;
  config?: TraceWorldConfig;
  attestations?: TraceAttest[];
  sinceIngestMs?: number;
}

export interface TraceContext {
  config: TraceWorldConfig;
  attestations: TraceAttest[];
  sinceIngestMs?: number;
}

export interface FaceReadContext {
  frame?: TraceReadFrame;
  trigger?: string;
  key?: string;
  px?: number;
  quality?: number;
  source?: FaceLabelSource;
  empty?: boolean;
}

export interface TraceTick {
  tMs: number;
  rtp?: number;
  src?: string;
  objectRan: boolean;
  external?: true;
  suppressed?: true;
  cameraMoved?: true;
  start?: TraceStart;
  configChange?: TraceWorldConfig;
  win?: WindowMode;
  winReason?: string;
  windows?: TraceBox[];
  detections: TraceDetection[];
  cameraMotion?: { x: number; y: number };
  attest?: TraceAttest[];
  between?: TraceInput[];
  motionOnly?: TraceMotionOnly[];
  world: TraceObject[];
  events: TraceEvent[];
  created?: number[];
  removed?: number[];
  motion?: TraceBox[];
  attrs?: TraceAttribute[];
  reads?: TraceFaceRead[];
  faceSearch?: number[];
  doubt?: TraceDoubt[];
  witness?: string[];
  [TRACE_CONTEXT]?: TraceContext;
}

export interface WorldSignals {
  wakeCause?: string;
  anchorDistance?: number;
  handover?: string;
  handoverTier?: string;
  unseenMs?: number;
}

const KEEP_INTERVAL_MS = 500;
const MOTION_ONLY_INTERVAL_MS = 1000;
const EMPTY_CONTEXT_TICKS = 3;
const KEPT_AT_MS = 60_000;
const WIN_CHANGED = 1;
const WINDOWS_CHANGED = 2;

const requirePackage = createRequire(import.meta.url);
const WORLD_VERSION = packageVersion('@camera.ui/rust-postprocessor/package.json');
const SERVER_VERSION = packageVersion('../../../package.json');

function packageVersion(path: string): string | undefined {
  try {
    return (requirePackage(path) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function traceBox(box: BoundingBox): TraceBox {
  return [round(box.x), round(box.y), round(box.width), round(box.height)];
}

export function traceSource(role: string | undefined): string | undefined {
  return role?.replace('-resolution', '');
}

export function traceStamp(tMs: number, rtp: number | undefined, role: string | undefined): TraceReadFrame {
  const frame: TraceReadFrame = { tMs };
  if (rtp !== undefined) frame.rtp = rtp;
  const src = traceSource(role);
  if (src) frame.src = src;
  return frame;
}

export function worldTrace(tMs: number, detections: RustDetection[], cameraMotion: { x: number; y: number } | undefined, result: WorldIngestResult): TraceTick {
  const tracked: (WorldObject & WorldSignals)[] = result.tracked;
  return {
    tMs,
    objectRan: true,
    detections: detections.map((d) => traceDetection(d, tracked)),
    cameraMotion,
    world: tracked.map(traceObject),
    events: [
      ...result.events.map(traceEvent),
      ...result.crossings.map((c) => ({ kind: `line:${c.lineName}:${c.direction}`, id: c.trackId, label: c.label, state: 'crossed' })),
    ],
    created: result.created.length > 0 ? result.created : undefined,
    removed: result.removed.length > 0 ? result.removed : undefined,
  };
}

export function windowTrace(plan: PlanRecord | undefined): Pick<TraceTick, 'win' | 'winReason' | 'windows'> {
  if (!plan) return { win: 'full' };
  if (plan.mode === 'window') return { win: 'window', windows: plan.windows.map(traceBox) };
  if (plan.mode === 'sweep') return plan.reason ? { win: 'sweep', winReason: plan.reason } : { win: 'sweep' };
  return { win: plan.reason === 'cover' ? 'cover' : 'full' };
}

export function externalTrace(tMs: number, reported: Detection[], assisted: Detection[] | undefined): TraceTick {
  const withBox = (list: Detection[]) => list.filter((d) => d.box);
  const objects = assisted ? withBox(assisted) : withBox(reported);
  return {
    tMs,
    objectRan: assisted !== undefined,
    external: true,
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

function traceDetection(d: RustDetection, tracked: WorldObject[]): TraceDetection {
  const detection: TraceDetection = {
    label: d.label,
    confidence: Math.fround(d.confidence),
    x: Math.fround(d.x),
    y: Math.fround(d.y),
    width: Math.fround(d.width),
    height: Math.fround(d.height),
  };
  if (d.clipped) detection.clipped = true;

  // the engine passes the detection box through unchanged, so exact equality names the track
  for (const t of tracked) {
    if (t.x === detection.x && t.y === detection.y && t.width === detection.width && t.height === detection.height && t.label === detection.label) {
      detection.id = t.trackId;
      break;
    }
  }
  return detection;
}

function traceObject(t: WorldObject & WorldSignals): TraceObject {
  const entry: TraceObject = { id: t.trackId, label: t.label, conf: t.confidence, state: t.state, speed: t.speed, box: [t.x, t.y, t.width, t.height] };
  if (t.score !== t.confidence) entry.score = t.score;
  if (t.handover !== undefined) entry.handover = t.handover;
  if (t.handoverTier !== undefined) entry.handoverTier = t.handoverTier;
  if (t.unseenMs !== undefined) entry.unseenMs = t.unseenMs;
  return entry;
}

function traceEvent(e: WorldEvent): TraceEvent {
  const object: WorldObject & WorldSignals = e.object;
  const event: TraceEvent = { kind: e.eventType, id: object.trackId, label: object.label, state: object.state };
  if (e.eventType === 'objectEntered' && object.attested) event.attested = true;
  if (object.wakeCause !== undefined) event.wakeCause = object.wakeCause;
  if (object.anchorDistance !== undefined) event.anchorDistance = object.anchorDistance;
  return event;
}

function traceInput(tick: TraceTick, form: number): TraceInput {
  const input: TraceInput = { tMs: tick.tMs };
  if (tick.detections.length > 0) input.boxes = tick.detections.map(inputBox);
  if (tick.cameraMotion) input.cameraMotion = tick.cameraMotion;
  if (tick.attest?.length) input.attest = tick.attest;
  if (form & WIN_CHANGED && tick.win) input.win = tick.win;
  if (tick.winReason) input.winReason = tick.winReason;
  if (form & WINDOWS_CHANGED && tick.windows) input.windows = tick.windows;
  if (tick.motion?.length) input.motion = tick.motion;
  return input;
}

function inputBox(d: TraceDetection): TraceInputBox {
  const box: TraceInputBox = [d.label, d.confidence, d.x, d.y, d.width, d.height, d.id ?? 0];
  if (d.clipped) box.push(1);
  return box;
}

function worldInput(tick: TraceTick): boolean {
  return tick.objectRan && tick.external !== true;
}

function sameBoxes(a: TraceBox[], b: TraceBox[] | undefined): boolean {
  if (a.length !== b?.length) return false;
  return a.every((box, i) => box[0] === b[i][0] && box[1] === b[i][1] && box[2] === b[i][2] && box[3] === b[i][3]);
}

function takeBefore<T extends { tMs: number }>(list: T[], tMs: number): T[] {
  const before = list.findIndex((item) => item.tMs >= tMs);
  return list.splice(0, before === -1 ? list.length : before);
}

function remove<T>(list: T[], item: T | undefined): void {
  const index = item === undefined ? -1 : list.indexOf(item);
  if (index >= 0) list.splice(index, 1);
}

export function motionTrace(tMs: number, detections: Detection[], external = false): TraceTick {
  const tick: TraceTick = { tMs, objectRan: false, detections: [], world: [], events: [], motion: detections.map((d) => traceBox(d.box)) };
  if (external) tick.external = true;
  return tick;
}

export function faceRead(face: ServerFaceDetection & TrackedSecondary, at: number, tally: FaceTally | undefined, context: FaceReadContext = {}): TraceFaceRead {
  const read: TraceFaceRead = { at, parent: face.parentTrackId, box: traceBox(face.box) };
  if (context.frame) read.frame = context.frame;
  if (context.trigger) read.trigger = context.trigger;
  if (context.key) read.key = context.key;
  if (context.px !== undefined) read.px = context.px;
  if (context.quality !== undefined) read.quality = round(context.quality);
  if (context.empty) {
    read.empty = true;
    return read;
  }
  if (face.matched) {
    read.match = face.matched;
    read.score = round(face.matchScore ?? 0);
  }
  if (face.closest) {
    read.closest = face.closest;
    read.closestScore = round(face.closestScore ?? 0);
  }
  if (face.runnerUp) {
    read.runnerUp = face.runnerUp;
    read.runnerUpScore = round(face.runnerUpScore ?? 0);
  }
  if (face.identity) read.name = face.identity;
  if (tally) {
    read.leader = tally.leader;
    read.votes = tally.votes;
    read.reads = tally.reads;
  } else {
    read.single = true;
  }
  if (context.source) read.source = context.source;
  return read;
}

export function traceAttributes(results: DetectionResults): TraceAttribute[] | undefined {
  const attrs: TraceAttribute[] = [];
  const faces = (results.face?.detections ?? []) as (FaceDetection & TrackedSecondary)[];
  for (const d of faces) {
    const attr: TraceAttribute = { type: 'face', label: d.identity ?? 'unknown', conf: round(d.confidence), parent: d.parentTrackId, box: traceBox(d.box) };
    const note = faceNote(d);
    if (note) {
      attr.key = note.key;
      if (note.source) attr.source = note.source;
      if (note.age !== undefined) attr.age = note.age;
      if (note.shared !== undefined) attr.shared = note.shared;
      if (note.epoch !== undefined) attr.epoch = note.epoch;
    } else if (d.identity) {
      attr.source = 'single';
    }
    attrs.push(attr);
  }
  const plates = (results.licensePlate?.detections ?? []) as (LicensePlateDetection & TrackedSecondary)[];
  for (const d of plates) {
    if (!d.plateText) continue;
    attrs.push({ type: 'plate', label: d.plateText, conf: round(d.ocrConfidence ?? d.confidence), parent: d.parentTrackId, box: traceBox(d.box) });
  }
  for (const d of (results.weakFaces ?? []) as (FaceDetection & TrackedSecondary)[]) {
    attrs.push({ type: 'face', label: 'unknown', conf: round(d.confidence), parent: d.parentTrackId, box: traceBox(d.box), weak: 'confidence' });
  }
  for (const d of (results.weakPlates ?? []) as (WeakPlate & TrackedSecondary)[]) {
    const conf = d.shortfall === 'confidence' ? d.confidence : (d.ocrConfidence ?? d.confidence);
    attrs.push({ type: 'plate', label: d.plateText ?? '', conf: round(conf), parent: d.parentTrackId, box: traceBox(d.box), weak: d.shortfall });
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
  private dropped: TraceInput[] = [];
  private motionOnly: TraceMotionOnly[] = [];
  private lastKeptAt = 0;
  private newestKeptAt = 0;
  private newestAddedAt = 0;
  private startMs = 0;
  private pendingEmpty: TraceTick[] = [];
  private pendingForms: number[] = [];
  private emptyTail = 0;
  private pendingReads: TraceFaceRead[] = [];
  private pendingSearch?: Set<number>;
  private pendingDoubt: TraceDoubt[] = [];
  private lastWin?: WindowMode;
  private lastWindows?: TraceBox[];
  private context?: TraceContext;
  private started = false;
  private startedWorld = false;
  private lastDropped?: TraceTick;
  private lastDroppedInput?: TraceInput;
  private lastDroppedMotion?: TraceMotionOnly;
  private readonly keptAt = new Set<number>();
  private readonly seenReadings = new Set<string>();

  public add(tick: TraceTick): void {
    if (tick.world.length === 0 && tick.events.length === 0 && !tick.motion?.length && !tick.objectRan && !tick.witness?.length) return;
    this.newestAddedAt = Math.max(this.newestAddedAt, tick.tMs);

    // decided per world tick now, so the reader rule holds whatever is dropped later
    const form = worldInput(tick) ? this.noteWorld(tick) : 0;
    const forced = tick.configChange !== undefined || tick.cameraMoved === true;
    const empty =
      !forced &&
      tick.world.length === 0 &&
      tick.events.length === 0 &&
      tick.detections.length === 0 &&
      !tick.motion?.length &&
      !tick.attrs?.length &&
      !tick.witness?.length;
    if (empty) {
      if (this.emptyTail > 0) {
        if (tick.tMs - this.lastKeptAt < MOTION_ONLY_INTERVAL_MS) return this.drop(tick, form);
        this.emptyTail--;
        this.keep([tick]);
        return;
      }
      const last = this.pendingEmpty.at(-1);
      if (last && tick.tMs - last.tMs < MOTION_ONLY_INTERVAL_MS) return this.drop(tick, form);
      this.pendingEmpty.push(tick);
      this.pendingForms.push(form);
      if (this.pendingEmpty.length > EMPTY_CONTEXT_TICKS) this.drop(this.pendingEmpty.shift()!, this.pendingForms.shift()!);
      return;
    }

    const changed = forced || tick.events.length > 0 || (tick.created?.length ?? 0) > 0 || (tick.removed?.length ?? 0) > 0 || this.hasNewReading(tick);
    const interval = tick.world.length > 0 ? KEEP_INTERVAL_MS : MOTION_ONLY_INTERVAL_MS;
    if (!changed && tick.tMs - this.lastKeptAt < interval) return this.drop(tick, form);

    this.keep([...this.pendingEmpty, tick]);
    this.pendingEmpty = [];
    this.pendingForms = [];
    this.emptyTail = EMPTY_CONTEXT_TICKS;
  }

  public addReads(reads: TraceFaceRead[]): void {
    for (const read of reads) {
      if (read.frame && read.frame.tMs < this.startMs) continue;
      this.pendingReads.push(read);
    }
  }

  public take(final = false): TraceTick[] | undefined {
    if (final) this.flush();
    for (const at of this.keptAt) if (at < this.newestKeptAt - KEPT_AT_MS) this.keptAt.delete(at);
    if (this.ticks.length === 0) return undefined;
    const ticks = this.ticks;
    this.ticks = [];
    return ticks;
  }

  public reset(startMs = 0): void {
    this.ticks = [];
    this.dropped = [];
    this.motionOnly = [];
    this.lastKeptAt = 0;
    this.newestKeptAt = 0;
    this.newestAddedAt = startMs;
    this.startMs = startMs;
    this.pendingEmpty = [];
    this.pendingForms = [];
    this.emptyTail = 0;
    this.pendingReads = [];
    this.pendingSearch = undefined;
    this.pendingDoubt = [];
    this.lastWin = undefined;
    this.lastWindows = undefined;
    this.context = undefined;
    this.started = false;
    this.startedWorld = false;
    this.forgetDropped();
    this.keptAt.clear();
    this.seenReadings.clear();
  }

  private flush(): void {
    const ticks = this.pendingEmpty;
    this.pendingEmpty = [];
    this.pendingForms = [];
    const last = this.lastDropped;
    if (last && ticks.every((tick) => last.tMs >= tick.tMs) && last.tMs >= this.newestKeptAt) {
      remove(this.dropped, this.lastDroppedInput);
      remove(this.motionOnly, this.lastDroppedMotion);
      // its own search ids and doubts already wait in the pending lists
      delete last.faceSearch;
      delete last.doubt;
      ticks.push(last);
    }
    if (ticks.length > 0) this.keep(ticks);
    const leftover = this.dropped.length > 0 || this.motionOnly.length > 0;
    if (leftover || this.pendingReads.length > 0 || this.pendingSearch || this.pendingDoubt.length > 0) {
      this.keep([{ tMs: this.newestAddedAt + 1, objectRan: false, detections: [], world: [], events: [] }], true);
    }
    this.forgetDropped();
  }

  private keep(ticks: TraceTick[], carrier = false): void {
    this.dropped.sort((a, b) => a.tMs - b.tMs);
    this.motionOnly.sort((a, b) => a.tMs - b.tMs);
    for (const tick of ticks) {
      this.placeTime(tick);
      // inputs can sit after a world tick still in the detector, a time-order replay would feed them late
      if (carrier || worldInput(tick)) {
        const between = takeBefore(this.dropped, tick.tMs);
        if (between.length > 0) tick.between = between;
      }
      const motionOnly = takeBefore(this.motionOnly, tick.tMs);
      if (motionOnly.length > 0) tick.motionOnly = motionOnly;
      this.writeStart(tick);
      this.ticks.push(tick);
      this.newestKeptAt = Math.max(this.newestKeptAt, tick.tMs);
    }
    const newest = ticks[ticks.length - 1];
    this.attachPending(newest);
    this.lastKeptAt = newest.tMs;
  }

  private drop(tick: TraceTick, form: number): void {
    let input: TraceInput | undefined;
    let motion: TraceMotionOnly | undefined;
    if (worldInput(tick)) {
      input = traceInput(tick, form);
      this.dropped.push(input);
    } else if (tick.motion?.length) {
      motion = tick.external ? { tMs: tick.tMs, motion: tick.motion, external: true } : { tMs: tick.tMs, motion: tick.motion };
      this.motionOnly.push(motion);
    }
    if (tick.faceSearch?.length) {
      this.pendingSearch ??= new Set();
      for (const id of tick.faceSearch) this.pendingSearch.add(id);
    }
    if (tick.doubt?.length) this.pendingDoubt.push(...tick.doubt);
    if (this.lastDropped && tick.tMs < this.lastDropped.tMs) return;
    this.lastDropped = tick;
    this.lastDroppedInput = input;
    this.lastDroppedMotion = motion;
  }

  private forgetDropped(): void {
    this.lastDropped = undefined;
    this.lastDroppedInput = undefined;
    this.lastDroppedMotion = undefined;
  }

  private noteWorld(tick: TraceTick): number {
    this.context ??= tick[TRACE_CONTEXT];
    let form = 0;
    if (tick.win !== this.lastWin) form |= WIN_CHANGED;
    this.lastWin = tick.win;
    if (tick.windows && !sameBoxes(tick.windows, this.lastWindows)) {
      form |= WINDOWS_CHANGED;
      this.lastWindows = tick.windows;
    }
    return form;
  }

  private placeTime(tick: TraceTick): void {
    if (!this.keptAt.has(tick.tMs)) {
      this.keptAt.add(tick.tMs);
      return;
    }
    if (!worldInput(tick)) {
      this.shiftTime(tick);
      return;
    }
    // a shipped tick cannot move any more, the store then keeps the world tick written after it
    const other = this.ticks.find((kept) => kept.tMs === tick.tMs && !worldInput(kept));
    if (other) this.shiftTime(other);
  }

  private shiftTime(tick: TraceTick): void {
    while (this.keptAt.has(tick.tMs)) tick.tMs++;
    this.keptAt.add(tick.tMs);
  }

  private writeStart(tick: TraceTick): void {
    const context = this.context;
    const world = context !== undefined && (worldInput(tick) || tick.between !== undefined);
    if (this.started && (this.startedWorld || !world)) return;
    const start: TraceStart = { format: 2 };
    if (WORLD_VERSION) start.world = WORLD_VERSION;
    if (SERVER_VERSION) start.server = SERVER_VERSION;
    if (world) {
      start.config = context.config;
      if (context.attestations.length > 0) start.attestations = context.attestations;
      if (context.sinceIngestMs !== undefined) start.sinceIngestMs = context.sinceIngestMs;
      this.startedWorld = true;
    }
    tick.start = start;
    this.started = true;
  }

  private attachPending(tick: TraceTick): void {
    if (this.pendingReads.length > 0) {
      tick.reads = tick.reads ? [...tick.reads, ...this.pendingReads] : this.pendingReads;
      this.pendingReads = [];
    }
    if (this.pendingSearch) {
      for (const id of tick.faceSearch ?? []) this.pendingSearch.add(id);
      tick.faceSearch = [...this.pendingSearch];
      this.pendingSearch = undefined;
    }
    if (this.pendingDoubt.length > 0) {
      tick.doubt = [...this.pendingDoubt, ...(tick.doubt ?? [])];
      this.pendingDoubt = [];
    }
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
