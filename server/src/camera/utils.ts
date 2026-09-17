import type { AudioCodec, AudioFFmpegCodec, AudioStreamInfo, ProbeStream, StreamDirection, VideoCodec, VideoFFmpegCodec, VideoStreamInfo } from '@camera.ui/sdk';
import type { Go2RTCOfferCodec, Go2RTCOffers, Go2RTCProducer } from '../go2rtc/types.js';

const AUDIO_CODECS: Record<string, AudioCodec> = {
  PCMU: 'PCMU',
  PCMA: 'PCMA',
  'MPEG4-GENERIC': 'MPEG4-GENERIC',
  ELD: 'MPEG4-GENERIC',
  OPUS: 'opus',
  G722: 'G722',
  G726: 'G726',
  MPA: 'MPA',
  L16: 'PCM',
  PCML: 'PCM',
  FLAC: 'FLAC',
};

const VIDEO_CODECS: Record<string, VideoCodec> = {
  H264: 'H264',
  H265: 'H265',
  VP8: 'VP8',
  VP9: 'VP9',
  AV1: 'AV1',
  JPEG: 'JPEG',
  RAW: 'RAW',
};

const AUDIO_ENCODERS: Record<string, AudioFFmpegCodec> = {
  opus: 'libopus',
  'aac/eld': 'aac',
  G722: 'g722',
};

export function sdkVideoCodec(codec: string): VideoCodec | undefined {
  return VIDEO_CODECS[codec];
}

export function sdkAudioCodec(codec: string): AudioCodec | undefined {
  return AUDIO_CODECS[codec.startsWith('G726') ? 'G726' : codec];
}

export function isCompanionProducer(producer: Go2RTCProducer): boolean {
  const url = producer.url ? decodeURIComponent(producer.url) : '';
  return url.includes('#cameraui');
}

export function streamInfoFromOffers(offers: Go2RTCOffers | undefined): ProbeStream | undefined {
  if (!offers || offers.state === 'unknown') return undefined;

  const video = offers.video.flatMap((offer) => videoStreamInfo(offer) ?? []);
  const audio = [
    ...offers.audio.flatMap((offer) => audioStreamInfo(offer, 'sendonly') ?? []),
    ...(offers.backchannel?.codecs ?? []).flatMap((offer) => audioStreamInfo(offer, 'recvonly') ?? []),
  ];

  if (!video.length && !audio.length) return undefined;

  return { sdp: offers.sdp, video, audio };
}

function videoStreamInfo(offer: Go2RTCOfferCodec): VideoStreamInfo | undefined {
  const codec = sdkVideoCodec(offer.codec);
  if (!codec) return undefined;

  return {
    codec,
    ffmpegCodec: offer.ffmpeg as VideoFFmpegCodec,
    properties: {
      clockRate: offer.rate ?? 90000,
      payloadType: offer.payload_type,
      fmtpInfo: offer.fmtp ? { payload: offer.payload_type, config: offer.fmtp } : undefined,
      profile: offer.profile,
      level: offer.level,
    },
    direction: 'sendonly',
  };
}

function audioStreamInfo(offer: Go2RTCOfferCodec, direction: StreamDirection): AudioStreamInfo | undefined {
  const codec = sdkAudioCodec(offer.codec);
  if (!codec) return undefined;

  return {
    codec,
    ffmpegCodec: AUDIO_ENCODERS[offer.ffmpeg] ?? (offer.ffmpeg as AudioFFmpegCodec),
    properties: {
      sampleRate: offer.rate ?? 0,
      channels: offer.channels ?? 1,
      payloadType: offer.payload_type,
      fmtpInfo: offer.fmtp ? { payload: offer.payload_type, config: offer.fmtp } : undefined,
    },
    direction,
  };
}
