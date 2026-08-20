import { Decoder, Demuxer, FilterAPI, FilterPreset } from 'node-av/api';
import { AV_SAMPLE_FMT_FLT, AV_SAMPLE_FMT_S16 } from 'node-av/constants';

import { ReconnectLoop } from './reconnect-loop.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Frame } from 'node-av/lib';
import type { CycleOutcome } from './reconnect-loop.js';

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

  private shouldRun = false;

  private latest?: AudioFrameSnap;
  private nextId = 0;
  private waiter?: Waiter;
  private ended = false;
  private producerPromise?: Promise<void>;
  private producerError?: Error;

  private readonly reconnect: ReconnectLoop;

  constructor(
    private readonly config: AudioSourceConfig,
    private readonly logger: Logger,
  ) {
    this.reconnect = new ReconnectLoop(logger, 'Audio stream');
  }

  public get isRunning(): boolean {
    return this.shouldRun;
  }

  public get lastError(): Error | undefined {
    return this.producerError;
  }

  public async start(): Promise<void> {
    if (this.shouldRun) return;

    this.shouldRun = true;
    this.ended = false;
    this.producerError = undefined;

    this.producerPromise = this.reconnect.run(
      () => this.shouldRun,
      () => this.runCycle(),
    );
  }

  public async stop(): Promise<void> {
    if (!this.shouldRun && !this.producerPromise) return;
    this.shouldRun = false;

    this.ended = true;
    this.wakeWaiter();
    this.reconnect.wake();
    this.input?.interrupt();

    if (this.producerPromise) {
      try {
        await this.producerPromise;
      } catch (error) {
        this.logger.debug('Audio producer exited with error:', error);
      }
      this.producerPromise = undefined;
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

  private async runCycle(): Promise<CycleOutcome> {
    this.logger.debug('Connecting to audio stream:', this.config.streamUrl);

    try {
      await this.connect();
    } catch (error) {
      await this.teardown();
      throw error;
    }

    this.reconnect.connected();
    this.logger.debug('Audio stream connected, processing audio frames...');

    try {
      return await this.consume();
    } finally {
      await this.teardown();
    }
  }

  private async connect(): Promise<void> {
    this.input = await Demuxer.open(this.config.streamUrl, {
      options: {
        rtsp_transport: 'tcp',
        user_agent: 'camera.ui Decoder',
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
  }

  private async consume(): Promise<CycleOutcome> {
    const audioStream = this.input?.audio();
    if (!this.input || !this.decoder || !this.filter || !audioStream) {
      return { delivered: false };
    }

    const packets = this.input.packets(audioStream.index);
    const decodedFrames = this.decoder.frames(packets);
    const filteredFrames = this.filter.frames(decodedFrames);

    let delivered = false;
    let firstFrame = true;

    try {
      for await (const frame of filteredFrames) {
        if (!this.shouldRun) break;
        if (!frame) continue;

        if (firstFrame) {
          this.logger.trace('First audio frame received');
          firstFrame = false;
        }

        this.dropLatest();
        this.latest = { frame, id: this.nextId++ };
        delivered = true;

        this.wakeWaiter();
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      this.producerError = failure;
      return { delivered, error: this.shouldRun ? failure : undefined };
    }

    return { delivered };
  }

  private dropLatest(): void {
    if (!this.latest) return;
    try {
      this.latest.frame[Symbol.dispose]?.();
    } catch {
      // ignore
    }
    this.latest = undefined;
  }

  private async teardown(): Promise<void> {
    this.dropLatest();

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
