import { Decoder } from 'node-av/api';

import { FrameHandle } from './frame-handle.js';
import { ReconnectLoop } from './reconnect-loop.js';
import { RtpIndex } from './rtp-index.js';
import { SnapshotFetcher } from './snapshot-fetcher.js';
import { createFrameFilter, openVideoInput } from './video-input.js';

import type { Logger } from '@camera.ui/common/logger';
import type { FrameWorkerDecoderSettings } from '@camera.ui/sdk';
import type { Demuxer, FilterAPI, HardwareContext } from 'node-av/api';
import type { Frame } from 'node-av/lib';
import type { AnalysisSource, FrameSnap } from './analysis-source.js';
import type { CycleOutcome } from './reconnect-loop.js';
import type { SnapshotConfig } from './snapshot-fetcher.js';

export { FrameHandle };
export type { FrameSnap };

export interface FrameSourceConfig extends SnapshotConfig {
  streamUrl: string;
  decoder?: FrameWorkerDecoderSettings;
}

type Waiter = (snap: FrameSnap | undefined) => void;

export class FrameSource implements AnalysisSource {
  private input?: Demuxer;
  private decoder?: Decoder;
  private filter?: FilterAPI;
  private _hardwareContext?: HardwareContext | null;

  private connected = false;
  private _resolvedFps?: number;
  private shouldRun = false;
  private _generation = 0;

  // single-slot mailbox with monotonic id
  private latest?: FrameSnap;
  private latestAt = 0;
  private nextId = 0;
  private waiter?: Waiter;
  private ended = false;
  private producerPromise?: Promise<void>;
  private producerError?: Error;

  private startCount = 0;
  private decodeMs = 0;
  private decodedFrames = 0;

  private readonly reconnect: ReconnectLoop;
  private readonly snapshots: SnapshotFetcher;
  private readonly rtpIndex = new RtpIndex(64);

  constructor(
    private readonly config: FrameSourceConfig,
    private readonly logger: Logger,
  ) {
    this.reconnect = new ReconnectLoop(logger, 'Stream');
    this.snapshots = new SnapshotFetcher(config, logger);
  }

  public get hardwareContext(): HardwareContext | null {
    return this._hardwareContext ?? null;
  }

  public get isRunning(): boolean {
    return this.shouldRun;
  }

  public get generation(): number {
    return this._generation;
  }

  public get fps(): number {
    return this._resolvedFps ?? 20;
  }

  public get lastError(): Error | undefined {
    return this.producerError;
  }

  public async start(): Promise<void> {
    if (this.shouldRun) {
      this.logger.warn('start() called while already streaming — skipped');
      return;
    }

    this.shouldRun = true;
    this.ended = false;
    this.producerError = undefined;

    this.producerPromise = this.reconnect.run(
      () => this.shouldRun,
      () => this.runCycle(),
    );
  }

  public async detach(): Promise<void> {
    await this.stop();
  }

