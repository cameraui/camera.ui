import { iou } from './detection-window.js';

import type { BoundingBox, Detection } from '@camera.ui/sdk';
import type { CroppedRegion, ServerFaceDetection } from '../../rpc/interfaces/detection.js';
import type { TrackedFaceDetection } from './event-manager.js';
import type { FaceLabelSource, TraceDoubt } from './event-trace.js';

type Pace = 'recheck' | 'undecided' | 'backoff' | 'fast';
type ReadTrigger = 'fill' | 'better' | 'doubt' | 'again' | 'two';
type DoubtCause = 'two' | 'woke' | 'far' | 'recovered' | 'reassociated' | 'cross' | 'contra';

const MIN_FACE_PX = 40;
const FAST_READS = 10;
const EMPTY_BACKOFF = 6;
const BACKOFF_EVERY_MS = 1_000;
const UNDECIDED_EVERY_MS = 5_000;
const RECHECK_EVERY_MS = 10_000;
const WINDOW = 20;
const VOTES_FOR_NAME = 3;
const NAMED_SHARE = 0.6;
const ALL_SHARE = 0.3;
const FACE_TRACKS_MAX = 256;
const FACE_TRACK_IDLE_MS = 60_000;
const UNTRACKED_IDLE_MS = 5_000;
const UNTRACKED_GRID = 8;
const HEAD_BAND = 2;
const HEAD_DEPTH = 1;
const HEAD_DEPTH_SPREAD = 0.56;
const HEAD_ACROSS = 0.52;
const HEAD_ACROSS_SPREAD = 0.31;
const HEAD_TIE = 0.5;
const BETTER_SIZE = 1.25;
const BETTER_CONF = 0.05;
const BETTER_CONF_SIZE = 0.9;
const EMPTY_SIZE = 1.15;
const EMPTY_CONF = 0.03;
const CROSS_IOU = 0.3;
const SHARED_SPOTS = 4;
const PACE_MS: Record<Pace, number> = { recheck: RECHECK_EVERY_MS, undecided: UNDECIDED_EVERY_MS, backoff: BACKOFF_EVERY_MS, fast: 0 };

export const FACE_NOTE = Symbol('faceNote');

export interface FaceView {
  px: number;
  conf: number;
  cx: number;
  cy: number;
}

export interface FaceSpot {
  x: number;
  y: number;
  turn: number;
  best?: FaceView;
  bar?: FaceView;
  barFailed?: boolean;
}

export interface FaceAttempt {
  at: number;
  view: FaceView;
  epoch: number;
  name?: string;
  spot?: FaceSpot;
}

interface Vote {
  name?: string;
  px: number;
}

interface FaceTrack {
  attempt: FaceAttempt;
  readAt?: number;
  seen: number;
  reading: boolean;
  empty: number;
  reads: Vote[];
  identity?: string;
  epoch: number;
  doubt?: DoubtCause;
  doubtAt?: number;
  again?: boolean;
  best?: FaceView;
  bar?: FaceView;
  barFailed?: boolean;
  spots: FaceSpot[];
}

interface BoxSpot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceWorld {
  events: { id: number; kind: string; far?: boolean }[];
  persons: { id: number; box: BoundingBox; active: boolean }[];
  reassociated?: number[];
}

export interface FaceOutcome {
  name?: string;
  epoch?: number;
}

export interface FaceTally {
  leader?: string;
  votes: number;
  reads: number;
}

export interface FaceNote {
  key: string;
  source?: FaceLabelSource;
  age?: number;
  epoch?: number;
  shared?: number;
}

interface Noted {
  [FACE_NOTE]?: FaceNote;
}

export class FaceTrackNames {
  private readonly tracks = new Map<string, FaceTrack>();
  private overlaps = new Set<string>();
  private doubts: TraceDoubt[] = [];
  private turn = 0;

  public wantsVector(face: ServerFaceDetection, frame: { width: number; height: number }, now = Date.now()): Pace | 'new' | undefined {
    const seen = this.held(this.key(face), now);
    if (facePx(face, frame) < MIN_FACE_PX) return undefined;
    if (!seen) return 'new';

    seen.seen = now;
    if (seen.reading) return undefined;
    const trigger = pace(seen);
    return now - seen.attempt.at >= PACE_MS[trigger] ? trigger : undefined;
  }

