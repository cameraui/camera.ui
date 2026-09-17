import type { Go2RTCOfferCodec } from '@shared/types';

const CODEC_NAMES: Record<string, string> = {
  H264: 'H.264',
  H265: 'H.265',
  VP8: 'VP8',
  VP9: 'VP9',
  AV1: 'AV1',
  JPEG: 'MJPEG',
  RAW: 'RAW',
  'MPEG4-GENERIC': 'AAC',
  ELD: 'AAC-ELD',
  OPUS: 'Opus',
  PCMA: 'G.711 A-law',
  PCMU: 'G.711 μ-law',
  G722: 'G.722',
  L16: 'PCM',
  PCML: 'PCM',
  MPA: 'MP3',
  FLAC: 'FLAC',
};

const VIDEO_CLOCK_RATE = 90000;

export function codecLabel(codec: Go2RTCOfferCodec): string {
  const parts = [CODEC_NAMES[codec.codec] ?? (codec.codec.startsWith('G726') ? 'G.726' : codec.codec)];

  if (codec.profile) parts.push(codec.profile);
  if (codec.level) parts.push(String(codec.level / 10));
  if (codec.rate && codec.rate !== VIDEO_CLOCK_RATE) parts.push(`${codec.rate / 1000} kHz`);

  return parts.join(' · ');
}
