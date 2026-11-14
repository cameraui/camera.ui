import { Decoder } from 'node-av/api';

import { isDamagedFrame } from '../../../utils/image.js';
import { FrameScaler } from '../frame-scaler.js';
import { releaseHardwareContext } from '../hardware.js';
import { FrameHandle } from './frame-handle.js';
import { ReconnectLoop } from './reconnect-loop.js';
import { RtpIndex } from './rtp-index.js';
import { SnapshotFetcher } from './snapshot-fetcher.js';
import { configureLowDelayDecoder, createFrameFilter, openVideoInput } from './video-input.js';

import type { Logger } from '@camera.ui/common/logger';
import type { FrameWorkerDecoderSettings } from '@camera.ui/sdk';
import type { Demuxer, FilterAPI, HardwareContext } from 'node-av/api';
import type { Frame, Packet, Stream } from 'node-av/lib';
import type { PrivacyMask } from '../../privacy/mask.js';
import type { AnalysisSource, FrameSnap } from './analysis-source.js';
import type { CycleOutcome } from './reconnect-loop.js';
import type { SnapshotConfig } from './snapshot-fetcher.js';

export interface BufferedSourceConfig {
  url: string;
  decoder?: FrameWorkerDecoderSettings;
  privacy?: PrivacyMask;
  snapshot?: SnapshotConfig;
}

export interface DecodedFrame {
  frame: Frame;
  rtp?: number;
}

interface BufferedPacket {
  serial: number;
  packet: Packet;
}

export class BufferedSource implements AnalysisSource {
  private static readonly MAX_BUFFER_PACKETS = 600;
  private static readonly DECODER_IDLE_MS = 60_000;
  private static readonly CACHE_FALLBACK_MAX_AGE_MS = 2_000;

  private input?: Demuxer;
  private videoStream?: Stream;
  private hwContext?: HardwareContext | null;
  private frameScaler?: FrameScaler;
  private packetWaiters: (() => void)[] = [];

  private buffer: BufferedPacket[] = [];
  private nextSerial = 0;
  private waitingForKeyframe = true;

  private decoder?: Decoder;
  private filter?: FilterAPI;
  private filterQueue: Promise<unknown> = Promise.resolve();
  private decodedThrough = -1;

  private cachedFrame?: Frame;
  private cachedFrameRtp?: number;
  private cachedFrameAt = 0;
  private lastPacketAt = 0;
  private lastDecodeAt = 0;
  private decodeMs = 0;
  private decodedFrames = 0;

  private shouldRun = false;
  private paused = false;
  private connected = false;
  private producerPromise?: Promise<void>;
  private producerError?: Error;
  private inflightDecode?: Promise<Frame | null>;
  private resolvedFps?: number;
  private _generation = 0;

  private readonly reconnect: ReconnectLoop;
  private readonly snapshots?: SnapshotFetcher;
  private readonly rtpIndex = new RtpIndex(2 * BufferedSource.MAX_BUFFER_PACKETS);

  constructor(
    private readonly config: BufferedSourceConfig,
    private readonly logger: Logger,
  ) {
    this.reconnect = new ReconnectLoop(logger, 'Buffered source');
    this.snapshots = config.snapshot ? new SnapshotFetcher(config.snapshot, logger) : undefined;
  }

  public get isRunning(): boolean {
    return this.shouldRun;
  }

  public get hasBuffer(): boolean {
    return this.connected && this.buffer.length > 0;
  }

  public get scaler(): FrameScaler | undefined {
    return this.frameScaler;
  }

  public get lastFrameAt(): number {
    return this.cachedFrameAt;
  }

  public get videoWidth(): number | undefined {
    return this.connected ? this.videoStream?.codecpar.width : undefined;
  }

  public get hardwareContext(): HardwareContext | null {
    return this.hwContext ?? null;
  }

  public get fps(): number {
    return this.resolvedFps ?? 20;
  }

  public get lastError(): Error | undefined {
    return this.producerError;
  }

  public get generation(): number {
    return this._generation;
  }

