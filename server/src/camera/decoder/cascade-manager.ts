export const CASCADE_CLEAR_DELAY_MS = 1500;

export type CascadeState = 'activated' | 'deactivated';

export interface CascadeEvent {
  type: CascadeState;
  timestamp: number;
}

export type CascadeListener = (event: CascadeEvent) => void;

export class CascadeManager {
  private active = false;

  private momentaryTimer?: NodeJS.Timeout;
  private momentaryFlag = false;

  private deactivateTimer?: NodeJS.Timeout;

  private readonly listeners = new Set<CascadeListener>();

  public get isActive(): boolean {
    return this.active;
  }

  public triggerMomentary(timeoutSeconds: number): void {
    this.momentaryFlag = true;
    this.cancelDeactivateTimer();
    this.activateIfNeeded();

    if (this.momentaryTimer) clearTimeout(this.momentaryTimer);
    this.momentaryTimer = setTimeout(() => {
      this.momentaryTimer = undefined;
      this.momentaryFlag = false;
      this.scheduleDeactivateIfIdle();
    }, timeoutSeconds * 1000);
  }

  public onChange(listener: CascadeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public dispose(): void {
    if (this.momentaryTimer) clearTimeout(this.momentaryTimer);
    if (this.deactivateTimer) clearTimeout(this.deactivateTimer);

    this.momentaryTimer = undefined;
    this.deactivateTimer = undefined;
    this.momentaryFlag = false;
    this.listeners.clear();
    this.active = false;
  }

  private activateIfNeeded(): void {
    if (this.active) return;
    this.active = true;
    this.emit('activated');
  }

  private scheduleDeactivateIfIdle(): void {
    if (!this.active) return;
    if (this.momentaryFlag) return;
    if (this.deactivateTimer) return;

    this.deactivateTimer = setTimeout(() => {
      this.deactivateTimer = undefined;
      if (!this.momentaryFlag) {
        this.active = false;
        this.emit('deactivated');
      }
    }, CASCADE_CLEAR_DELAY_MS);
  }

  private cancelDeactivateTimer(): void {
    if (this.deactivateTimer) {
      clearTimeout(this.deactivateTimer);
      this.deactivateTimer = undefined;
    }
  }

  private emit(type: CascadeState): void {
    const event: CascadeEvent = { type, timestamp: Date.now() };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // ignore
      }
    }
  }
}
