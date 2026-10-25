import { SubscribedPublic } from '@camera.ui/common/utils';
import { firstValueFrom, ReplaySubject, Subject } from '@camera.ui/sdk';
import { FMP4_CODECS, FMP4Stream } from 'node-av/api';

import type {
  CameraDeviceSource,
  CameraInput,
  Fmp4Session as Fmp4SessionInterface,
  Fmp4SessionOptions,
  Fmp4VideoInfo,
  LoggerService,
  RTSPUrlOptions,
} from '@camera.ui/sdk';
import type { FMP4Data, MP4Box } from 'node-av/api';
import type { FFHWDeviceType } from 'node-av/constants';
import type { CameraDevice } from '../index.js';

export class Fmp4Session extends SubscribedPublic implements Fmp4SessionInterface {
  static readonly #MAX_QUEUED_BOXES = 32;
  static readonly #STARTUP_TIMEOUT_MS = 30_000;
  static readonly #MIN_VIDEO_STALL_MS = 24_000;
  static readonly #KEYFRAME_FRAGMENT_STALL_MS = 60_000;

  readonly onStarted = new ReplaySubject<void>(1);
  readonly onError = new Subject<Error>();
  readonly onEnded = new ReplaySubject<void>(1);

  #hasEnded = false;
  #abort = new AbortController();
  #shutdownPromise?: Promise<void>;
  #cameraDevice: CameraDevice;
  #logger: LoggerService;
  #source: CameraDeviceSource;
  #url: string;
  #startWithKeyframe: boolean;
  #options: Fmp4SessionOptions = {};

  #fmp4Stream?: FMP4Stream;
  #initSegmentSubject = new ReplaySubject<Buffer>(1);
  #boxDataSubject = new Subject<Buffer>();

  #watchdog?: NodeJS.Timeout;
  #videoTrackIds = new Set<number>();
  #fragmentsWithoutVideo = 0;

  constructor(cameraDevice: CameraDevice, source: CameraInput, urlOrOptions?: string | RTSPUrlOptions) {
    super();
    this.#cameraDevice = cameraDevice;
    this.#logger = cameraDevice.logger;
    this.#source = this.#cameraDevice.sources.find((s) => s.name === source.name)!;
    this.#url = typeof urlOrOptions === 'string' ? urlOrOptions : this.#source.generateRTSPUrl(urlOrOptions);
    this.#startWithKeyframe = typeof urlOrOptions === 'object' && urlOrOptions.gop === false;
  }

