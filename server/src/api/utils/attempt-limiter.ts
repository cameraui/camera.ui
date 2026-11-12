export class AttemptLimiter {
  private failures = new Map<string, { count: number; first: number }>();

  constructor(
    private windowMs: number,
    private maxFailures: number,
    private maxKeys = 10_000,
  ) {}

  public isLimited(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.maxFailures;
  }

  public recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.failures.get(key);
    if (entry && now - entry.first <= this.windowMs) {
      entry.count++;
      return;
    }

    this.failures.delete(key);
    for (const [oldKey, old] of this.failures) {
      if (now - old.first <= this.windowMs && this.failures.size < this.maxKeys) break;
      this.failures.delete(oldKey);
    }
    this.failures.set(key, { count: 1, first: now });
  }

  public clear(key: string): void {
    this.failures.delete(key);
  }
}
