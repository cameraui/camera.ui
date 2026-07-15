import { Decoder, Demuxer, FilterAPI, FilterPreset, HardwareContext } from 'node-av/api';
import { AV_HWDEVICE_TYPE_OPENCL } from 'node-av/constants';

import type { Logger } from '@camera.ui/common/logger';
import type { Frame } from 'node-av/lib';

export interface FrameSourceConfig {
  streamUrl: string;
  snapshotUrl: string;
  fps: number;
  snapshotTimeoutMs?: number;
  snapshotProvider?: () => Promise<Buffer | null>;
}

export interface FrameSnap {
  frame: Frame;
  id: number;
}

type Waiter = (snap: FrameSnap | undefined) => void;

export class FrameHandle implements AsyncDisposable {
  private disposed = false;

  private constructor(
    public readonly frame: Frame,
    private readonly demuxer?: Demuxer,
    private readonly decoder?: Decoder,
  ) {}

  public static fromClonedFrame(frame: Frame): FrameHandle {
    return new FrameHandle(frame);
  }

  public static async fromUrl(url: string, timeoutMs: number): Promise<FrameHandle> {
    // libavformat expects timeout in microseconds
    const timeoutUs = Math.max(1, Math.floor(timeoutMs * 1000));
    const isRTSP = url.startsWith('rtsp://') || url.startsWith('rtsps://');

    const demuxer = await Demuxer.open(url, {
      options: {
        timeout: timeoutUs,
        rtsp_transport: isRTSP ? 'tcp' : undefined,
        user_agent: 'camera.ui FrameWorker',
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

      // frames() yields null for packets that produce no frame, keep iterating
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
        // best-effort
      }
      try {
        decoder?.[Symbol.dispose]();
      } catch {
        // best-effort
      }
      try {
        await demuxer[Symbol.asyncDispose]();
      } catch {
        // best-effort
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
      // best-effort
    }

    if (this.decoder) {
      try {
        this.decoder[Symbol.dispose]();
      } catch {
        // best-effort
      }
    }

    if (this.demuxer) {
      try {
        await this.demuxer[Symbol.asyncDispose]();
      } catch {
        // best-effort
      }
    }
  }
}

export class FrameSource {
  private input?: Demuxer;
  private decoder?: Decoder;
  private filter?: FilterAPI;
  private _hardwareContext?: HardwareContext | null;

  private _isStreaming = false;
  private _resolvedFps?: number;
  private shouldRun = false;

  // single-slot mailbox with monotonic id
  private latest?: FrameSnap;
  private nextId = 0;
  private waiter?: Waiter;
  private ended = false;
  private producerPromise?: Promise<void>;
  private producerError?: Error;

  private startCount = 0;

  private inflightFetch?: Promise<FrameHandle | null>;
  private static readonly FETCH_DEFAULT_TIMEOUT_MS = 8000;
  private static readonly COALESCING_WINDOW_MS = 200;

  constructor(
    private readonly config: FrameSourceConfig,
    private readonly logger: Logger,
  ) {}

  public get hardwareContext(): HardwareContext | null {
    return this._hardwareContext ?? null;
  }

  public get isStreaming(): boolean {
    return this._isStreaming;
  }

  public get fps(): number {
    return this._resolvedFps ?? this.config.fps;
  }

  public get lastError(): Error | undefined {
    return this.producerError;
  }

  public async start(): Promise<void> {
    if (this._isStreaming) {
      this.logger.warn('start() called while already streaming — skipped');
      return;
    }

    this.startCount++;
    this.logger.debug(`Connecting to stream (start #${this.startCount}):`, this.config.streamUrl);
    this.shouldRun = true;
    this.ended = false;
    this.latest = undefined;
    this.nextId = 0;
    this.producerError = undefined;

    this.input = await Demuxer.open(this.config.streamUrl, {
      options: {
        rtsp_transport: 'tcp',
        user_agent: 'camera.ui FrameWorker',
        avioflags: 'direct',
        // fflags: 'nobuffer',
      },
    });

    const videoStream = this.input.video();
    if (!videoStream) {
      throw new Error('No video stream found');
    }

    this._hardwareContext = HardwareContext.auto();
    if (this._hardwareContext) {
      this.logger.debug('Using hardware acceleration:', this._hardwareContext.deviceTypeName);
    } else {
      this.logger.warn('No hardware acceleration available, using software decoding');
    }

    this.decoder = await Decoder.create(videoStream, {
      hardware: this._hardwareContext,
      exitOnError: false,
    });

    // user-configured fps, native stream rate as fallback
    let nativeFps = videoStream.avgFrameRate.num / videoStream.avgFrameRate.den;
    if (!isFinite(nativeFps) || nativeFps <= 0 || isNaN(nativeFps)) {
      nativeFps = 20;
    }
    this._resolvedFps = this.config.fps > 0 ? this.config.fps : nativeFps;

    this.logger.debug(`Detection stream: ${videoStream.codecpar.width}x${videoStream.codecpar.height} @ ${this._resolvedFps}fps`);

    let filterChain = FilterPreset.chain(this._hardwareContext)
      .filter('fps', { fps: this._resolvedFps })
      .filter('setpts', { expr: `N/(${this._resolvedFps}*TB)` });

    if (this._hardwareContext?.deviceType === AV_HWDEVICE_TYPE_OPENCL) {
      filterChain = filterChain.hwupload();
    }

    this.filter = FilterAPI.create(filterChain.build(), {
      hardware: this._hardwareContext,
    });

    this._isStreaming = true;

    this.producerPromise = this.runProducer();
  }

  public async stop(): Promise<void> {
    this.shouldRun = false;

    if (!this._isStreaming) return;
    this._isStreaming = false;
    this._resolvedFps = undefined;

    // wake waiting consumers BEFORE awaiting the producer, otherwise they
    // hold it up
    this.ended = true;
    this.wakeWaiter();
    this.input?.interrupt();

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Frame producer exited with error:', error);
      }
      this.producerPromise = undefined;
    }

    if (this.latest) {
      try {
        this.latest.frame[Symbol.dispose]?.();
      } catch {
        // best-effort
      }
      this.latest = undefined;
    }

    if (this.filter) {
      this.filter[Symbol.dispose]();
      this.filter = undefined;
    }

    if (this.decoder) {
      this.decoder[Symbol.dispose]();
      this.decoder = undefined;
    }

    if (this._hardwareContext) {
      this._hardwareContext[Symbol.dispose]();
      this._hardwareContext = undefined;
    }

    if (this.input) {
      await this.input[Symbol.asyncDispose]();
      this.input = undefined;
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

  public peekLatestFrame(): FrameHandle | null {
    if (!this._isStreaming || !this.latest) return null;
    const cloned = this.latest.frame.clone();
    if (!cloned) return null;
    return FrameHandle.fromClonedFrame(cloned);
  }

  public async fetchSnapshotFrame(): Promise<FrameHandle | null> {
    if (!this.inflightFetch) {
      const timeoutMs = this.config.snapshotTimeoutMs ?? FrameSource.FETCH_DEFAULT_TIMEOUT_MS;
      const thisFetch = this.fetchSnapshotHandle(timeoutMs).catch((e) => {
        this.logger.debug('fetchSnapshotFrame failed:', e);
        return null;
      });
      this.inflightFetch = thisFetch;

      // per-fetch dispose timer, overlapping fetches must not share state
      thisFetch.finally(() => {
        setTimeout(async () => {
          if (this.inflightFetch === thisFetch) {
            this.inflightFetch = undefined;
          }
          try {
            const root = await thisFetch;
            if (root) await root[Symbol.asyncDispose]();
          } catch {
            // best-effort
          }
        }, FrameSource.COALESCING_WINDOW_MS);
      });
    }

    const rootHandle = await this.inflightFetch;
    if (!rootHandle) return null;
    const cloned = rootHandle.frame.clone();
    return cloned ? FrameHandle.fromClonedFrame(cloned) : null;
  }

  private async fetchSnapshotHandle(timeoutMs: number): Promise<FrameHandle | null> {
    if (this.config.snapshotProvider) {
      try {
        const jpeg = await this.config.snapshotProvider();
        if (jpeg && jpeg.length > 0) {
          return await FrameHandle.fromBuffer(jpeg);
        }
      } catch {
        // fall back to snapshotUrl
      }
    }
    return FrameHandle.fromUrl(this.config.snapshotUrl, timeoutMs);
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

  private async runProducer(): Promise<void> {
    if (!this.input || !this.decoder || !this.filter) {
      this.ended = true;
      this.wakeWaiter();
      return;
    }

    const videoStream = this.input.video();
    if (!videoStream) {
      this.ended = true;
      this.wakeWaiter();
      return;
    }

    const packets = this.input.packets(videoStream.index);
    const decodedFrames = this.decoder.frames(packets);
    const filteredFrames = this.filter.frames(decodedFrames);

    let firstFrame = true;

    try {
      for await (const frame of filteredFrames) {
        if (!this.shouldRun) break;
        if (!frame) continue;

        if (firstFrame) {
          this.logger.trace('First frame received');
          firstFrame = false;
        }

        // dispose any un-picked-up frame before overwriting the slot
        if (this.latest) {
          try {
            this.latest.frame[Symbol.dispose]?.();
          } catch {
            // best-effort
          }
        }
        this.latest = { frame, id: this.nextId++ };

        this.wakeWaiter();
      }
    } catch (error) {
      if (this.shouldRun) {
        this.producerError = error instanceof Error ? error : new Error(String(error));
        this.logger.debug('Frame producer ended with read error:', error);
      }
    } finally {
      this.ended = true;
      this.wakeWaiter();
    }
  }
}
