import { Decoder, Demuxer, FilterAPI, FilterPreset } from 'node-av/api';
import { AV_SAMPLE_FMT_FLT, AV_SAMPLE_FMT_S16 } from 'node-av/constants';

import type { Logger } from '@camera.ui/common/logger';
import type { Frame } from 'node-av/lib';

export interface AudioSourceConfig {
  streamUrl: string;
  sampleRate: number;
  channels: number;
  format: 'pcm16' | 'float32';
  samplesPerFrame?: number;
}

export interface AudioFrameSnap {
  frame: Frame;
  id: number;
}

type Waiter = (snap: AudioFrameSnap | undefined) => void;

export class AudioSource {
  private input?: Demuxer;
  private decoder?: Decoder;
  private filter?: FilterAPI;

  private _isStreaming = false;
  private shouldRun = false;

  // single-slot mailbox with monotonic id
  private latest?: AudioFrameSnap;
  private nextId = 0;
  private waiter?: Waiter;
  private ended = false;
  private producerPromise?: Promise<void>;
  private producerError?: Error;

  constructor(
    private readonly config: AudioSourceConfig,
    private readonly logger: Logger,
  ) {}

  public get isStreaming(): boolean {
    return this._isStreaming;
  }

  public get lastError(): Error | undefined {
    return this.producerError;
  }

  public async start(): Promise<void> {
    if (this._isStreaming) {
      return;
    }

    this.logger.debug('Connecting to audio stream:', this.config.streamUrl);
    this.shouldRun = true;
    this.ended = false;
    this.latest = undefined;
    this.nextId = 0;
    this.producerError = undefined;

    this.input = await Demuxer.open(this.config.streamUrl, {
      options: {
        rtsp_transport: 'tcp',
        user_agent: 'camera.ui FrameWorker',
      },
    });

    const audioStream = this.input.audio();
    if (!audioStream) {
      throw new Error('No audio stream found');
    }

    this.decoder = await Decoder.create(audioStream, {
      exitOnError: false,
    });

    // resample to plugin spec
    const sampleFmt = this.config.format === 'pcm16' ? AV_SAMPLE_FMT_S16 : AV_SAMPLE_FMT_FLT;
    const layout = this.config.channels === 1 ? 'mono' : 'stereo';
    const chain = FilterPreset.chain().aformat(sampleFmt, this.config.sampleRate, layout);

    if (this.config.samplesPerFrame) {
      chain.filter('asetnsamples', { n: this.config.samplesPerFrame });
    }

    this.filter = FilterAPI.create(chain.build());

    this._isStreaming = true;

    this.producerPromise = this.runProducer();
  }

  public async stop(): Promise<void> {
    this.shouldRun = false;

    if (!this._isStreaming) return;
    this._isStreaming = false;

    this.ended = true;
    this.wakeWaiter();
    this.input?.interrupt();

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Audio producer exited with error:', error);
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

    if (this.input) {
      await this.input[Symbol.asyncDispose]();
      this.input = undefined;
    }

    this.logger.debug('Audio stream stopped');
  }

  public nextFrame(lastId: number): Promise<AudioFrameSnap | undefined> {
    if (this.ended) return Promise.resolve(undefined);
    if (this.latest && this.latest.id !== lastId) {
      const snap = this.latest;
      this.latest = undefined; // take ownership — producer must not dispose
      return Promise.resolve(snap);
    }
    return new Promise<AudioFrameSnap | undefined>((resolve) => {
      this.waiter = resolve;
    });
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

    const audioStream = this.input.audio();
    if (!audioStream) {
      this.ended = true;
      this.wakeWaiter();
      return;
    }

    const packets = this.input.packets(audioStream.index);
    const decodedFrames = this.decoder.frames(packets);
    const filteredFrames = this.filter.frames(decodedFrames);

    let firstFrame = true;
    try {
      for await (const frame of filteredFrames) {
        if (!this.shouldRun) break;
        if (!frame) continue;

        if (firstFrame) {
          this.logger.trace('First audio frame received');
          firstFrame = false;
        }

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
        this.logger.debug('Audio producer ended with read error:', error);
      }
    } finally {
      this.ended = true;
      this.wakeWaiter();
    }
  }
}
