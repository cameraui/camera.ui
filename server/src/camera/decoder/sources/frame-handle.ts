import { Decoder, Demuxer } from 'node-av/api';

import type { Frame } from 'node-av/lib';

export class FrameHandle implements AsyncDisposable {
  private disposed = false;

  private constructor(
    public readonly frame: Frame,
    private readonly demuxer?: Demuxer,
    private readonly decoder?: Decoder,
    public readonly rtp?: number,
  ) {}

  public static fromClonedFrame(frame: Frame, rtp?: number): FrameHandle {
    return new FrameHandle(frame, undefined, undefined, rtp);
  }

  public static async fromUrl(url: string, timeoutMs: number): Promise<FrameHandle> {
    const timeoutUs = Math.max(1, Math.floor(timeoutMs * 1000)); // libavformat expects timeout in microseconds
    const isRTSP = url.startsWith('rtsp://') || url.startsWith('rtsps://');

    const demuxer = await Demuxer.open(url, {
      options: {
        timeout: timeoutUs,
        rtsp_transport: isRTSP ? 'tcp' : undefined,
        user_agent: 'camera.ui Decoder',
      },
    });

    return FrameHandle.decodeFirstFrame(demuxer);
  }

  public static async fromBuffer(data: Buffer): Promise<FrameHandle> {
    const demuxer = await Demuxer.open(data);
    return FrameHandle.decodeFirstFrame(demuxer);
  }

  private static async decodeFirstFrame(demuxer: Demuxer): Promise<FrameHandle> {
    let decoder: Decoder | undefined;
    let firstFrame: Frame | undefined;
    try {
      const videoStream = demuxer.video();
      if (!videoStream) {
        throw new Error('No video stream in snapshot source');
      }

      decoder = await Decoder.create(videoStream, { exitOnError: false });

      const packets = demuxer.packets(videoStream.index);
      const frames = decoder.frames(packets);
      for await (const frame of frames) {
        if (!frame) continue;
        firstFrame = frame;
        break;
      }

      if (!firstFrame) {
        throw new Error('Snapshot source produced no frame');
      }

      decoder[Symbol.dispose]();
      decoder = undefined;
      await demuxer[Symbol.asyncDispose]();

      return new FrameHandle(firstFrame);
    } catch (error) {
      try {
        firstFrame?.[Symbol.dispose]?.();
      } catch {
        // ignore
      }
      try {
        decoder?.[Symbol.dispose]();
      } catch {
        // ignore
      }
      try {
        await demuxer[Symbol.asyncDispose]();
      } catch {
        // ignore
      }
      throw error;
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    try {
      this.frame[Symbol.dispose]?.();
    } catch {
      // ignore
    }

    if (this.decoder) {
      try {
        this.decoder[Symbol.dispose]();
      } catch {
        // ignore
      }
    }

    if (this.demuxer) {
      try {
        await this.demuxer[Symbol.asyncDispose]();
      } catch {
        // ignore
      }
    }
  }
}
