import { Decoder, Demuxer, HardwareContext } from 'node-av/api';

import { FrameScaler } from '../frame-scaler.js';
import { ReconnectBackoff } from '../reconnect-backoff.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Frame, Packet, Stream } from 'node-av/lib';

export interface SnapshotSourceConfig {
  url: string;
}

interface BufferedPacket {
  serial: number;
  packet: Packet;
}

export class SnapshotSource {
  private input?: Demuxer;
  private videoStream?: Stream;
  private hardwareContext?: HardwareContext | null;
  private frameScaler?: FrameScaler;

  private buffer: BufferedPacket[] = [];
  private nextSerial = 0;
  private waitingForKeyframe = true;

  private decoder?: Decoder;
  private decodedThrough = -1;

  private cachedFrame?: Frame;
  private cachedFrameAt = 0;

  private shouldRun = false;
  private connected = false;
  private producerPromise?: Promise<void>;
  private inflightDecode?: Promise<Frame | null>;

  private readonly backoff = new ReconnectBackoff();
  private sleepTimer?: NodeJS.Timeout;
  private sleepResolve?: () => void;

  private static readonly MAX_BUFFER_PACKETS = 600;

  constructor(
    private readonly config: SnapshotSourceConfig,
    private readonly logger: Logger,
  ) {}

  public get isRunning(): boolean {
    return this.shouldRun;
  }

  public get hasBuffer(): boolean {
    return this.connected && this.buffer.length > 0;
  }

  public get scaler(): FrameScaler | undefined {
    return this.frameScaler;
  }

  public start(): void {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.backoff.reset();
    this.producerPromise = this.runProducer();
  }