  public async stop(): Promise<void> {
    if (!this.shouldRun && !this.producerPromise) return;
    this.shouldRun = false;

    // wake waiting consumers BEFORE awaiting the producer, otherwise they
    // hold it up
    this.ended = true;
    this.wakeWaiter();
    this.reconnect.wake();
    this.input?.interrupt();

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Frame producer exited with error:', error);
      }
      this.producerPromise = undefined;
    }

    this._resolvedFps = undefined;

    if (this._hardwareContext) {
      this._hardwareContext[Symbol.dispose]();
      this._hardwareContext = undefined;
    }

    this.logger.debug('Stream stopped');
  }

  public nextFrame(lastId: number): Promise<FrameSnap | undefined> {
    if (this.ended) return Promise.resolve(undefined);
    if (this.latest && this.latest.id !== lastId) {
      const snap = this.latest;
      this.latest = undefined; // take ownership — producer must not dispose this frame
      return Promise.resolve(snap);
    }
    return new Promise<FrameSnap | undefined>((resolve) => {
      this.waiter = resolve;
    });
  }

  public async getFrame(maxAgeMs: number): Promise<FrameHandle | null> {
    if (maxAgeMs > 0 && this.connected && this.latest && Date.now() - this.latestAt <= maxAgeMs) {
      const cloned = this.latest.frame.clone();
      if (cloned) return FrameHandle.fromClonedFrame(cloned, this.latest.rtp);
    }
    return this.snapshots.fetch();
  }

  private wakeWaiter(): void {
    if (!this.waiter) return;
    const w = this.waiter;
    this.waiter = undefined;
    if (this.ended) {
      w(undefined);
      return;
    }
    if (this.latest) {
      const snap = this.latest;
      this.latest = undefined; // take ownership before handing it to the consumer
      w(snap);
    } else {
      w(undefined);
    }
  }

  private async runCycle(): Promise<CycleOutcome> {
    this.startCount++;
    this.logger.debug(`Connecting to stream (start #${this.startCount}):`, this.config.streamUrl);

    try {
      await this.connect();
    } catch (error) {
      await this.teardown();
      throw error;
    }

    this.reconnect.connected();
    this.connected = true;
    this._generation++;
    this.logger.debug('Stream connected, processing frames...');

    try {
      return await this.consume();
    } finally {
      this.connected = false;
      await this.teardown();
    }
  }

  private async connect(): Promise<void> {
    const { input, videoStream, hardwareContext, fps } = await openVideoInput(this.config.streamUrl, this.logger, {
      decoder: this.config.decoder,
      hardwareContext: this._hardwareContext,
    });

    this.input = input;
    this._hardwareContext = hardwareContext;
    this._resolvedFps = fps;

    this.decoder = await Decoder.create(videoStream, {
      hardware: this._hardwareContext,
      exitOnError: false,
    });

    this.logger.debug(`Detection stream: ${videoStream.codecpar.width}x${videoStream.codecpar.height} @ ${fps}fps`);

    this.filter = createFrameFilter(this._hardwareContext ?? null, fps);
  }

  private async consume(): Promise<CycleOutcome> {
    const videoStream = this.input?.video();
    if (!this.input || !this.decoder || !this.filter || !videoStream) {
      return { delivered: false };
    }

    const packets = this.input.packets(videoStream.index);

    let delivered = false;
    let firstFrame = true;

    try {
      for await (using packet of packets) {
        if (!this.shouldRun) break;
        if (!packet) continue;

        this.rtpIndex.remember(packet);
        const decodeStart = Date.now();
        for await (const decoded of this.decoder.frames(packet)) {
          if (!decoded) continue;

          const rtp = this.rtpIndex.lookup(decoded);
          const frame = await this.applyFilter(decoded);
          this.decodeMs += Date.now() - decodeStart;
          this.decodedFrames++;

          if (firstFrame) {
            this.logger.trace('First frame received');
            firstFrame = false;
          }

          this.dropLatest();
          this.latest = { frame, id: this.nextId++, rtp };
          this.latestAt = Date.now();
          delivered = true;

          this.wakeWaiter();
        }
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.producerError = failure;
      return { delivered, error: this.shouldRun ? failure : undefined };
    }

    return { delivered };
  }

  public takeDecodeStats(): { ms: number; frames: number } {
    const stats = { ms: this.decodeMs, frames: this.decodedFrames };
    this.decodeMs = 0;
    this.decodedFrames = 0;
    return stats;
  }

  private async applyFilter(frame: Frame): Promise<Frame> {
    if (!this.filter) return frame;

    let outputs: Frame[];
    try {
      outputs = await this.filter.processAll(frame);
    } catch (error) {
      this.logger.debug('Stream filter failed:', error);
      return frame;
    }

    const newest = outputs.pop();
    for (const extra of outputs) extra[Symbol.dispose]?.();
    if (!newest) return frame;

    frame[Symbol.dispose]?.();
    return newest;
  }

  private dropLatest(): void {
    if (!this.latest) return;
    try {
      this.latest.frame[Symbol.dispose]?.();
    } catch {
      // ignore
    }
    this.latest = undefined;
    this.latestAt = 0;
  }

  private async teardown(): Promise<void> {
    this.dropLatest();
    this.rtpIndex.clear();

    if (this.filter) {
      this.filter[Symbol.dispose]();
      this.filter = undefined;
    }

    if (this.decoder) {
      this.decoder[Symbol.dispose]();
      this.decoder = undefined;
    }

    if (this.input) {
      try {
        await this.input[Symbol.asyncDispose]();
      } catch {
        // ignore
      }
      this.input = undefined;
    }
  }
}
