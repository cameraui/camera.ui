import { Decoder, Demuxer, Scaler } from 'node-av/api';

import { isDamagedFrame, toArrayBuffer } from '../../utils/image.js';
import { PrivacyMask } from './mask.js';

import type { Logger } from '@camera.ui/common/logger';
import type { CameraZones } from '@camera.ui/sdk';

const JPEG_QUALITY = 92;

export class SnapshotPrivacy {
  private readonly mask: PrivacyMask;
  private scaler?: Scaler;

  constructor(private logger?: Logger) {
    this.mask = new PrivacyMask(logger, 'snapshots');
  }

  public update(zones: CameraZones | undefined): void {
    this.mask.update(zones);
  }

  public async apply(jpeg: ArrayBuffer): Promise<ArrayBuffer | undefined> {
    if (!this.mask.active || jpeg.byteLength === 0) return jpeg;

    try {
      const masked = await this.maskJpeg(jpeg);
      if (masked) return masked;
    } catch (error) {
      this.logger?.debug(`Snapshot masking failed: ${error}`);
    }

    return this.mask.reportFailure() === 'drop' ? undefined : jpeg;
  }

  public dispose(): void {
    this.scaler?.[Symbol.dispose]();
    this.scaler = undefined;
  }

  private async maskJpeg(jpeg: ArrayBuffer): Promise<ArrayBuffer | null> {
    await using demuxer = await Demuxer.open(Buffer.from(jpeg));
    const stream = demuxer.video();
    if (!stream) return null;

    using decoder = await Decoder.create(stream, { exitOnError: false });

    for await (using frame of decoder.frames(demuxer.packets(stream.index))) {
      if (!frame || isDamagedFrame(frame)) continue;
      using masked = this.mask.masked(frame);
      if (!masked) return null;

      return toArrayBuffer(await this.getScaler().toJpeg(masked, { quality: JPEG_QUALITY }));
    }

    return null;
  }

  private getScaler(): Scaler {
    this.scaler ??= new Scaler();
    return this.scaler;
  }
}