  public async start(): Promise<void> {
    this.paused = false;
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.producerError = undefined;

    this.producerPromise = this.reconnect.run(
      () => this.shouldRun,
      () => this.runCycle(),
    );
  }

  public async detach(): Promise<void> {
    this.paused = true;
    this.wakePacketWaiters();
  }

  public retryNow(): void {
    if (this.shouldRun) this.reconnect.retryNow();
  }

  public async stop(): Promise<void> {
    if (!this.shouldRun && !this.producerPromise) return;
    this.shouldRun = false;
    this.reconnect.cancel();
    this.wakePacketWaiters();

    if (this.inflightDecode) {
      await this.inflightDecode;
    }

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Buffered source producer exited with error:', error);
      }
      this.producerPromise = undefined;
    }

    this.frameScaler?.dispose();
    this.frameScaler = undefined;

    if (this.hwContext) {
      releaseHardwareContext(this.hwContext);
      this.hwContext = undefined;
    }
  }

  public async getFrame(maxAgeMs: number): Promise<FrameHandle | null> {
    return (await this.streamFrame(maxAgeMs)) ?? (await this.snapshots?.fetch()) ?? null;
  }

  public async streamFrame(maxAgeMs: number): Promise<FrameHandle | null> {
    const decoded = maxAgeMs > 0 ? await this.decodeNewest(maxAgeMs) : null;
    return decoded ? FrameHandle.fromClonedFrame(decoded.frame, decoded.rtp) : null;
  }

  public hasFreshFrame(maxAgeMs: number): boolean {
    return this.cachedFrame !== undefined && Date.now() - this.cachedFrameAt <= maxAgeMs;
  }

  public async decodeNewest(maxAgeMs: number): Promise<DecodedFrame | null> {
    if (!this.hasBuffer || !this.videoStream) return null;

    if (this.cachedFrame && Date.now() - this.cachedFrameAt <= maxAgeMs) {
      const frame = this.cachedFrame.clone();
      return frame ? { frame, rtp: this.cachedFrameRtp } : null;
    }

    this.inflightDecode ??= this.catchUpDecode()
      .catch((error) => {
        this.logger.debug('Buffered source decode failed:', error);
        return null;
      })
      .finally(() => {
        this.inflightDecode = undefined;
      });

    const frame = (await this.inflightDecode)?.clone();
    return frame ? { frame, rtp: this.cachedFrameRtp } : null;
  }

  public async nextFrame(lastId: number): Promise<FrameSnap | undefined> {
    while (this.shouldRun && !this.paused) {
      if (this.hasBuffer && this.nextSerial - 1 > lastId) {
        const decoded = await this.decodeNewest(0);
        // decoder delay can leave the cursor behind the newest packet, wait for the next one
        if (decoded && this.decodedThrough > lastId) {
          return { frame: decoded.frame, id: this.decodedThrough, rtp: decoded.rtp };
        }
        decoded?.frame[Symbol.dispose]?.();
      }
      await this.waitForPacket();
    }

    return undefined;
  }

  public async decodeOldestKeyframe(): Promise<Frame | null> {
    if (!this.videoStream || this.buffer.length === 0 || !this.buffer[0].packet.isKeyframe) return null;

    const cloned = this.buffer[0].packet.clone();
    if (!cloned) return null;

    let decoder: Decoder | undefined;
    let frame: Frame | undefined;
    try {
      decoder = await Decoder.create(this.videoStream, { hardware: this.hwContext ?? undefined, exitOnError: false });
      await decoder.decode(cloned);
      await decoder.decode(null);
      let received;
      while ((received = await decoder.receive())) {
        if (isDamagedFrame(received)) {
          received[Symbol.dispose]?.();
          continue;
        }
        frame?.[Symbol.dispose]?.();
        frame = received;
      }
      if (!frame) return null;

      const normalized = await this.normalize(frame);
      frame = undefined;
      return normalized;
    } catch (error) {
      this.logger.debug('Oldest keyframe decode failed:', error);
      frame?.[Symbol.dispose]?.();
      return null;
    } finally {
      try {
        decoder?.[Symbol.dispose]();
      } catch {
        // ignore
      }
      cloned.free();
    }
  }

  public async snapshotJpeg(maxWidth: number, quality?: number, maxAgeMs = 500): Promise<Buffer | null> {
    const decoded = await this.decodeNewest(maxAgeMs);
    if (!decoded) return null;

    try {
      return (await this.frameScaler?.frameToJPEG(decoded.frame, maxWidth, quality)) ?? null;
    } finally {
      decoded.frame[Symbol.dispose]?.();
    }
  }

  private async runCycle(): Promise<CycleOutcome> {
    try {
      await this.connect();
    } catch (error) {
      await this.teardown();
      throw error;
    }

    this.reconnect.connected();
    this._generation++;

    let delivered = false;
    try {
      for await (const packet of this.input!.packets(this.videoStream!.index)) {
        if (!this.shouldRun) {
          packet?.free();
          break;
        }
        if (!packet) continue;
        this.ingest(packet);
        delivered = true;
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.producerError = failure;
      return { delivered, error: this.shouldRun ? failure : undefined };
    } finally {
      await this.teardown();
    }

    return { delivered };
  }

  private async connect(): Promise<void> {
    this.logger.debug('Connecting to buffered source:', this.config.url);

    const { input, videoStream, hardwareContext, fps } = await openVideoInput(this.config.url, this.logger, {
      decoder: this.config.decoder,
      hardwareContext: this.hwContext,
      signal: this.reconnect.signal,
    });

    this.input = input;
    this.videoStream = videoStream;
    this.hwContext = hardwareContext;
    this.resolvedFps = fps;
    this.filter = createFrameFilter(this.hwContext ?? null, fps);
    this.frameScaler ??= new FrameScaler(this.hwContext, this.logger, this.config.privacy);

    this.waitingForKeyframe = true;
    this.connected = true;
    this.logger.debug(`Buffered source connected: ${videoStream.codecpar.width}x${videoStream.codecpar.height}`);
  }

  private ingest(packet: Packet): void {
    this.lastPacketAt = Date.now();
    this.rtpIndex.remember(packet);
    if (packet.isKeyframe) {
      this.clearBuffer();
      this.waitingForKeyframe = false;
      this.buffer.push({ serial: this.nextSerial++, packet });
      this.wakePacketWaiters();
      return;
    }

    if (this.waitingForKeyframe || this.buffer.length >= BufferedSource.MAX_BUFFER_PACKETS) {
      if (this.buffer.length >= BufferedSource.MAX_BUFFER_PACKETS) {
        this.clearBuffer();
        this.waitingForKeyframe = true;
      }
      packet.free();
      return;
    }

    this.buffer.push({ serial: this.nextSerial++, packet });
    this.wakePacketWaiters();
    this.releaseIdleDecoder();
  }

  private releaseIdleDecoder(): void {
    if (!this.decoder || this.inflightDecode) return;
    if (Date.now() - this.lastDecodeAt < BufferedSource.DECODER_IDLE_MS) return;

    // the cached frame goes too, a hardware frame would hold the released decoder's surface pool
    this.logger.debug('Releasing idle decoder and last frame, packet buffer stays');
    this.disposeDecoder();
    this.clearCachedFrame();
    this.frameScaler?.clearCache();
  }

  private waitForPacket(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.packetWaiters.push(resolve);
    });
  }

  private wakePacketWaiters(): void {
    if (this.packetWaiters.length === 0) return;
    const waiters = this.packetWaiters;
    this.packetWaiters = [];
    for (const resolve of waiters) resolve();
  }

  public takeDecodeStats(): { ms: number; frames: number } {
    const stats = { ms: this.decodeMs, frames: this.decodedFrames };
    this.decodeMs = 0;
    this.decodedFrames = 0;
    return stats;
  }

  private async catchUpDecode(): Promise<Frame | null> {
    const decodeStart = Date.now();
    const pending: BufferedPacket[] = [];
    for (const b of this.buffer) {
      if (b.serial <= this.decodedThrough) continue;
      const cloned = b.packet.clone();
      if (cloned) pending.push({ serial: b.serial, packet: cloned });
    }

    if (pending.length === 0 || !this.videoStream) {
      return this.freshCachedFrame();
    }

    let last: Frame | undefined;
    let lastRtp: number | undefined;
    this.lastDecodeAt = Date.now();
    try {
      this.decoder ??= await Decoder.create(this.videoStream, {
        hardware: this.hwContext ?? undefined,
        exitOnError: false,
        configure: configureLowDelayDecoder,
      });

      for (const p of pending) {
        await this.decoder.decode(p.packet);
        let frame;
        while ((frame = await this.decoder.receive())) {
          if (isDamagedFrame(frame)) {
            frame[Symbol.dispose]?.();
            continue;
          }
          last?.[Symbol.dispose]?.();
          last = frame;
          lastRtp = this.rtpIndex.lookup(frame);
          this.decodedFrames++;
        }
        this.decodedThrough = p.serial;
      }

      if (!last) {
        // decoder delay swallowed the fed packets, the cache stays newest
        return this.freshCachedFrame();
      }

      last = await this.normalize(last);

      // ownership moves into the cache, consumers receive clones via getFrame
      this.cachedFrame?.[Symbol.dispose]?.();
      this.cachedFrame = last;
      this.cachedFrameRtp = lastRtp;
      this.cachedFrameAt = this.lastPacketAt || Date.now();
      this.lastDecodeAt = Date.now();
      const result = last;
      last = undefined;
      return result;
    } catch (error) {
      // drop the warm decoder, the next call re-feeds from the buffered keyframe
      this.logger.debug('Buffered source warm decoder reset:', error);
      this.disposeDecoder();
      return this.freshCachedFrame();
    } finally {
      this.decodeMs += Date.now() - decodeStart;
      last?.[Symbol.dispose]?.();
      for (const p of pending) p.packet.free();
    }
  }

  private freshCachedFrame(): Frame | null {
    if (!this.cachedFrame || Date.now() - this.cachedFrameAt > BufferedSource.CACHE_FALLBACK_MAX_AGE_MS) return null;
    return this.cachedFrame;
  }

  private normalize(frame: Frame): Promise<Frame> {
    const run = this.filterQueue.then(() => this.runFilter(frame));
    this.filterQueue = run;
    return run;
  }

  private async runFilter(frame: Frame): Promise<Frame> {
    if (!this.filter) return frame;

    let outputs: Frame[];
    try {
      outputs = await this.filter.processAll(frame);
    } catch (error) {
      this.logger.debug('Buffered source filter failed:', error);
      return frame;
    }

    const newest = outputs.pop();
    for (const extra of outputs) extra[Symbol.dispose]?.();
    if (!newest) return frame;

    frame[Symbol.dispose]?.();
    return newest;
  }

  private disposeDecoder(): void {
    try {
      this.decoder?.[Symbol.dispose]();
    } catch {
      // ignore
    }
    this.decoder = undefined;
    this.decodedThrough = -1;
  }

  private clearCachedFrame(): void {
    this.cachedFrame?.[Symbol.dispose]?.();
    this.cachedFrame = undefined;
    this.cachedFrameRtp = undefined;
    this.cachedFrameAt = 0;
  }

  private async teardown(): Promise<void> {
    this.connected = false;
    this.clearBuffer();
    this.waitingForKeyframe = true;
    // the decode in flight still feeds the native decoder
    if (this.inflightDecode) await this.inflightDecode;
    this.disposeDecoder();
    this.videoStream = undefined;

    if (this.filter) {
      this.filter[Symbol.dispose]();
      this.filter = undefined;
    }

    this.clearCachedFrame();
    this.lastPacketAt = 0;
    this.rtpIndex.clear();

    if (this.input) {
      try {
        await this.input[Symbol.asyncDispose]();
      } catch {
        // ignore
      }
      this.input = undefined;
    }
  }

  private clearBuffer(): void {
    for (const b of this.buffer) {
      try {
        b.packet.free();
      } catch {
        // ignore
      }
    }
    this.buffer = [];
  }
}