  public wantsRead(face: ServerFaceDetection, frame: { width: number; height: number }, now = Date.now()): ReadTrigger | undefined {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    const view = faceView(face, frame);
    if (view.px < MIN_FACE_PX) return undefined;
    if (!seen) return key.startsWith('s') ? 'two' : 'fill';

    // a box shared again after a while can hold someone else where a face was read
    if (key.startsWith('s') && now - seen.seen > UNTRACKED_IDLE_MS) seen.spots = [];
    seen.seen = now;
    if (seen.reading) return undefined;
    if (key.startsWith('s')) {
      const spot = spotOf(seen, boxSpot(face));
      if (spot?.bar && !beats(view, spot.bar, frame)) return undefined;
      return !spot?.best || better(view, spot.best) ? 'two' : undefined;
    }
    const barred = seen.bar !== undefined && !beats(view, seen.bar, frame);
    // a matcher that is down holds back doubt reads too
    if (barred && seen.barFailed) return undefined;
    if (seen.doubt) return 'doubt';
    if (barred) return undefined;
    if (seen.reads.length < WINDOW) return 'fill';
    if (seen.again) return 'again';
    return !seen.best || better(view, seen.best) ? 'better' : undefined;
  }

  public markAttempt(face: ServerFaceDetection, frame: { width: number; height: number }, now = Date.now()): FaceAttempt {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    const attempt: FaceAttempt = { at: now, view: faceView(face, frame), epoch: seen?.epoch ?? 0, name: seen?.identity };
    const track = seen ?? { attempt, seen: now, reading: true, empty: 0, reads: [], epoch: 0, spots: [] };
    track.attempt = attempt;
    track.seen = now;
    track.reading = true;
    track.again = false;
    if (key.startsWith('s')) attempt.spot = markSpot(track, face, ++this.turn);
    this.tracks.set(key, track);

    if (this.tracks.size <= FACE_TRACKS_MAX) return attempt;
    for (const [id, entry] of this.tracks) {
      if (now - entry.seen > FACE_TRACK_IDLE_MS) this.tracks.delete(id);
    }
    return attempt;
  }

  public markEmpty(face: ServerFaceDetection, attempt: FaceAttempt): void {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    if (seen && land(seen, attempt)) markNoRead(seen, key, attempt, false);
  }

  public markFailed(face: ServerFaceDetection, attempt: FaceAttempt): FaceOutcome {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    if (!seen) return {};
    if (land(seen, attempt)) markNoRead(seen, key, attempt, true);
    return key.startsWith('t') ? epochName(seen, attempt) : {};
  }

  public markSettled(face: ServerFaceDetection, attempt: FaceAttempt): void {
    const seen = this.tracks.get(this.key(face));
    if (seen) land(seen, attempt);
  }

  public markVector(face: ServerFaceDetection, attempt: FaceAttempt, trigger?: string, now = Date.now()): FaceOutcome {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    if (!seen) return {};
    // a read the queue gave up on can land late, it then reaches the event only
    if (!land(seen, attempt)) return key.startsWith('t') ? epochName(seen, attempt) : {};
    if (key.startsWith('s')) {
      // the matcher answers again, a spot it left unanswered is read again
      for (const spot of seen.spots) if (spot.barFailed) spot.bar = undefined;
      const spot = attempt.spot;
      if (spot) {
        spot.bar = undefined;
        if (!spot.best || better(attempt.view, spot.best)) spot.best = attempt.view;
      }
      return {};
    }
    seen.readAt = attempt.at;
    const own = face.identity;
    const view = attempt.view;
    const px = view.px;

    if (key.startsWith('u')) {
      seen.empty = 0;
      vote(seen, { name: own, px });
      seen.identity = decide(seen.reads);
      return { name: seen.identity };
    }

    seen.bar = undefined;
    if (!seen.best || better(view, seen.best)) seen.best = view;
    const contra = own !== undefined && seen.identity !== undefined && own !== seen.identity;
    const settles = seen.doubt !== undefined && own !== undefined && attempt.at >= (seen.doubtAt ?? 0);
    if (settles && contra) {
      newEpoch(seen);
      seen.best = view;
    } else if (settles) {
      seen.doubt = undefined;
    } else if (!seen.doubt && contra) {
      this.startDoubt(Number(key.slice(1)), 'contra', now);
    } else if (!seen.doubt && trigger === 'better' && !seen.identity && own) {
      // a closer face that matches outvotes the far ones
      seen.reads = seen.reads.filter((entry) => entry.px >= px / BETTER_SIZE);
    }
    vote(seen, { name: own, px });
    if (!seen.doubt) seen.identity = decide(seen.reads);
    return { name: seen.identity, epoch: seen.epoch };
  }

