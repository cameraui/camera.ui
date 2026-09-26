import type { BoundingBox, Detection } from '@camera.ui/sdk';
import type { CroppedRegion, ServerFaceDetection } from '../../rpc/interfaces/detection.js';
import type { TrackedFaceDetection } from './event-manager.js';

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

interface FaceTrack {
  attemptAt: number;
  seen: number;
  reading: boolean;
  empty: number;
  reads: (string | undefined)[];
  identity?: string;
}

// the vote behind a face's name after its latest read
export interface FaceTally {
  leader?: string;
  votes: number;
  reads: number;
}

export class FaceTrackNames {
  private readonly tracks = new Map<string, FaceTrack>();

  public wantsVector(face: ServerFaceDetection, frame: { width: number; height: number }, now = Date.now()): boolean {
    const shortest = Math.min(face.box.width * frame.width, face.box.height * frame.height);
    if (shortest < MIN_FACE_PX) return false;

    const key = this.key(face);
    const seen = this.tracks.get(key);
    if (!seen || (key.startsWith('u') && now - seen.seen > UNTRACKED_IDLE_MS)) {
      this.tracks.delete(key);
      return true;
    }
    seen.seen = now;
    if (seen.reading) return false;
    return now - seen.attemptAt >= pace(seen);
  }

  public markAttempt(face: ServerFaceDetection, now = Date.now()): void {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    if (seen) {
      seen.attemptAt = now;
      seen.seen = now;
      seen.reading = true;
    } else {
      this.tracks.set(key, { attemptAt: now, seen: now, reading: true, empty: 0, reads: [] });
    }

    if (this.tracks.size <= FACE_TRACKS_MAX) return;
    for (const [id, track] of this.tracks) {
      if (now - track.seen > FACE_TRACK_IDLE_MS) this.tracks.delete(id);
    }
  }

  public markEmpty(face: ServerFaceDetection): void {
    const seen = this.tracks.get(this.key(face));
    if (!seen) return;
    seen.reading = false;
    seen.empty++;
  }

  public markSettled(face: ServerFaceDetection): void {
    const seen = this.tracks.get(this.key(face));
    if (seen) seen.reading = false;
  }

  public markVector(face: ServerFaceDetection): string | undefined {
    const seen = this.tracks.get(this.key(face));
    if (!seen) return undefined;
    seen.reading = false;
    seen.empty = 0;
    seen.reads.push(face.identity);
    if (seen.reads.length > WINDOW) seen.reads.shift();
    seen.identity = decide(seen.reads);
    return seen.identity;
  }

  public tally(face: ServerFaceDetection): FaceTally {
    const reads = this.tracks.get(this.key(face))?.reads ?? [];
    const { leader, votes } = count(reads);
    return { leader, votes, reads: reads.length };
  }

  public carry(faces: ServerFaceDetection[], now = Date.now()): void {
    for (const face of faces) {
      if (!votesOnReads(face)) continue;
      const seen = this.tracks.get(this.key(face));
      if (!seen) continue;
      seen.seen = now;
      face.identity = seen.identity;
    }
  }

  public key(face: ServerFaceDetection): string {
    const trackId = (face as TrackedFaceDetection).parentTrackId;
    if (trackId !== undefined) return `t${trackId}`;
    const cellX = Math.floor((face.box.x + face.box.width / 2) * UNTRACKED_GRID);
    const cellY = Math.floor((face.box.y + face.box.height / 2) * UNTRACKED_GRID);
    return `u${cellX}:${cellY}`;
  }
}

export function votesOnReads(face: ServerFaceDetection): boolean {
  const tracked = face as TrackedFaceDetection;
  return tracked.parentTrackId !== undefined || tracked.parentBox === undefined;
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

export function keepOneFacePerTrack(faces: TrackedFaceDetection[]): void {
  const heads = new Map<number, TrackedFaceDetection>();
  for (const face of faces) {
    if (face.parentTrackId === undefined) continue;
    const head = heads.get(face.parentTrackId);
    if (!head || centreY(face.box) < centreY(head.box)) heads.set(face.parentTrackId, face);
  }
  for (const face of faces) {
    if (face.parentTrackId === undefined || heads.get(face.parentTrackId) === face) continue;
    face.parentTrackId = undefined;
    face.parentBox = undefined;
  }
}

function centreY(box: BoundingBox): number {
  return box.y + box.height / 2;
}

function pace(track: FaceTrack): number {
  if (track.identity) return RECHECK_EVERY_MS;
  if (track.reads.length >= FAST_READS) return UNDECIDED_EVERY_MS;
  return track.empty >= EMPTY_BACKOFF ? BACKOFF_EVERY_MS : 0;
}

function count(reads: (string | undefined)[]): { leader?: string; votes: number; named: number } {
  const votes = new Map<string, number>();
  let named = 0;
  let leader: string | undefined;
  let best = 0;
  for (const name of reads) {
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

function decide(reads: (string | undefined)[]): string | undefined {
  const { leader, votes, named } = count(reads);
  if (votes < VOTES_FOR_NAME || votes < NAMED_SHARE * named || votes < ALL_SHARE * reads.length) return undefined;
  return leader;
}