  public async stop(): Promise<void> {
    if (!this.shouldRun && !this.producerPromise) return;
    this.shouldRun = false;
    this.wakeSleep();

    if (this.inflightDecode) {
      await this.inflightDecode;
    }

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Snapshot producer exited with error:', error);
      }
      this.producerPromise = undefined;
    }

    this.frameScaler?.dispose();
    this.frameScaler = undefined;

    if (this.hardwareContext) {
      this.hardwareContext[Symbol.dispose]();
      this.hardwareContext = undefined;
    }
  }

  public async getFrame(maxAgeMs: number): Promise<Frame | null> {
    if (!this.hasBuffer || !this.videoStream) return null;

    if (this.cachedFrame && Date.now() - this.cachedFrameAt <= maxAgeMs) {
      return this.cachedFrame.clone();
    }

    this.inflightDecode ??= this.catchUpDecode()
      .catch((error) => {
        this.logger.debug('Snapshot decode failed:', error);
        return null;
      })
      .finally(() => {
        this.inflightDecode = undefined;
      });

    const frame = await this.inflightDecode;
    return frame?.clone() ?? null;
  }

  public async snapshotJpeg(maxWidth: number, quality?: number, maxAgeMs = 500): Promise<Buffer | null> {
    const frame = await this.getFrame(maxAgeMs);
    if (!frame) return null;

    try {
      return (await this.frameScaler?.frameToJPEG(frame, maxWidth, quality)) ?? null;
    } finally {
      frame[Symbol.dispose]?.();
    }
  }

  private async runProducer(): Promise<void> {
    while (this.shouldRun) {
      try {
        await this.connect();
        this.backoff.reset();

        for await (const packet of this.input!.packets(this.videoStream!.index)) {
          if (!this.shouldRun) {
            packet?.free();
            break;
          }
          if (!packet) continue;
          this.ingest(packet);
        }
      } catch (error: any) {
        if (this.shouldRun) {
          this.logger.debug(`Snapshot source error: ${error.message}`);
        }
      }

      await this.teardown();
      if (!this.shouldRun) break;

      const delay = this.backoff.nextDelayMs();
      this.logger.debug(`Snapshot source disconnected, reconnecting in ${delay / 1000}s...`);
      await this.sleep(delay);
    }

    await this.teardown();
  }

  private async connect(): Promise<void> {
    this.logger.debug('Connecting to snapshot source:', this.config.url);

    this.input = await Demuxer.open(this.config.url, {
      options: {
        timeout: 15_000_000,
        rtsp_transport: 'tcp',
        user_agent: 'camera.ui FrameWorker',
        avioflags: 'direct',
      },
    });

    const videoStream = this.input.video();
    if (!videoStream) {
      throw new Error('No video stream found in snapshot source');
    }
    this.videoStream = videoStream;

    this.hardwareContext ??= HardwareContext.auto();
    this.frameScaler ??= new FrameScaler(this.hardwareContext, this.logger);

    this.waitingForKeyframe = true;
    this.connected = true;
    this.logger.debug(`Snapshot source connected: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
  }

  private ingest(packet: Packet): void {
    if (packet.isKeyframe) {
      this.clearBuffer();
      this.waitingForKeyframe = false;
      this.buffer.push({ serial: this.nextSerial++, packet });
      return;
    }

    if (this.waitingForKeyframe || this.buffer.length >= SnapshotSource.MAX_BUFFER_PACKETS) {
      if (this.buffer.length >= SnapshotSource.MAX_BUFFER_PACKETS) {
        this.clearBuffer();
        this.waitingForKeyframe = true;
      }
      packet.free();
      return;
    }

    this.buffer.push({ serial: this.nextSerial++, packet });
  }

  private async catchUpDecode(): Promise<Frame | null> {
    const pending: BufferedPacket[] = [];
    for (const b of this.buffer) {
      if (b.serial <= this.decodedThrough) continue;
      const cloned = b.packet.clone();
      if (cloned) pending.push({ serial: b.serial, packet: cloned });
    }

    if (pending.length === 0 || !this.videoStream) {
      // nothing new since the last feed, the cached frame is the newest
      return this.cachedFrame ?? null;
    }

    let last: Frame | undefined;
    try {
      this.decoder ??= await Decoder.create(this.videoStream, {
        hardware: this.hardwareContext ?? undefined,
        exitOnError: false,
      });

      for (const p of pending) {
        await this.decoder.decode(p.packet);
        let frame;
        while ((frame = await this.decoder.receive())) {
          last?.[Symbol.dispose]?.();
          last = frame;
        }
        this.decodedThrough = p.serial;
      }

      if (!last) {
        // decoder delay swallowed the fed packets, the cache stays newest
        return this.cachedFrame ?? null;
      }

      // ownership moves into the cache, consumers receive clones via getFrame
      this.cachedFrame?.[Symbol.dispose]?.();
      this.cachedFrame = last;
      this.cachedFrameAt = Date.now();
      const result = last;
      last = undefined;
      return result;
    } catch (error) {
      // drop the warm decoder and reset the cursor, the next call re-feeds
      // from the buffered keyframe
      this.logger.debug('Snapshot warm decoder reset:', error);
      this.disposeDecoder();
      return this.cachedFrame ?? null;
    } finally {
      last?.[Symbol.dispose]?.();
      for (const p of pending) p.packet.free();
    }
  }

  private disposeDecoder(): void {
    try {
      this.decoder?.[Symbol.dispose]();
    } catch {
      // best-effort
    }
    this.decoder = undefined;
    this.decodedThrough = -1;
  }

  private async teardown(): Promise<void> {
    this.connected = false;
    this.clearBuffer();
    this.waitingForKeyframe = true;
    this.disposeDecoder();
    this.videoStream = undefined;

    this.cachedFrame?.[Symbol.dispose]?.();
    this.cachedFrame = undefined;
    this.cachedFrameAt = 0;

    if (this.input) {
      try {
        await this.input[Symbol.asyncDispose]();
      } catch {
        // best-effort
      }
      this.input = undefined;
    }
  }

  private clearBuffer(): void {
    for (const b of this.buffer) {
      try {
        b.packet.free();
      } catch {
        // best-effort
      }
    }
    this.buffer = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.sleepResolve = resolve;
      this.sleepTimer = setTimeout(() => {
        this.sleepResolve = undefined;
        resolve();
      }, ms);
    });
  }

  private wakeSleep(): void {
    clearTimeout(this.sleepTimer);
    this.sleepTimer = undefined;
    this.sleepResolve?.();
    this.sleepResolve = undefined;
  }
}