  public tally(face: ServerFaceDetection): FaceTally {
    const reads = this.tracks.get(this.key(face))?.reads ?? [];
    const { leader, votes } = count(reads);
    return { leader, votes, reads: reads.length };
  }

  public carry(faces: ServerFaceDetection[], now = Date.now()): void {
    for (const face of faces) {
      if (!votesOnReads(face)) continue;
      const key = this.key(face);
      const seen = this.held(key, now);
      if (!seen) continue;
      // only a face big enough to read keeps a cell alive
      if (!key.startsWith('u')) seen.seen = now;
      const note: FaceNote = { key };
      if (key.startsWith('t')) {
        face.identity = seen.doubt ? undefined : seen.identity;
        if (face.identity) note.source = 'track';
        note.epoch = seen.epoch;
      }
      if (seen.readAt !== undefined) note.age = now - seen.readAt;
      setFaceNote(face, note);
    }
  }

  public groupFaces(faces: TrackedFaceDetection[], now = Date.now()): void {
    const byTrack = new Map<number, TrackedFaceDetection[]>();
    for (const face of faces) {
      if (face.parentTrackId === undefined) continue;
      const own = byTrack.get(face.parentTrackId);
      if (own) own.push(face);
      else byTrack.set(face.parentTrackId, [face]);
    }

    for (const [id, own] of byTrack) {
      if (own.length < 2) continue;
      // two people under one box: neither face may borrow the track's name
      if (sharedBox(own)) {
        this.startDoubt(id, 'two', now);
        for (const face of own) {
          face.parentTrackId = undefined;
          setFaceNote(face, { key: `s${id}`, shared: id });
        }
        continue;
      }
      let head = own[0];
      for (const face of own) if (centreY(face.box) < centreY(head.box)) head = face;
      for (const face of own) {
        if (face === head) continue;
        face.parentTrackId = undefined;
        face.parentBox = undefined;
      }
    }
  }

  public noteWorld({ events, persons, reassociated = [] }: FaceWorld, ptzEnded: boolean, now = Date.now()): void {
    for (const { id, kind, far } of events) {
      if (kind === 'objectWoke' || kind === 'objectRecovered') this.lookAgain(id, kind === 'objectRecovered' ? 'recovered' : far ? 'far' : 'woke', now);
    }
    // matched back by place alone, with two people in one place that can be the other one
    for (const id of reassociated) this.lookAgain(id, 'reassociated', now);

    const overlaps = new Set<string>();
    for (let i = 0; i < persons.length; i++) {
      for (let j = i + 1; j < persons.length; j++) {
        const a = persons[i];
        const b = persons[j];
        if (iou(a.box, b.box) < CROSS_IOU) continue;
        const pair = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        overlaps.add(pair);
        // the pan moved every box, so the overlaps after it are the new normal
        if (ptzEnded || this.overlaps.has(pair) || (!a.active && !b.active)) continue;
        this.startDoubt(a.id, 'cross', now);
        this.startDoubt(b.id, 'cross', now);
      }
    }
    this.overlaps = overlaps;
  }

  public turns<T extends ServerFaceDetection>(faces: T[]): T[] {
    const order = faces.map((face) => ({ face, turn: spotOf(this.tracks.get(this.key(face)), boxSpot(face))?.turn ?? 0 }));
    return order.sort((a, b) => a.turn - b.turn).map(({ face }) => face);
  }

  public reopen(): void {
    for (const [key, track] of this.tracks) {
      if (key.startsWith('t')) clearEpoch(track);
      else if (key.startsWith('s')) track.spots = [];
    }
  }

