import { isCompanionProducer } from '../camera/utils.js';

import type { Go2RtcStreamState, Go2RtcStreamStats } from './state.js';

export interface StreamRate {
  bitrateIn: number;
  bitrateOut: number;
  drops: number;
}

export class StreamRates {
  private counters = new Map<string, number>();
  private lastUpdate?: number;

  public update(stats: Record<string, Go2RtcStreamStats>, stateOf: (name: string) => Go2RtcStreamState | undefined, now = Date.now()): Map<string, StreamRate> {
    const seconds = this.lastUpdate === undefined ? 0 : (now - this.lastUpdate) / 1000;
    const next = new Map<string, number>();
    const rates = new Map<string, StreamRate>();

    for (const [name, stream] of Object.entries(stats)) {
      const producers = stateOf(name)?.producers ?? [];
      let bytesIn = 0;
      let bytesOut = 0;
      let drops = 0;

      for (const [index, producer] of (stream.producers ?? []).entries()) {
        const described = producers[index];
        if (described && isCompanionProducer(described)) continue;
        for (const receiver of producer.receivers ?? []) {
          bytesIn += this.delta(next, `${name}:r:${receiver.id}`, receiver.bytes ?? 0);
        }
      }

      for (const consumer of stream.consumers ?? []) {
        for (const sender of consumer.senders ?? []) {
          bytesOut += this.delta(next, `${name}:s:${sender.id}`, sender.bytes ?? 0);
          drops += sender.drops ?? 0;
        }
      }

      rates.set(name, {
        bitrateIn: seconds > 0 ? Math.round((bytesIn * 8) / seconds) : 0,
        bitrateOut: seconds > 0 ? Math.round((bytesOut * 8) / seconds) : 0,
        drops,
      });
    }

    this.counters = next;
    this.lastUpdate = now;

    return rates;
  }

  private delta(next: Map<string, number>, key: string, value: number): number {
    next.set(key, value);
    const previous = this.counters.get(key);
    return previous === undefined || value < previous ? 0 : value - previous;
  }
}
