const MAX_RECONNECT_COUNT = 10;
const RECONNECT_DELAY_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

export class ReconnectBackoff {
  private count = 0;

  public get idleDelayMs(): number {
    return RECONNECT_DELAY_MS;
  }

  public nextDelayMs(): number {
    this.count = Math.min(this.count + 1, MAX_RECONNECT_COUNT);
    return this.count >= MAX_RECONNECT_COUNT ? MAX_RECONNECT_DELAY_MS : RECONNECT_DELAY_MS;
  }

  public reset(): void {
    this.count = 0;
  }
}
