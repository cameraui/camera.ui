import { AV_PKT_DATA_RTP_TIMESTAMP } from 'node-av/constants';

import type { Frame, Packet } from 'node-av/lib';

export class RtpIndex {
  private readonly byPts = new Map<bigint, number>();

  constructor(private readonly limit: number) {}

  public remember(packet: Packet): void {
    const data = packet.getSideData(AV_PKT_DATA_RTP_TIMESTAMP);
    if (!data || data.length < 4) return;
    this.byPts.set(packet.pts, data.readUInt32LE(0));
    if (this.byPts.size > this.limit) {
      this.byPts.delete(this.byPts.keys().next().value!);
    }
  }

  public lookup(frame: Frame): number | undefined {
    return this.byPts.get(frame.pts);
  }

  public clear(): void {
    this.byPts.clear();
  }
}