  get initSegment(): Promise<Buffer> {
    return firstValueFrom(this.#initSegmentSubject);
  }

  get videoInfo(): Fmp4VideoInfo | undefined {
    return this.#fmp4Stream?.getVideoInfo();
  }

  public async startStream(config?: Fmp4SessionOptions): Promise<void> {
    if (this.#hasEnded || this.#shutdownPromise) {
      throw new Error('FMP4 session has ended and cannot be restarted.');
    }

    if (this.#fmp4Stream) {
      throw new Error('FMP4 session already started.');
    }

    this.#options = {
      ...config,
      input: {
        options: {
          ...config?.input?.options,
          user_agent: 'camera.ui fmp4 session',
        },
      },
    };

    this.#logger.debug('Starting FMP4 session with options:', this.#options);

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

    // an explicit undefined would replace node-av's live input defaults (rtsp_transport, timeout)
    const inputOptions = Object.fromEntries(Object.entries(this.#options.input?.options ?? {}).filter(([, value]) => value !== undefined && value !== null));

    const fmp4Stream = FMP4Stream.create(this.#url, {
      signal: this.#abort.signal,
      inputOptions: {
        startWithKeyframe: this.#startWithKeyframe,
        options: inputOptions,
      },
      onData: (data: Buffer, info: FMP4Data) => {
        for (const box of info.boxes) {
          if (box.type === 'ftyp') {
            ftypData = data;
          }

          if (box.type === 'moov') {
            moovData = data;
            this.#videoTrackIds = videoTrackIds(box.data);
          }

          if (ftypData && moovData && !initSegment) {
            initSegment = Buffer.concat([ftypData, moovData]);
            this.#initSegmentSubject.next(initSegment);
          }
        }

        if (initSegment && !initSegmentSent) {
          initSegmentSent = true;
          this.#armVideoWatchdog();
          this.onStarted.next();
        }

        const isFragment = initSegment && info.boxes.some((box) => box.type === 'moof');
        if (isFragment) {
          this.#trackVideo(info.boxes);
          this.#boxDataSubject.next(data);
        }
      },
      onClose: (err?: Error) => {
        this.#end(err);
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
        bitrate: this.#options.video?.bitrate,
        transcode: this.#options.video?.transcode,
        tag: 'hvc1',
        encoderOptions: this.#options.video?.encoderOptions,
      },
      audio: {
        encoderOptions: this.#options.audio?.encoderOptions,
      },
    });

    this.#fmp4Stream = fmp4Stream;
    this.#watchdog = setTimeout(() => {
      this.#end(new Error(`FMP4 session produced no init segment within ${Fmp4Session.#STARTUP_TIMEOUT_MS / 1000}s`));
    }, Fmp4Session.#STARTUP_TIMEOUT_MS);

    try {
      await fmp4Stream.start();
    } catch (error) {
      try {
        await this.#onEnded();
      } catch (stopError) {
        this.#logger.error('Failed to clean up FMP4 session after start error:', stopError);
      }
      throw error;
    }
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
      signal?.removeEventListener('abort', cleanup);
    }
  }

  public async stop(): Promise<void> {
    await this.#onEnded();
  }

  #armVideoWatchdog(): void {
    clearTimeout(this.#watchdog);
    this.#watchdog = undefined;

    if (this.#videoTrackIds.size === 0 || this.#shutdownPromise) {
      return;
    }

    const fragMs = (this.#options.fragDuration ?? 1) / 1000;
    const stallMs = fragMs > 0 ? Math.max(3 * fragMs, Fmp4Session.#MIN_VIDEO_STALL_MS) : Fmp4Session.#KEYFRAME_FRAGMENT_STALL_MS;

    this.#watchdog = setTimeout(() => {
      const fragments = this.#fragmentsWithoutVideo;
      const detail = fragments > 0 ? `${fragments} fragments without video` : 'no fragments';
      this.#end(new Error(`FMP4 session emitted no video for ${stallMs / 1000}s (${detail})`));
    }, stallMs);
  }

  #trackVideo(boxes: MP4Box[]): void {
    if (this.#videoTrackIds.size === 0) {
      return;
    }

    const samples = boxes.reduce((count, box) => (box.type === 'moof' ? count + trackSampleCount(box.data, this.#videoTrackIds) : count), 0);
    if (samples > 0) {
      this.#fragmentsWithoutVideo = 0;
      this.#watchdog?.refresh();
    } else {
      this.#fragmentsWithoutVideo++;
    }
  }

  #end(error?: Error): void {
    const shutdown = error ? this.#onError(error) : this.#onEnded();
    shutdown.catch((err) => {
      this.#logger.error('Failed to shut down FMP4 session:', err);
    });
  }

  async #onError(error: Error): Promise<void> {
    if (this.#shutdownPromise) {
      return this.#shutdownPromise;
    }

    const shutdown = this.#onEnded();
    this.onError.next(error);
    await shutdown;
  }

  #onEnded(): Promise<void> {
    this.#shutdownPromise ??= Promise.resolve().then(() => this.#shutdown());
    return this.#shutdownPromise;
  }

  async #shutdown(): Promise<void> {
    this.#hasEnded = true;
    clearTimeout(this.#watchdog);
    this.#watchdog = undefined;
    this.#abort.abort();

    const fmp4Stream = this.#fmp4Stream;
    this.#fmp4Stream = undefined;

    try {
      await fmp4Stream?.stop();
    } finally {
      this.#boxDataSubject.complete();
      this.#initSegmentSubject.complete();
      this.onStarted.complete();
      this.onError.complete();

      this.unsubscribe();

      this.onEnded.next();
      this.onEnded.complete();
    }
  }
}

function videoTrackIds(moov: Buffer): Set<number> {
  const ids = new Set<number>();

  for (const trak of childBoxes(moov)) {
    if (trak.type !== 'trak') {
      continue;
    }

    let trackId: number | undefined;
    let handler: string | undefined;
    for (const child of childBoxes(trak.data)) {
      if (child.type === 'tkhd' && child.data.length >= 24) {
        trackId = child.data.readUInt32BE(child.data[0] === 1 ? 20 : 12);
      } else if (child.type === 'mdia') {
        const hdlr = childBoxes(child.data).find((box) => box.type === 'hdlr');
        handler = hdlr && hdlr.data.length >= 12 ? hdlr.data.toString('latin1', 8, 12) : undefined;
      }
    }

    if (trackId !== undefined && handler === 'vide') {
      ids.add(trackId);
    }
  }

  return ids;
}

function trackSampleCount(moof: Buffer, trackIds: Set<number>): number {
  let samples = 0;

  for (const traf of childBoxes(moof)) {
    if (traf.type !== 'traf') {
      continue;
    }

    const children = childBoxes(traf.data);
    const tfhd = children.find((box) => box.type === 'tfhd');
    if (!tfhd || tfhd.data.length < 8 || !trackIds.has(tfhd.data.readUInt32BE(4))) {
      continue;
    }

    for (const trun of children) {
      if (trun.type === 'trun' && trun.data.length >= 8) {
        samples += trun.data.readUInt32BE(4);
      }
    }
  }

  return samples;
}

function childBoxes(payload: Buffer): { type: string; data: Buffer }[] {
  const boxes: { type: string; data: Buffer }[] = [];

  let pos = 0;
  while (pos + 8 <= payload.length) {
    const size = payload.readUInt32BE(pos);
    let header = 8;
    let end = size === 0 ? payload.length : pos + size;
    if (size === 1) {
      if (pos + 16 > payload.length) {
        break;
      }
      header = 16;
      end = pos + Number(payload.readBigUInt64BE(pos + 8));
    }

    if (end < pos + header || end > payload.length) {
      break;
    }

    boxes.push({ type: payload.toString('latin1', pos + 4, pos + 8), data: payload.subarray(pos + header, end) });
    pos = end;
  }

  return boxes;
}
