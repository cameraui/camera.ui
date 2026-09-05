import { NamespaceManager } from '../../rpc/namespaces.js';
import { iou } from './detection-window.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { LoggerService } from '@camera.ui/sdk';
import type { CoreManagerInterface, TrainingCandidateBox } from '../../rpc/interfaces/core.js';

const FLUSH_INTERVAL_MS = 15_000;
const DISABLED_BACKOFF_MS = 5 * 60_000;
const HOLD_WINDOW_MS = 5_000;
const SCORE_IMPROVEMENT = 1.25;
const MAX_SAMPLES_PER_EVENT = 64;
const MOVED_IOU = 0.5;

export interface TrainingSubject {
  trackId: number;
  box: { x: number; y: number; width: number; height: number };
}

interface HeldCandidate {
  eventId: string;
  scene: Uint8Array;
  boxes: TrainingCandidateBox[];
  capturedAt: number;
  score: number;
  subjects: TrainingSubject[];
}

export class TrainingSink {
  private rpc?: CoreManagerInterface;
  private enabled = true;
  private held?: HeldCandidate;
  private holdTimer?: NodeJS.Timeout;
  private sentEventId?: string;
  private storedBoxes = new Map<number, TrainingSubject['box']>();
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

  public wantsFrame(eventId: string | undefined, subjects: TrainingSubject[] = [], score = 0): boolean {
    if (!this.enabled || this.pending) return false;
    const now = Date.now();
    if (now < this.disabledUntil) return false;
    // an open window only accepts a clear upgrade, everything else is free ticks
    if (this.held && this.held.eventId === eventId) return score > this.held.score * SCORE_IMPROVEMENT;
    if (now - this.lastFlushAt < FLUSH_INTERVAL_MS) return false;
    if (eventId && this.sentEventId === eventId) {
      // a stuck-open event must not churn the whole per-camera pool
      if (this.eventSamples >= MAX_SAMPLES_PER_EVENT) return false;
      // a subject earns another frame only at a position the event has not
      // stored yet, so static scenes don't repeat
      return subjects.some((s) => this.movedSinceStored(s));
    }
    return true;
  }

  public consider(eventId: string, scene: Uint8Array, boxes: TrainingCandidateBox[], capturedAt: number, subjects: TrainingSubject[], score: number): void {
    if (boxes.length === 0 || !this.wantsFrame(eventId, subjects, score)) return;

    if (this.held && this.held.eventId !== eventId) this.flush();

    if (this.held) {
      this.held.scene = scene;
      this.held.boxes = boxes;
      this.held.capturedAt = capturedAt;
      this.held.score = score;
      this.held.subjects = subjects;
      return;
    }

    this.held = { eventId, scene, boxes, capturedAt, score, subjects };
    this.holdTimer = setTimeout(() => this.flush(), HOLD_WINDOW_MS);
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

  private movedSinceStored(subject: TrainingSubject): boolean {
    const stored = this.storedBoxes.get(subject.trackId);
    if (!stored) return true;
    return iou(stored, subject.box) < MOVED_IOU;
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
          if (this.sentEventId !== held.eventId) {
            this.storedBoxes.clear();
            this.eventSamples = 0;
          }
          this.sentEventId = held.eventId;
          this.eventSamples += 1;
          // positions are charged for the frame that actually ships, not for every tick
          for (const subject of held.subjects) this.storedBoxes.set(subject.trackId, subject.box);
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
