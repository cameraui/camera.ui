export type DwellState = 'activated' | 'expired';

export interface DwellEvent {
  sensorId: string;
  state: DwellState;
  timestamp: number;
}

export type DwellListener = (event: DwellEvent) => void;

export class DwellManager {
  private readonly active = new Map<string, boolean>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly expiries = new Map<string, number>();
  private readonly listeners = new Set<DwellListener>();

  public refresh(sensorId: string, timeoutSeconds: number): { wasActive: boolean } {
    const wasActive = this.active.get(sensorId) === true;

    const existing = this.timers.get(sensorId);
    if (existing) clearTimeout(existing);

    this.expiries.set(sensorId, Date.now() + timeoutSeconds * 1000);
    const timer = setTimeout(() => {
      this.active.set(sensorId, false);
      this.timers.delete(sensorId);
      this.expiries.delete(sensorId);
      this.emit({ sensorId, state: 'expired', timestamp: Date.now() });
    }, timeoutSeconds * 1000);
    this.timers.set(sensorId, timer);

    if (!wasActive) {
      this.active.set(sensorId, true);
      this.emit({ sensorId, state: 'activated', timestamp: Date.now() });
    }

    return { wasActive };
  }

  public isActive(sensorId: string): boolean {
    return this.active.get(sensorId) === true;
  }

  public hasActive(): boolean {
    for (const active of this.active.values()) {
      if (active) return true;
    }
    return false;
  }

  public maxExpiry(): number {
    let max = 0;
    for (const [sensorId, expiry] of this.expiries) {
      if (this.active.get(sensorId) && expiry > max) max = expiry;
    }
    return max;
  }

  public clear(sensorId: string): void {
    const timer = this.timers.get(sensorId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(sensorId);
    }
    this.expiries.delete(sensorId);
    const wasActive = this.active.get(sensorId) === true;
    this.active.delete(sensorId);
    if (wasActive) {
      this.emit({ sensorId, state: 'expired', timestamp: Date.now() });
    }
  }

  public onChange(listener: DwellListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.expiries.clear();
    this.active.clear();
    this.listeners.clear();
  }

  private emit(event: DwellEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }
}
