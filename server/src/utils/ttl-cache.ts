export interface TtlCacheOptions {
  ttl: number;
  max?: number;
}

export interface TtlSetOptions {
  ttl?: number;
}

interface TtlCacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<K, V> {
  private readonly ttl: number;
  private readonly max: number;
  private readonly entries = new Map<K, TtlCacheEntry<V>>();

  constructor(options: TtlCacheOptions) {
    this.ttl = options.ttl;
    this.max = options.max ?? Infinity;
  }

  public get size(): number {
    this.purgeStale();
    return this.entries.size;
  }

  public get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= performance.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  public set(key: K, value: V, options?: TtlSetOptions): this {
    const ttl = options?.ttl ?? this.ttl;

    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: performance.now() + ttl });

    while (this.entries.size > this.max) {
      const next = this.nextToExpire();
      if (next === undefined) {
        break;
      }
      this.entries.delete(next);
    }

    return this;
  }

  public delete(key: K): boolean {
    return this.entries.delete(key);
  }

  public clear(): void {
    this.entries.clear();
  }

  public purgeStale(): void {
    const now = performance.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private nextToExpire(): K | undefined {
    let candidate: K | undefined;
    let earliest = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.expiresAt < earliest) {
        earliest = entry.expiresAt;
        candidate = key;
      }
    }

    return candidate;
  }
}
