import { PromiseTimeout } from '@camera.ui/common/utils';

export class SideQueue<TJob> {
  private readonly pending = new Map<string, TJob>();
  private draining = false;

  constructor(
    private readonly run: (jobs: TJob[]) => Promise<void>,
    private readonly timeoutMs: number,
    private readonly onError: (error: unknown) => void,
    private readonly onSettled?: (jobs: TJob[]) => void,
  ) {}

  public get busy(): boolean {
    return this.draining;
  }

  public push(key: string, job: TJob): boolean {
    const replaced = this.pending.has(key);
    this.pending.set(key, job);
    if (!this.draining) this.drain();
    return replaced;
  }

  public clear(): void {
    const dropped = [...this.pending.values()];
    this.pending.clear();
    if (dropped.length > 0) this.onSettled?.(dropped);
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.pending.size > 0) {
        const jobs = [...this.pending.values()];
        this.pending.clear();
        try {
          await PromiseTimeout(this.run(jobs), this.timeoutMs, undefined, `Side queue run timed out after ${this.timeoutMs}ms`);
        } catch (error) {
          this.onError(error);
        } finally {
          this.onSettled?.(jobs);
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
