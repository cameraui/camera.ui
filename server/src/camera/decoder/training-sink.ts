import { NamespaceManager } from '../../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { LoggerService } from '@camera.ui/sdk';
import type { CoreManagerInterface, TrainingCandidateBox } from '../../rpc/interfaces/core.js';

const FLUSH_INTERVAL_MS = 10_000;
const DISABLED_BACKOFF_MS = 5 * 60_000;
const HOLD_WINDOW_MS = 10_000;
const SCORE_IMPROVEMENT = 1.25;
const MAX_SAMPLES_PER_TRACK = 2;

interface HeldCandidate {
  eventId: string;
  scene: Uint8Array;
  boxes: TrainingCandidateBox[];
  capturedAt: number;
  score: number;
  movingTrackIds: Set<number>;
}

export class TrainingSink {
  private rpc?: CoreManagerInterface;
  private enabled = true;
  private held?: HeldCandidate;
  private holdTimer?: NodeJS.Timeout;
  private sentEventId?: string;
  private trackSamples = new Map<number, number>();
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

  public wantsFrame(eventId: string | undefined, movingTrackIds: number[] = [], score = 0): boolean {
    if (!this.enabled || this.pending) return false;
    const now = Date.now();
    if (now < this.disabledUntil) return false;
    // an open window only accepts a clear upgrade, everything else is free ticks
    if (this.held && this.held.eventId === eventId) return score > this.held.score * SCORE_IMPROVEMENT;
    if (now - this.lastFlushAt < FLUSH_INTERVAL_MS) return false;
    if (eventId && this.sentEventId === eventId) {
      // rolling windows: a presence keeps earning frames until each track
      // spent its sample budget, so pose variety survives a long walk-through
      return movingTrackIds.some((id) => (this.trackSamples.get(id) ?? 0) < MAX_SAMPLES_PER_TRACK);
    }
    return true;
  }

  public consider(eventId: string, scene: Uint8Array, boxes: TrainingCandidateBox[], capturedAt: number, movingTrackIds: number[], score: number): void {
    if (boxes.length === 0 || !this.wantsFrame(eventId, movingTrackIds, score)) return;

    if (this.held && this.held.eventId !== eventId) this.flush();

    if (this.held) {
      this.held.scene = scene;
      this.held.boxes = boxes;
      this.held.capturedAt = capturedAt;
      this.held.score = score;
      // budget is charged for the frame that actually ships, not for every tick
      this.held.movingTrackIds = new Set(movingTrackIds);
      return;
    }

    this.held = { eventId, scene, boxes, capturedAt, score, movingTrackIds: new Set(movingTrackIds) };
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
          if (this.sentEventId !== held.eventId) this.trackSamples.clear();
          this.sentEventId = held.eventId;
          for (const id of held.movingTrackIds) this.trackSamples.set(id, (this.trackSamples.get(id) ?? 0) + 1);
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
