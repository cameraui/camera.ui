import { SubscribedPublic } from '@camera.ui/common/utils';
import { ReplaySubject, Subject } from '@camera.ui/sdk';
import getPort from 'get-port';
import { Decoder, Demuxer, Encoder, FilterAPI, FilterPreset, Muxer, StreamingUtils } from 'node-av/api';
import {
  AV_CODEC_ID_H264,
  AV_CODEC_ID_HEVC,
  AV_CODEC_ID_PCM_ALAW,
  AV_CODEC_ID_PCM_MULAW,
  AV_SAMPLE_FMT_S16,
  FF_ENCODER_LIBFDK_AAC,
  FF_ENCODER_LIBOPUS,
} from 'node-av/constants';
import { avGetSampleFmtFromName, Codec } from 'node-av/lib';
import { RtpPacket, RTPStream } from 'node-av/webrtc';

import { setupNodeAvLog } from './node-av-log.js';

import type {
  CameraDeviceSource,
  CameraInput,
  LoggerService,
  RtpSessionBackchannelOptions,
  RtpSession as RtpSessionInterface,
  RtpSessionOptions,
  RTSPUrlOptions,
} from '@camera.ui/sdk';
import type { RTPDemuxer } from 'node-av/api';
import type { AVCodecID, FFAudioEncoder, FFDecoderCodec, FFHWDeviceType, FFVideoEncoder } from 'node-av/constants';
import type { CameraDevice } from '../index.js';

export class RtpSession extends SubscribedPublic implements RtpSessionInterface {
  readonly onStarted = new ReplaySubject<void>(1);
  readonly onError = new Subject<Error>();
  readonly onEnded = new ReplaySubject<void>(1);
  readonly onVideoRtp = new Subject<RtpPacket>();
  readonly onAudioRtp = new Subject<RtpPacket>();

  #hasEnded = false;
  #cameraDevice: CameraDevice;
  #logger: LoggerService;
  #source: CameraDeviceSource;
  #url: string;
  #options: RtpSessionOptions = {};

  #rtpStream?: RTPStream;

  #backchannelTrackIndex?: number;
  #backchannelStreamIndex?: number;
  #backchannelRtpInput?: RTPDemuxer;
  #backchannelDecoder?: Decoder;
  #backchannelFilter?: FilterAPI;
  #backchannelEncoder?: Encoder;
  #backchannelOutput?: Muxer;
  #backchannelActive = false;
  #backchannelTask?: Promise<void>;

