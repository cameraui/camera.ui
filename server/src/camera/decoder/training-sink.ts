import { NamespaceManager } from '../../rpc/namespaces.js';
import { iou } from './detection-window.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { BoundingBox, LoggerService } from '@camera.ui/sdk';
import type { CoreManagerInterface, TrainingCandidateBox } from '../../rpc/interfaces/core.js';

const FLUSH_INTERVAL_MS = 15_000;
const DISABLED_BACKOFF_MS = 5 * 60_000;
const HOLD_WINDOW_MS = 5_000;
const SCORE_IMPROVEMENT = 1.25;
const MAX_SAMPLES_PER_EVENT = 64;
const SAME_SPOT_IOU = 0.5;
const SCENE_FORGET_MS = 10 * 60_000;
const MAX_SCENE_SPOTS = 128;

export interface SceneObservation {
  label: string;
  box: BoundingBox;
}

export interface TrainingSubject extends SceneObservation {
  score: number;
}

interface SceneSpot {
  label: string;
  box: BoundingBox;
  lastSeenAt: number;
}

interface HeldCandidate {
  eventId: string;
  scene: Uint8Array;
  boxes: TrainingCandidateBox[];
  capturedAt: number;
  score: number;
}

export class TrainingSink {
  private rpc?: CoreManagerInterface;
  private enabled = true;
  private held?: HeldCandidate;
  private holdTimer?: NodeJS.Timeout;
  private sentEventId?: string;
  private sceneMemory: SceneSpot[] = [];
  private eventSamples = 0;
  private pending = false;
  private lastFlushAt = 0;
  private disabledUntil = 0;
  private unsubscribe?: () => void;

  constructor(
    private readonly cameraId: string,
    private readonly proxy: RPCClient,
    private readonly logger: LoggerService,
  ) {
    this.core()
      .getTrainingCollectionEnabled()
      .then((enabled) => {
        this.enabled = enabled;
      })
      .catch(() => {});

    this.proxy
      .subscribe<{ type: string; data?: { enabled?: boolean } }>(NamespaceManager.coreManagerNamespaces().coreManagerSubject, (msg) => {
        if (msg.type !== 'trainingSettingsChanged') return;
        this.enabled = msg.data?.enabled !== false;
        if (this.enabled) {
          this.disabledUntil = 0;
        } else {
          this.discard();
        }
      })
      .then((unsub) => {
        this.unsubscribe = unsub;
      })
      .catch(() => {});
  }

  public wantsFrame(eventId: string | undefined, subjects: TrainingSubject[] = []): boolean {
    if (!this.enabled || this.pending) return false;
    const now = Date.now();
    if (now < this.disabledUntil) return false;
    // an open window only accepts a clear upgrade, everything else is free ticks
    if (this.held && this.held.eventId === eventId) return this.novelScore(subjects, now) > this.held.score * SCORE_IMPROVEMENT;
    if (now - this.lastFlushAt < FLUSH_INTERVAL_MS) return false;
    // a stuck-open event must not churn the whole per-camera pool
    if (eventId && this.sentEventId === eventId && this.eventSamples >= MAX_SAMPLES_PER_EVENT) return false;
    return subjects.some((s) => this.isNovel(s, now));
  }

  public consider(eventId: string, scene: Uint8Array, boxes: TrainingCandidateBox[], capturedAt: number, subjects: TrainingSubject[]): void {
    if (boxes.length === 0 || !this.wantsFrame(eventId, subjects)) return;

    if (this.held && this.held.eventId !== eventId) this.flush();

    const score = this.novelScore(subjects, Date.now());
    if (this.held) {
      this.held.scene = scene;
      this.held.boxes = boxes;
      this.held.capturedAt = capturedAt;
      this.held.score = score;
      return;
    }

    this.held = { eventId, scene, boxes, capturedAt, score };
    this.holdTimer = setTimeout(() => this.flush(), HOLD_WINDOW_MS);
  }

  public observe(observations: SceneObservation[], now: number): void {
    this.sceneMemory = this.sceneMemory.filter((spot) => now - spot.lastSeenAt <= SCENE_FORGET_MS);
    if (this.sceneMemory.length === 0) return;
    for (const seen of observations) {
      const spot = this.matchSpot(seen.label, seen.box, now);
      if (spot) spot.lastSeenAt = now;
    }
  }

  public flushNow(): void {
    this.flush();
  }

  public destroy(): void {
    this.flush();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private core(): CoreManagerInterface {
    this.rpc ??= this.proxy.createProxy<CoreManagerInterface>(NamespaceManager.coreManagerNamespaces().coreManagerRpc);
    return this.rpc;
  }

  private discard(): void {
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = undefined;
    this.held = undefined;
  }

  private matchSpot(label: string, box: BoundingBox, now: number): SceneSpot | undefined {
    let best: SceneSpot | undefined;
    let bestIou = SAME_SPOT_IOU;
    for (const spot of this.sceneMemory) {
      if (spot.label !== label || now - spot.lastSeenAt > SCENE_FORGET_MS) continue;
      const overlap = iou(spot.box, box);
      if (overlap >= bestIou) {
        best = spot;
        bestIou = overlap;
      }
    }
    return best;
  }

  private isNovel(subject: SceneObservation, now: number): boolean {
    return this.matchSpot(subject.label, subject.box, now) === undefined;
  }

  private novelScore(subjects: TrainingSubject[], now: number): number {
    return subjects.reduce((sum, s) => sum + (this.isNovel(s, now) ? s.score : 0), 0);
  }

  private flush(): void {
    const held = this.held;
    this.discard();
    if (!held) return;

    this.pending = true;
    this.lastFlushAt = Date.now();

    this.core()
      .ingestTrainingCandidate({ cameraId: this.cameraId, eventId: held.eventId, capturedAt: held.capturedAt, boxes: held.boxes, scene: held.scene })
      .then((result) => {
        if (result === 'stored') {
          if (this.sentEventId !== held.eventId) this.eventSamples = 0;
          this.sentEventId = held.eventId;
          this.eventSamples += 1;
          // positions are charged for the frame that actually ships, not for
          // every tick; every shipped box counts, statics included, so nothing
          // in this picture triggers again until its spot changes
          const now = Date.now();
          for (const box of held.boxes) {
            const spot = this.matchSpot(box.label, box, now);
            if (spot) {
              spot.box = { x: box.x, y: box.y, width: box.width, height: box.height };
              spot.lastSeenAt = now;
            } else {
              this.sceneMemory.push({ label: box.label, box: { x: box.x, y: box.y, width: box.width, height: box.height }, lastSeenAt: now });
            }
          }
          if (this.sceneMemory.length > MAX_SCENE_SPOTS) {
            this.sceneMemory.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
            this.sceneMemory.length = MAX_SCENE_SPOTS;
          }
        } else if (result === 'disabled') {
          this.enabled = false;
          this.disabledUntil = Date.now() + DISABLED_BACKOFF_MS;
        }
      })
      .catch((error: unknown) => {
        this.logger.debug('Training candidate was not taken:', error);
      })
      .finally(() => {
        this.pending = false;
      });
  }
}
