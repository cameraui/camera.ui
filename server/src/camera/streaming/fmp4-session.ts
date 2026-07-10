import { SubscribedPublic } from '@camera.ui/common/utils';
import { firstValueFrom, ReplaySubject, Subject } from '@camera.ui/sdk';
import { FMP4_CODECS, FMP4Stream } from 'node-av/api';

import { setupNodeAvLog } from './node-av-log.js';

import type { CameraDeviceSource, CameraInput, Fmp4Session as Fmp4SessionInterface, Fmp4SessionOptions, LoggerService, RTSPUrlOptions } from '@camera.ui/sdk';
import type { FMP4Data } from 'node-av/api';
import type { FFHWDeviceType } from 'node-av/constants';
import type { CameraDevice } from '../index.js';

export class Fmp4Session extends SubscribedPublic implements Fmp4SessionInterface {
  static readonly #MAX_QUEUED_BOXES = 32;

  readonly onStarted = new ReplaySubject<void>(1);
  readonly onError = new Subject<Error>();
  readonly onEnded = new ReplaySubject<void>(1);

  #hasEnded = false;
  #cameraDevice: CameraDevice;
  #logger: LoggerService;
  #source: CameraDeviceSource;
  #url: string;
  #options: Fmp4SessionOptions = {};

  #fmp4Stream?: FMP4Stream;
  #initSegmentSubject = new ReplaySubject<Buffer>(1);
  #boxDataSubject = new Subject<Buffer>();

  constructor(cameraDevice: CameraDevice, source: CameraInput, urlOrOptions?: string | RTSPUrlOptions) {
    super();
    this.#cameraDevice = cameraDevice;
    this.#logger = cameraDevice.logger;
    this.#source = this.#cameraDevice.sources.find((s) => s.name === source.name)!;
    this.#url = typeof urlOrOptions === 'string' ? urlOrOptions : this.#source.generateRTSPUrl(urlOrOptions);
    setupNodeAvLog(this.#logger);
  }

  get initSegment(): Promise<Buffer> {
    return firstValueFrom(this.#initSegmentSubject);
  }

  public async startStream(config?: Fmp4SessionOptions): Promise<void> {
    this.#options = {
      ...config,
      input: {
        options: {
          ...config?.input?.options,
          user_agent: 'camera.ui Fmp4Session',
        },
      },
    };

    this.#logger.debug('Starting FMP4 session with options:', this.#options);

    if (this.#boxDataSubject.closed) {
      this.#boxDataSubject = new ReplaySubject<Buffer>(1);
    }

    if (this.#initSegmentSubject.closed) {
      this.#initSegmentSubject = new ReplaySubject<Buffer>(1);
    }

    const supportedVideoCodec = new Set<string>();
    for (const videoCodec of this.#options.supportedVideoCodecs ?? []) {
      switch (videoCodec) {
        case 'h264':
          supportedVideoCodec.add(FMP4_CODECS.H264);
          break;
        case 'hevc':
          supportedVideoCodec.add(FMP4_CODECS.H265);
          break;
        case 'av1':
          supportedVideoCodec.add(FMP4_CODECS.AV1);
          break;
      }
    }

    const supportedAudioCodec = new Set<string>();
    for (const audioCodec of this.#options.supportedAudioCodecs ?? []) {
      switch (audioCodec) {
        case 'aac':
          supportedAudioCodec.add(FMP4_CODECS.AAC);
          break;
        case 'opus':
          supportedAudioCodec.add(FMP4_CODECS.OPUS);
          break;
        case 'flac':
          supportedAudioCodec.add(FMP4_CODECS.FLAC);
          break;
      }
    }

    let ftypData: Buffer | undefined;
    let moovData: Buffer | undefined;

    let initSegment: Buffer | undefined;
    let initSegmentSent = false;

    this.#fmp4Stream = FMP4Stream.create(this.#url, {
      onData: (data: Buffer, info: FMP4Data) => {
        for (const box of info.boxes) {
          if (box.type === 'ftyp') {
            ftypData = data;
          }

          if (box.type === 'moov') {
            moovData = data;
          }

          if (ftypData && moovData && !initSegment) {
            initSegment = Buffer.concat([ftypData, moovData]);
            this.#initSegmentSubject.next(initSegment);
          }
        }

        if (initSegment && !initSegmentSent) {
          initSegmentSent = true;
          this.onStarted.next();
        }

        // Only send fragments (moof+mdat), not init boxes (ftyp/moov)
        const isFragment = initSegment && info.boxes.some((box) => box.type === 'moof');
        if (isFragment) {
          this.#boxDataSubject.next(data);
        }
      },
      onClose: async (err?: Error) => {
        if (err) {
          await this.#onError(err);
        } else {
          await this.#onEnded();
        }
      },
      boxMode: this.#options.boxMode,
      fragDuration: this.#options.fragDuration,
      hardware: this.#options.hardware === 'auto' ? 'auto' : { deviceType: this.#options.hardware as FFHWDeviceType },
      supportedCodecs: [...supportedVideoCodec, ...supportedAudioCodec].join(','),
      movFlags: 'frag_keyframe+empty_moov+default_base_moof',
      video: {
        width: this.#options.video?.width,
        height: this.#options.video?.height,
        fps: this.#options.video?.fps,
        encoderOptions: this.#options.video?.encoderOptions,
      },
      audio: {
        encoderOptions: this.#options.audio?.encoderOptions,
      },
    });