  constructor(cameraDevice: CameraDevice, source: CameraInput, urlOrOptions?: string | RTSPUrlOptions) {
    super();
    this.#cameraDevice = cameraDevice;
    this.#logger = cameraDevice.logger;
    this.#source = this.#cameraDevice.sources.find((s) => s.name === source.name)!;
    this.#url = typeof urlOrOptions === 'string' ? urlOrOptions : this.#source.generateRTSPUrl(urlOrOptions);
    setupNodeAvLog(this.#logger);
  }

  get hasBackchannel(): boolean {
    return this.#backchannelTrackIndex !== undefined;
  }

  public async startStream(config?: RtpSessionOptions): Promise<void> {
    this.#options = {
      ...config,
      input: {
        options: {
          ...config?.input?.options,
          user_agent: 'camera.ui RTPSession',
        },
      },
    };

    this.#logger.debug('Starting AV session with options:', this.#options);

    let supportedVideoCodec: (AVCodecID | FFVideoEncoder)[] | undefined;
    switch (this.#options.video?.codec) {
      case 'h264':
        supportedVideoCodec = [AV_CODEC_ID_H264];
        break;
      case 'hevc':
        supportedVideoCodec = [AV_CODEC_ID_HEVC];
        break;
    }

    let supportedAudioCodec: (AVCodecID | FFAudioEncoder)[] | undefined;
    switch (this.#options.audio?.codec) {
      case 'opus':
        supportedAudioCodec = [FF_ENCODER_LIBOPUS];
        break;
      case 'aac':
        supportedAudioCodec = [FF_ENCODER_LIBFDK_AAC];
        break;
      case 'pcma':
        supportedAudioCodec = [AV_CODEC_ID_PCM_ALAW];
        break;
      case 'pcmu':
        supportedAudioCodec = [AV_CODEC_ID_PCM_MULAW];
        break;
    }

    this.#rtpStream = RTPStream.create(this.#url, {
      onAudioPacket: (packet: RtpPacket) => {
        this.onAudioRtp.next(packet);
      },
      onVideoPacket: (packet: RtpPacket) => {
        this.onVideoRtp.next(packet);
      },
      onClose: async (err?: Error) => {
        if (err) {
          await this.#onError(err);
        } else {
          await this.#onEnded();
        }
      },
      supportedVideoCodecs: supportedVideoCodec,
      supportedAudioCodecs: supportedAudioCodec,
      hardware: this.#options.hardware === 'auto' ? 'auto' : { deviceType: this.#options.hardware as FFHWDeviceType },
      video: {
        mtu: this.#options.video?.mtu,
        ssrc: this.#options.video?.ssrc,
        payloadType: this.#options.video?.payloadType,
        fps: this.#options.video?.fps,
        width: this.#options.video?.width,
        height: this.#options.video?.height,
        encoderOptions: this.#options.video?.encoderOptions,
      },
      audio: {
        mtu: this.#options.audio?.mtu,
        ssrc: this.#options.audio?.ssrc,
        payloadType: this.#options.audio?.payloadType,
        sampleRate: this.#options.audio?.sampleRate,
        channels: this.#options.audio?.channels,
        encoderOptions: {
          frame_duration: this.#options.audio?.frameDuration,
          ...this.#options.audio?.encoderOptions,
        },
      },
      inputOptions: {
        format: 'rtsp',
        bufferSize: this.#options.video?.mtu,
        options: this.#options.input?.options,
      },
    });

    await this.#rtpStream.start();
  }

  public async startBackchannel(config: RtpSessionBackchannelOptions): Promise<void> {
    const input = this.#rtpStream?.getInput();
    if (!input) {
      throw new Error('Cannot start backchannel: main stream not open');
    }

    const formatContext = input.getFormatContext();
    const rtspInfo = formatContext.getRTSPStreamInfo();
    const backchannelInfo = rtspInfo?.find((s) => s.direction === 'sendonly');
    if (!backchannelInfo) {
      return;
    }

    this.#logger.debug('Starting backchannel with config:', config);

    const codec = Codec.findDecoderByName(config.decoderCodec as FFDecoderCodec);
    if (!codec) {
      throw new Error(`Unsupported decoder codec: ${config.decoderCodec}`);
    }

    this.#backchannelTrackIndex = backchannelInfo.streamIndex;
    const cameraCodecId = backchannelInfo.codecId;
    const cameraSampleRate = backchannelInfo.sampleRate ?? 8000;
    const cameraChannels = backchannelInfo.channels ?? 1;

    const udpPort = await getPort({ host: '127.0.0.1', ipv6Only: false });

    const sdp = StreamingUtils.createInputSDP([
      {
        port: udpPort,
        codecId: codec.id,
        payloadType: config.payloadType,
        clockRate: config.clockRate,
        channels: config.channels,
        fmtp: config.fmtp,
        srtp: config.srtp,
      },
    ]);

    this.#backchannelRtpInput = await Demuxer.openSDP(sdp);

    const audioStream = this.#backchannelRtpInput.input.audio();
    if (!audioStream) {
      throw new Error('No audio stream in backchannel SDP');
    }

    this.#backchannelDecoder = await Decoder.create(audioStream, {
      exitOnError: false,
    });

    const filterChain = FilterPreset.chain();
    const sampleFormatName = config.sampleFormat ? avGetSampleFmtFromName(config.sampleFormat) : AV_SAMPLE_FMT_S16;
    filterChain.aformat(sampleFormatName, cameraSampleRate, cameraChannels === 1 ? 'mono' : 'stereo');
    const filterString = filterChain.build();

    this.#backchannelFilter = FilterAPI.create(filterString);

    const cameraCodec = Codec.findEncoder(cameraCodecId);
    if (!cameraCodec) {
      throw new Error(`Camera codec not found: ${cameraCodecId}`);
    }

    this.#backchannelEncoder = await Encoder.create(cameraCodec, {
      decoder: this.#backchannelDecoder,
      filter: this.#backchannelFilter,
      options: {
        sample_rate: cameraSampleRate,
        channels: cameraChannels,
      },
    });

    this.#backchannelOutput = await Muxer.open(
      {
        write: (buffer: Buffer) => {
          try {
            const input = this.#rtpStream?.getInput();
            const rtp = RtpPacket.deSerialize(buffer);
            // Fire-and-forget send via RTSP backchannel.
            if (input && this.#backchannelTrackIndex !== undefined) {
              input
                .getFormatContext()
                ?.sendRTSPPacket(this.#backchannelTrackIndex, rtp.serialize())
                .catch(() => {});
            }
          } catch {
            // ignore
          }

          return buffer.length;
        },
      },
      {
        input: this.#backchannelRtpInput,
        format: 'rtp',
        useSyncQueue: false,
        useAsyncWrite: false,
        maxPacketSize: 1200,
      },
    );

    this.#backchannelStreamIndex = this.#backchannelOutput.addStream(this.#backchannelEncoder);

    this.#backchannelActive = true;

    this.#backchannelTask = this.#processBackchannel()
      .catch((error) => {
        this.#logger.error('Backchannel processing error:', error);
      })
      .finally(() => {
        this.#logger.trace('Backchannel processing ended');
        this.#backchannelActive = false;
      });
  }

  public async sendAudioPacket(rtp: RtpPacket | Buffer): Promise<void> {
    if (!this.#backchannelRtpInput) {
      return;
    }

    try {
      // Send to local UDP port; Demuxer receives and decodes.
      this.#backchannelRtpInput.sendPacket(rtp);
    } catch {
      // ignore
    }
  }

  public async stop(): Promise<void> {
    await this.#onEnded();
  }

  async #processBackchannel(): Promise<void> {
    if (
      !this.#backchannelRtpInput ||
      !this.#backchannelDecoder ||
      !this.#backchannelFilter ||
      !this.#backchannelEncoder ||
      !this.#backchannelOutput ||
      this.#backchannelStreamIndex === undefined
    ) {
      return;
    }

    const inputGenerator = this.#backchannelRtpInput.input.packets();
    const decoderGenerator = this.#backchannelDecoder.frames(inputGenerator);
    const filterGenerator = this.#backchannelFilter.frames(decoderGenerator);
    const encoderGenerator = this.#backchannelEncoder.packets(filterGenerator);

    try {
      for await (using encodedPacket of encoderGenerator) {
        if (!this.#backchannelActive) {
          break;
        }

        await this.#backchannelOutput.writePacket(encodedPacket, this.#backchannelStreamIndex);
      }
    } catch (error: any) {
      if (!this.#backchannelActive) {
        return;
      }

      throw error;
    }
  }

  async #cleanupStream(): Promise<void> {
    const stream = this.#rtpStream;
    if (!stream) {
      return;
    }

    this.#rtpStream = undefined;

    try {
      await stream.stop();
    } catch (error) {
      this.#logger.error('Error stopping RTP stream:', error);
    }
  }

  async #cleanupBackchannel(): Promise<void> {
    // Guard on resource existence (not the active flag): a backchannel that
    // failed to fully start, or whose processing loop already ended, still
    // holds an input/decoder/encoder/muxer that must be released.
    const input = this.#backchannelRtpInput;
    if (!input) {
      return;
    }

    this.#backchannelActive = false;
    this.#backchannelRtpInput = undefined;
    input.input.interrupt();

    try {
      await input.close();
    } catch (error) {
      this.#logger.error('Error closing backchannel input:', error);
    }

    try {
      await this.#backchannelTask;
    } catch {
      // already logged by the task's own catch
    }
    this.#backchannelTask = undefined;

    try {
      this.#backchannelDecoder?.close();
      this.#backchannelFilter?.close();
      this.#backchannelEncoder?.close();
    } catch (error) {
      this.#logger.error('Error closing backchannel codecs:', error);
    }

    try {
      await this.#backchannelOutput?.close();
    } catch (error) {
      this.#logger.error('Error closing backchannel output:', error);
    }

    this.#backchannelDecoder = undefined;
    this.#backchannelFilter = undefined;
    this.#backchannelEncoder = undefined;
    this.#backchannelOutput = undefined;
    this.#backchannelTrackIndex = undefined;
    this.#backchannelStreamIndex = undefined;
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

    this.unsubscribe();

    await this.#cleanupBackchannel();
    await this.#cleanupStream();

    this.onEnded.next();
  }
}
