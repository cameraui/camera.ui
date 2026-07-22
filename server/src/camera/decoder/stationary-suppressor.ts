import { boxIou } from '@camera.ui/rust-postprocessor';

import type { Logger } from '@camera.ui/common/logger';
import type { BoundingBox, Detection, TrackedDetection } from '@camera.ui/sdk';

// parked bike ~0.0006, standing person ~0.003-0.03
export const STATIONARY_SPEED_THRESHOLD = 0.002;
export const ANCHOR_SIGHTINGS = 10;
export const WAKE_IOU = 0.6;
export const DEPART_IOU = 0.15;
export const WAKE_SIGHTINGS = 3;

const MAX_ANCHORS = 25;
const MAX_CANDIDATES = 25;
const ANCHOR_DRIFT_ALPHA = 0.1;

interface StationaryAnchor {
  box: BoundingBox;
  label: string;
  sealed: boolean;
  ghost: boolean;
  dormant: boolean;
  wakeMisses: number;
  settleSightings: number;
}

interface CandidateAnchor {
  box: BoundingBox;
  label: string;
  sightings: number;
  ghost: boolean;
}

export class StationarySuppressor {
  private readonly anchors = new Map<number, StationaryAnchor>();
  private readonly candidates: CandidateAnchor[] = [];
  private suppressionLogged = false;

  constructor(private readonly logger: Logger) {}

  public evaluate(detections: TrackedDetection[]): boolean {
    let hasActiveTrack = false;
    for (const t of detections) {
      if (t.trackLost) continue;
      if (this.evaluateTrack(t)) hasActiveTrack = true;
    }
    return hasActiveTrack;
  }

  public isAnchored(trackId: number): boolean {
    return this.anchors.has(trackId);
  }

  public isSealed(trackId: number | undefined): boolean {
    if (trackId === undefined) return false;
    const anchor = this.anchors.get(trackId);
    return anchor ? anchor.sealed && !anchor.dormant : false;
  }

  public excludeSealed<T extends Detection>(detections: T[]): T[] {
    return detections.filter((d) => !this.isSealed((d as Partial<TrackedDetection>).trackId));
  }

  public logSuppressedOnce(detections: TrackedDetection[]): void {
    if (this.suppressionLogged) return;
    this.suppressionLogged = true;
    const parked = detections
      .filter((t) => !t.trackLost && t.trackId !== undefined)
      .map((t) => `${t.label}#${t.trackId}`)
      .join(', ');
    this.logger.trace(`Object detection suppressed — only known-stationary object(s) in view: ${parked}`);
  }

  public retainAcrossEvent(retainTracks: (trackIds: number[]) => number[]): void {
    const survivors = new Set(retainTracks([...this.anchors.keys()]));

    for (const [id, anchor] of [...this.anchors.entries()]) {
      if (survivors.has(id)) {
        anchor.ghost = false;
        anchor.sealed = true;
      } else if (anchor.ghost) {
        this.anchors.delete(id);
      } else {
        anchor.ghost = true;
        anchor.sealed = true;
      }
    }

    for (let i = this.candidates.length - 1; i >= 0; i--) {
      const candidate = this.candidates[i];
      if (candidate.ghost) {
        this.candidates.splice(i, 1);
      } else {
        candidate.ghost = true;
      }
    }

    while (this.anchors.size > MAX_ANCHORS) {
      const oldest = this.anchors.keys().next().value;
      if (oldest === undefined) break;
      this.anchors.delete(oldest);
    }

    if (this.anchors.size > 0) {
      const kept = [...this.anchors.entries()].map(([id, a]) => `${a.label}#${id}${a.ghost ? ' (ghost)' : ''}`).join(', ');
      this.logger.trace(`Static suppression: keeping ${this.anchors.size} anchor(s) across event end: ${kept}`);
    }
  }

  public clear(): void {
    this.anchors.clear();
    this.candidates.length = 0;
  }

  public dropForCameraMove(): void {
    if (this.anchors.size > 0) {
      this.logger.trace(`Static suppression: dropping ${this.anchors.size} anchor(s), camera moved`);
    }
    this.anchors.clear();
    this.candidates.length = 0;
  }

  public resetEventState(): void {
    this.suppressionLogged = false;
  }