    await this.#fmp4Stream.start();
  }

  public async *streamBoxes(signal?: AbortSignal): AsyncGenerator<Buffer, void> {
    if (!this.#fmp4Stream) {
      throw new Error('Stream not started. Call startStream() first.');
    }

    const queue: Buffer[] = [];
    let resolveNext: ((value: Buffer | null) => void) | null = null;
    let done = false;
    let overflowed = false;

    const subscription = this.#boxDataSubject.subscribe((data) => {
      if (resolveNext) {
        resolveNext(data);
        resolveNext = null;
      } else if (queue.length >= Fmp4Session.#MAX_QUEUED_BOXES) {
        overflowed = true;
        cleanup();
      } else {
        queue.push(data);
      }
    });

    const cleanup = () => {
      done = true;
      subscription.unsubscribe();
      if (resolveNext) {
        resolveNext(null);
        resolveNext = null;
      }
    };

    signal?.addEventListener('abort', cleanup, { once: true });
    const endSub = this.onEnded.subscribe(cleanup);

    try {
      while (!done && !signal?.aborted && !this.#hasEnded) {
        let data: Buffer | null;

        if (queue.length > 0) {
          data = queue.shift()!;
        } else {
          data = await new Promise<Buffer | null>((resolve) => {
            if (done || signal?.aborted || this.#hasEnded) {
              resolve(null);
              return;
            }
            resolveNext = resolve;
          });
        }

        if (data === null) break;

        yield data;
      }

      if (overflowed) {
        throw new Error(`fMP4 consumer too slow: ended stream after ${Fmp4Session.#MAX_QUEUED_BOXES} queued fragments`);
      }
    } finally {
      cleanup();
      endSub.unsubscribe();
    }
  }

  public async stop(): Promise<void> {
    this.#onEnded();
  }

  async #onError(error: Error): Promise<void> {
    this.onError.next(error);
    await this.#onEnded();
  }

  async #onEnded(): Promise<void> {
    if (this.#hasEnded) {
      return;
    }

    this.#hasEnded = true;

    await this.#fmp4Stream?.stop();
    this.#fmp4Stream = undefined;

    this.#boxDataSubject.complete();
    this.#initSegmentSubject.complete();

    this.unsubscribe();

    this.onEnded.next();
    this.onEnded.complete();
  }
}