  public forget(name: string): void {
    for (const track of this.tracks.values()) {
      const reads = track.reads.filter((entry) => entry.name !== name);
      // the votes for the deleted name can be what kept another name under the shares
      if (track.identity === name || (!track.identity && reads.length < track.reads.length)) clearEpoch(track);
      else track.reads = reads;
    }
  }

  public takeDoubts(): TraceDoubt[] {
    const doubts = this.doubts;
    this.doubts = [];
    return doubts;
  }

  public forgetUntracked(): void {
    for (const key of this.tracks.keys()) {
      if (!key.startsWith('t')) this.tracks.delete(key);
    }
  }

  public key(face: ServerFaceDetection): string {
    const trackId = (face as TrackedFaceDetection).parentTrackId;
    if (trackId !== undefined) return `t${trackId}`;
    const shared = faceNote(face)?.shared;
    if (shared !== undefined) return `s${shared}`;
    const cellX = Math.floor((face.box.x + face.box.width / 2) * UNTRACKED_GRID);
    const cellY = Math.floor((face.box.y + face.box.height / 2) * UNTRACKED_GRID);
    return `u${cellX}:${cellY}`;
  }

  private held(key: string, now: number): FaceTrack | undefined {
    const seen = this.tracks.get(key);
    if (!seen || !key.startsWith('u') || now - seen.seen <= UNTRACKED_IDLE_MS) return seen;
    this.tracks.delete(key);
    return undefined;
  }

  private lookAgain(id: number, cause: DoubtCause, now: number): void {
    const shared = this.tracks.get(`s${id}`);
    if (shared) shared.spots = [];
    const seen = this.tracks.get(`t${id}`);
    if (!seen) return;
    seen.bar = undefined;
    // an unnamed track has no name to doubt, one fresh read stands in for it
    if (!seen.identity) seen.again = true;
    this.startDoubt(id, cause, now);
  }

  private startDoubt(id: number, cause: DoubtCause, now: number): void {
    const seen = this.tracks.get(`t${id}`);
    if (!seen?.identity) return;
    if (seen.doubt) {
      seen.doubtAt = now;
      return;
    }
    seen.doubt = cause;
    seen.doubtAt = now;
    this.doubts.push({ id, cause, tMs: now });
  }
}

export function votesOnReads(face: ServerFaceDetection): boolean {
  const tracked = face as TrackedFaceDetection;
  return tracked.parentTrackId !== undefined || tracked.parentBox === undefined;
}

export function facePx(face: ServerFaceDetection, frame: { width: number; height: number }): number {
  return Math.min(face.box.width * frame.width, face.box.height * frame.height);
}

export function faceNote(face: object): FaceNote | undefined {
  return (face as Noted)[FACE_NOTE];
}

export function setFaceNote(face: object, note: FaceNote): void {
  (face as Noted)[FACE_NOTE] = note;
}

