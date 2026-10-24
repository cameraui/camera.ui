import type { SnapshotSettings } from '@camera.ui/sdk';

export interface StoredSnapshot {
  data: ArrayBuffer;
  fetchedAt: number;
}

const PUSH_WINDOW_MS = 10_000;

export class SnapshotStore {
  private readonly entries = new Map<string, StoredSnapshot>();
  private lastPushAt = 0;
  private pending?: { sourceId: string; timer: NodeJS.Timeout };

  constructor(private readonly push: (sourceId: string, entry: StoredSnapshot) => void) {}

  public get(sourceId: string): StoredSnapshot | undefined {
    return this.entries.get(sourceId);
  }

  public serve(sourceId: string, settings: SnapshotSettings, refreshedByTimer: boolean): ArrayBuffer | undefined {
    const entry = this.entries.get(sourceId);
    if (!entry) return undefined;
    const ageMs = Date.now() - entry.fetchedAt;
    if (settings.mode === 'onView' && ageMs > settings.maxAge * 1000) return undefined;
    // the timer refreshes one source only, any other would keep its first picture forever
    if (settings.mode === 'interval' && !refreshedByTimer && ageMs > settings.interval * 1000) return undefined;
    return entry.data;
  }

  public set(sourceId: string, data: ArrayBuffer, fetchedAt: number, announce: boolean): void {
    this.entries.set(sourceId, { data, fetchedAt });
    if (announce) this.schedulePush(sourceId);
  }

  public delete(sourceId: string): void {
    this.entries.delete(sourceId);
    if (this.pending?.sourceId === sourceId) this.cancelPending();
  }

  public retain(sourceIds: Iterable<string>): void {
    const keep = new Set(sourceIds);
    for (const sourceId of [...this.entries.keys()]) {
      if (!keep.has(sourceId)) this.delete(sourceId);
    }
  }

  public list(): [string, StoredSnapshot][] {
    return [...this.entries];
  }

  public dispose(): void {
    this.cancelPending();
    this.entries.clear();
  }

  private schedulePush(sourceId: string): void {
    if (this.pending) {
      this.pending.sourceId = sourceId;
      return;
    }
    const wait = this.lastPushAt + PUSH_WINDOW_MS - Date.now();
    if (wait <= 0) {
      this.emit(sourceId);
      return;
    }
    const timer = setTimeout(() => {
      const held = this.pending?.sourceId;
      this.pending = undefined;
      if (held) this.emit(held);
    }, wait);
    timer.unref();
    this.pending = { sourceId, timer };
  }

  private emit(sourceId: string): void {
    const entry = this.entries.get(sourceId);
    if (!entry) return;
    this.lastPushAt = Date.now();
    this.push(sourceId, entry);
  }

  private cancelPending(): void {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = undefined;
  }
}