  private evaluateTrack(t: TrackedDetection): boolean {
    // no trackId = external smart-camera write, nothing to judge stationarity by
    if (t.trackId === undefined) return true;

    const anchor = this.anchors.get(t.trackId);
    if (anchor) {
      return anchor.dormant ? this.evaluateDormant(t, anchor) : this.evaluateAnchored(t, anchor);
    }

    const candidate = this.matchCandidate(t);

    if ((t.trackSpeed ?? 0) < STATIONARY_SPEED_THRESHOLD) {
      if (this.adoptAnchor(t)) {
        if (candidate) this.candidates.splice(this.candidates.indexOf(candidate), 1);
        return false;
      }

      if (candidate) {
        candidate.box = t.box;
        candidate.ghost = false;
        candidate.sightings += 1;
        if (candidate.sightings >= ANCHOR_SIGHTINGS) {
          this.candidates.splice(this.candidates.indexOf(candidate), 1);
          this.anchors.set(t.trackId, { box: t.box, label: t.label, sealed: false, ghost: false, dormant: false, wakeMisses: 0, settleSightings: 0 });
        }
      } else if (this.candidates.length < MAX_CANDIDATES) {
        this.candidates.push({ box: t.box, label: t.label, sightings: 1, ghost: false });
      }
    } else if (candidate) {
      // erode instead of reset: a single noisy speed frame must not wipe the
      // warm-up of a genuinely parked object
      candidate.sightings -= 1;
      if (candidate.sightings <= 0) {
        this.candidates.splice(this.candidates.indexOf(candidate), 1);
      }
    }
    return true;
  }

  private matchCandidate(t: TrackedDetection): CandidateAnchor | undefined {
    let best: CandidateAnchor | undefined;
    let bestIou = WAKE_IOU;
    for (const candidate of this.candidates) {
      if (candidate.label !== t.label) continue;
      const iou = boxIou(candidate.box, t.box);
      if (iou >= bestIou) {
        best = candidate;
        bestIou = iou;
      }
    }
    return best;
  }

  private evaluateAnchored(t: TrackedDetection, anchor: StationaryAnchor): boolean {
    const iou = boxIou(anchor.box, t.box);

    if (iou < DEPART_IOU) {
      anchor.wakeMisses += 1;
      if (anchor.wakeMisses >= WAKE_SIGHTINGS) {
        anchor.dormant = true;
        anchor.wakeMisses = 0;
        anchor.settleSightings = 0;
        this.logger.trace(`Static suppression: ${t.label}#${t.trackId} left its anchor — counting as active again`);
        return true;
      }
    } else if (iou >= WAKE_IOU) {
      anchor.wakeMisses = 0;
      if ((t.trackSpeed ?? 0) < STATIONARY_SPEED_THRESHOLD) {
        anchor.box = {
          x: anchor.box.x + (t.box.x - anchor.box.x) * ANCHOR_DRIFT_ALPHA,
          y: anchor.box.y + (t.box.y - anchor.box.y) * ANCHOR_DRIFT_ALPHA,
          width: anchor.box.width + (t.box.width - anchor.box.width) * ANCHOR_DRIFT_ALPHA,
          height: anchor.box.height + (t.box.height - anchor.box.height) * ANCHOR_DRIFT_ALPHA,
        };
      }
    }

    return false;
  }

  private evaluateDormant(t: TrackedDetection, anchor: StationaryAnchor): boolean {
    const stationary = (t.trackSpeed ?? 0) < STATIONARY_SPEED_THRESHOLD;

    if (stationary && boxIou(anchor.box, t.box) >= WAKE_IOU) {
      anchor.dormant = false;
      anchor.settleSightings = 0;
      this.logger.trace(`Static suppression: ${t.label}#${t.trackId} settled back onto its anchor`);
      return false;
    }

    if (stationary) {
      anchor.settleSightings += 1;
      if (anchor.settleSightings >= ANCHOR_SIGHTINGS) {
        anchor.box = t.box;
        anchor.dormant = false;
        anchor.settleSightings = 0;
        this.logger.trace(`Static suppression: ${t.label}#${t.trackId} re-anchored at a new spot`);
        return false;
      }
    } else {
      anchor.settleSightings = 0;
    }
    return true;
  }

  private adoptAnchor(t: TrackedDetection): boolean {
    if (t.trackId === undefined) return false;

    for (const [id, anchor] of this.anchors) {
      if (anchor.label !== t.label || boxIou(anchor.box, t.box) < WAKE_IOU) {
        continue;
      }

      this.anchors.delete(id);
      anchor.ghost = false;
      anchor.dormant = false;
      anchor.wakeMisses = 0;
      anchor.settleSightings = 0;
      this.anchors.set(t.trackId, anchor);
      this.logger.trace(`Static suppression: ${anchor.label}#${id} re-identified as #${t.trackId} (anchor adopted)`);
      return true;
    }

    return false;
  }
}
