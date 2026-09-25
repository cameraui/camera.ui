import type { BoundingBox, Detection } from '@camera.ui/sdk';
import type { CroppedRegion, ServerFaceDetection } from '../../rpc/interfaces/detection.js';
import type { TrackedFaceDetection } from './event-manager.js';

const MIN_FACE_PX = 40;
const EMBED_EVERY_MS = 1_000;
const VOTES_FOR_NAME = 2;
const NAMED_SHARE = 0.6;
const ALL_SHARE = 0.3;
const FAST_VECTORS = 3;
const RECHECK_EVERY_MS = 10_000;
const VECTORS_PER_TRACK = 10;
const FACE_TRACKS_MAX = 256;
const FACE_TRACK_IDLE_MS = 60_000;
const UNTRACKED_IDLE_MS = 5_000;
const UNTRACKED_GRID = 8;

interface FaceTrack {
  attemptAt: number;
  seen: number;
  vectors: number;
  votes: Map<string, number>;
  identity?: string;
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
    if (seen.vectors >= VECTORS_PER_TRACK) return false;
    const fast = !seen.identity && seen.vectors < FAST_VECTORS;
    return now - seen.attemptAt >= (fast ? EMBED_EVERY_MS : RECHECK_EVERY_MS);
  }

  public markAttempt(face: ServerFaceDetection, now = Date.now()): void {
    const key = this.key(face);
    const seen = this.tracks.get(key);
    this.tracks.set(key, seen ? { ...seen, attemptAt: now, seen: now } : { attemptAt: now, seen: now, vectors: 0, votes: new Map() });

    if (this.tracks.size <= FACE_TRACKS_MAX) return;
    for (const [id, track] of this.tracks) {
      if (now - track.seen > FACE_TRACK_IDLE_MS) this.tracks.delete(id);
    }
  }

  public markVector(face: ServerFaceDetection): string | undefined {
    const seen = this.tracks.get(this.key(face));
    if (!seen) return undefined;
    seen.vectors++;
    if (face.identity) seen.votes.set(face.identity, (seen.votes.get(face.identity) ?? 0) + 1);
    seen.identity = decide(seen);
    return seen.identity;
  }

  public carry(faces: ServerFaceDetection[], now = Date.now()): void {
    for (const face of faces) {
      if ((face as TrackedFaceDetection).parentTrackId === undefined) continue;
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

function decide(track: FaceTrack): string | undefined {
  let best: string | undefined;
  let bestVotes = 0;
  let named = 0;
  for (const [name, votes] of track.votes) {
    named += votes;
    if (votes > bestVotes) {
      best = name;
      bestVotes = votes;
    }
  }
  if (bestVotes < VOTES_FOR_NAME || bestVotes < NAMED_SHARE * named || bestVotes < ALL_SHARE * track.vectors) return undefined;
  return best;
}