export function faceParent(face: BoundingBox, regions: CroppedRegion[], cropIndex: number): Detection | undefined {
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

export function stillOwner(face: BoundingBox, persons: Detection[]): Detection | undefined {
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  let best: Detection | undefined;
  let bestFit = Infinity;
  let secondFit = Infinity;
  for (const person of persons) {
    const box = person.box;
    const depth = (cy - box.y) / face.height;
    if (cx < box.x || cx > box.x + box.width || depth < 0 || depth > HEAD_BAND) continue;
    const fit = Math.hypot(((cx - box.x) / box.width - HEAD_ACROSS) / HEAD_ACROSS_SPREAD, (depth - HEAD_DEPTH) / HEAD_DEPTH_SPREAD);
    if (fit < bestFit) {
      secondFit = bestFit;
      bestFit = fit;
      best = person;
    } else if (fit < secondFit) {
      secondFit = fit;
    }
  }
  return secondFit - bestFit < HEAD_TIE ? undefined : best;
}

function centreY(box: BoundingBox): number {
  return box.y + box.height / 2;
}

function sharedBox(faces: TrackedFaceDetection[]): boolean {
  const inside = faces.filter(({ box, parentBox }) => {
    if (!parentBox) return false;
    const cx = box.x + box.width / 2;
    const cy = centreY(box);
    return cx >= parentBox.x && cx <= parentBox.x + parentBox.width && cy >= parentBox.y && cy <= parentBox.y + parentBox.height;
  });
  return inside.some((a, i) => inside.slice(i + 1).some((b) => iou(a.box, b.box) === 0));
}

function faceView(face: ServerFaceDetection, frame: { width: number; height: number }): FaceView {
  return { px: facePx(face, frame), conf: face.confidence, cx: face.box.x + face.box.width / 2, cy: centreY(face.box) };
}

function better(view: FaceView, best: FaceView): boolean {
  return view.px >= best.px * BETTER_SIZE || (view.px >= BETTER_CONF_SIZE * best.px && view.conf >= best.conf + BETTER_CONF);
}

function beats(view: FaceView, bar: FaceView, frame: { width: number; height: number }): boolean {
  if (view.px >= bar.px * EMPTY_SIZE || view.conf >= bar.conf + EMPTY_CONF) return true;
  return Math.hypot((view.cx - bar.cx) * frame.width, (view.cy - bar.cy) * frame.height) > view.px;
}

function land(track: FaceTrack, attempt: FaceAttempt): boolean {
  if (track.attempt !== attempt) return false;
  track.reading = false;
  return true;
}

function epochName(track: FaceTrack, attempt: FaceAttempt): FaceOutcome {
  if (attempt.epoch === track.epoch) return { name: track.identity, epoch: track.epoch };
  return { name: attempt.name, epoch: attempt.epoch };
}

function markNoRead(track: FaceTrack, key: string, attempt: FaceAttempt, failed: boolean): void {
  if (key.startsWith('u')) {
    track.empty++;
  } else if (key.startsWith('t')) {
    track.bar = attempt.view;
    track.barFailed = failed;
  } else if (attempt.spot) {
    attempt.spot.bar = attempt.view;
    attempt.spot.barFailed = failed;
  }
}

function boxSpot(face: ServerFaceDetection): BoxSpot | undefined {
  const box = (face as TrackedFaceDetection).parentBox;
  if (!box) return undefined;
  return {
    x: (face.box.x + face.box.width / 2 - box.x) / box.width,
    y: (centreY(face.box) - box.y) / box.height,
    w: face.box.width / box.width,
    h: face.box.height / box.height,
  };
}

function spotOf(track: FaceTrack | undefined, at: BoxSpot | undefined): FaceSpot | undefined {
  if (!at) return undefined;
  return track?.spots.find((spot) => Math.abs(spot.x - at.x) < at.w / 2 && Math.abs(spot.y - at.y) < at.h / 2);
}

function markSpot(track: FaceTrack, face: ServerFaceDetection, turn: number): FaceSpot | undefined {
  const at = boxSpot(face);
  if (!at) return undefined;
  const old = spotOf(track, at);
  const spot: FaceSpot = { ...old, x: at.x, y: at.y, turn };
  track.spots = [...track.spots.filter((entry) => entry !== old), spot].slice(-SHARED_SPOTS);
  return spot;
}

function vote(track: FaceTrack, entry: Vote): void {
  track.reads.push(entry);
  if (track.reads.length > WINDOW) track.reads.shift();
}

function clearEpoch(track: FaceTrack): void {
  track.reads = [];
  track.identity = undefined;
  track.doubt = undefined;
  track.doubtAt = undefined;
  track.best = undefined;
  track.bar = undefined;
}

function newEpoch(track: FaceTrack): void {
  clearEpoch(track);
  track.epoch++;
}

function pace(track: FaceTrack): Pace {
  if (track.identity) return 'recheck';
  if (track.reads.length >= FAST_READS) return 'undecided';
  return track.empty >= EMPTY_BACKOFF ? 'backoff' : 'fast';
}

function count(reads: Vote[]): { leader?: string; votes: number; named: number } {
  const votes = new Map<string, number>();
  let named = 0;
  let leader: string | undefined;
  let best = 0;
  for (const { name } of reads) {
    if (!name) continue;
    named++;
    const next = (votes.get(name) ?? 0) + 1;
    votes.set(name, next);
    if (next > best) {
      leader = name;
      best = next;
    }
  }
  return { leader, votes: best, named };
}

function decide(reads: Vote[]): string | undefined {
  const { leader, votes, named } = count(reads);
  if (votes < VOTES_FOR_NAME || votes < NAMED_SHARE * named || votes < ALL_SHARE * reads.length) return undefined;
  return leader;
}
