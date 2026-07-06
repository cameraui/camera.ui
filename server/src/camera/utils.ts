import {
  createProfileLevelId,
  extractLevelFromProfileLevelId,
  extractProfileFromProfileLevelId,
  extractSdpInfo,
  getAudioCodecProperties,
  getVideoCodecProperties,
  isSameAudioStreamInfo,
  isSameVideoStreamInfo,
  mapAudioCodecName,
  mapVideoCodecName,
  normalizeAudioCodecs,
  normalizeVideoCodecs,
} from '@camera.ui/common/camera';

import type { AudioStreamInfo, RTPInfo, VideoStreamInfo } from '@camera.ui/sdk';
import type { Go2RTCProducer } from '../go2rtc/types.js';

export function generateAudioStreamInfo(producers: Go2RTCProducer[]): AudioStreamInfo[] {
  const audioStreamInfos: AudioStreamInfo[] = [];

  const sdpInfo = extractSdpInfo(producers);

  for (const producer of producers) {
    const backchannelAdded = new Set<string>();

    if (producer.receivers?.length) {
      for (const receiver of producer.receivers) {
        if (receiver.codec?.codec_type === 'audio') {
          const audioCodec = mapAudioCodecName(receiver.codec.codec_name);
          if (!audioCodec) continue;

          const { codec, ffmpegCodec } = normalizeAudioCodecs(audioCodec);

          const rtpInfo: RTPInfo = {
            codec: receiver.codec.codec_name,
            rate: receiver.codec.sample_rate,
            encoding: receiver.codec.channels,
          };

          const sdpCodecInfo = sdpInfo.audio[codec];
          if (sdpCodecInfo) {
            if (sdpCodecInfo.clockRate) {
              rtpInfo.rate = sdpCodecInfo.clockRate;
            }
            if (sdpCodecInfo.channels) {
              rtpInfo.encoding = sdpCodecInfo.channels;
            }
            if (sdpCodecInfo.payload) {
              rtpInfo.payload = sdpCodecInfo.payload;
            }
          }

          const properties = getAudioCodecProperties(codec, rtpInfo);

          if (sdpCodecInfo?.fmtp && properties.fmtpInfo) {
            properties.fmtpInfo.config = sdpCodecInfo.fmtp;
          }

          // MPEG4-GENERIC: append config from SDP if not already present.
          if (codec === 'MPEG4-GENERIC' && sdpCodecInfo?.config && properties.fmtpInfo) {
            if (!properties.fmtpInfo.config.includes('config=')) {
              properties.fmtpInfo.config += `;config=${sdpCodecInfo.config}`;
            }
          }

          const audioStreamInfo: AudioStreamInfo = {
            codec,
            ffmpegCodec,
            properties,
            direction: 'sendonly',
          };

          if (!audioStreamInfos.some((info) => isSameAudioStreamInfo(info, audioStreamInfo))) {
            audioStreamInfos.push(audioStreamInfo);
          }
        }
      }
    }

    if (producer.senders?.length) {
      for (const sender of producer.senders) {
        // Skip ANY codec — placeholder; medias is checked below.
        if (sender.codec?.codec_type === 'audio' && sender.codec.codec_name !== 'ANY') {
          const audioCodec = mapAudioCodecName(sender.codec.codec_name);
          if (!audioCodec) continue;

          const { codec, ffmpegCodec } = normalizeAudioCodecs(audioCodec);

          const rtpInfo: RTPInfo = {
            codec: sender.codec.codec_name,
            rate: sender.codec.sample_rate,
            encoding: sender.codec.channels,
          };

          const properties = getAudioCodecProperties(codec, rtpInfo);

          const audioStreamInfo: AudioStreamInfo = {
            codec,
            ffmpegCodec,
            properties,
            direction: 'recvonly',
          };

          if (!audioStreamInfos.some((info) => isSameAudioStreamInfo(info, audioStreamInfo))) {
            audioStreamInfos.push(audioStreamInfo);
            backchannelAdded.add(codec);
          }
        }
      }
    }

    // Check medias for backchannel when senders advertise ANY or no codec info.
    if (producer.medias) {
      for (const media of producer.medias) {
        if (media.startsWith('audio') && media.includes('sendonly')) {
          const parts = media.split(', ');
          if (parts.length >= 3) {
            for (let i = 2; i < parts.length; i++) {
              const codecInfo = parts[i];
              const codecParts = codecInfo.split('/');
              const audioCodecStr = codecParts[0];

              const audioCodec = mapAudioCodecName(audioCodecStr);
              if (!audioCodec) continue;

              const { codec, ffmpegCodec } = normalizeAudioCodecs(audioCodec);

              // Dedup key includes sample rate.
              const sampleRate = codecParts.length > 1 ? parseInt(codecParts[1]) : undefined;
              const backchannelKey = `${codec}-${sampleRate ?? 'default'}`;

              if (backchannelAdded.has(backchannelKey)) continue;

              const rtpInfo: RTPInfo = {
                codec: audioCodecStr,
                rate: sampleRate,
                encoding: codecParts.length > 2 ? parseInt(codecParts[2]) : undefined,
              };

              const sdpCodecInfo = sdpInfo.audio[codec];
              if (sdpCodecInfo) {
                if (sdpCodecInfo.clockRate && !rtpInfo.rate) {
                  rtpInfo.rate = sdpCodecInfo.clockRate;
                }
                if (sdpCodecInfo.channels && !rtpInfo.encoding) {
                  rtpInfo.encoding = sdpCodecInfo.channels;
                }
                if (sdpCodecInfo.payload) {
                  rtpInfo.payload = sdpCodecInfo.payload;
                }
              }

              const properties = getAudioCodecProperties(codec, rtpInfo);

              if (sdpCodecInfo?.fmtp && properties.fmtpInfo) {
                properties.fmtpInfo.config = sdpCodecInfo.fmtp;
              }

              const audioStreamInfo: AudioStreamInfo = {
                codec,
                ffmpegCodec,
                properties,
                direction: 'recvonly',
              };

              if (!audioStreamInfos.some((info) => isSameAudioStreamInfo(info, audioStreamInfo))) {
                audioStreamInfos.push(audioStreamInfo);
                backchannelAdded.add(backchannelKey);
              }
            }
          }
        }
      }
    }
  }

  return audioStreamInfos;
}

export function generateVideoStreamInfo(producers: Go2RTCProducer[]): VideoStreamInfo[] {
  const videoStreamInfos: VideoStreamInfo[] = [];

  const sdpInfo = extractSdpInfo(producers);

  for (const producer of producers) {
    if (producer.receivers?.length) {
      for (const receiver of producer.receivers) {
        if (receiver.codec?.codec_type === 'video') {
          const videoCodec = mapVideoCodecName(receiver.codec.codec_name);
          if (!videoCodec) continue;

          const { codec, ffmpegCodec } = normalizeVideoCodecs(videoCodec);

          const rtpInfo: RTPInfo = {
            codec: receiver.codec.codec_name,
            rate: 90000,
          };

          const sdpCodecInfo = sdpInfo.video[codec];

          if (sdpCodecInfo) {
            if (sdpCodecInfo.payload) {
              rtpInfo.payload = sdpCodecInfo.payload;
            }

            // For H.264/H.265, extract profile and level from profile-level-id; fall back to receiver data otherwise.
            if ((codec === 'H264' || codec === 'H265') && sdpCodecInfo.profileLevelId) {
              rtpInfo.profile = extractProfileFromProfileLevelId(sdpCodecInfo.profileLevelId);
              rtpInfo.level = extractLevelFromProfileLevelId(sdpCodecInfo.profileLevelId);
            } else {
              if (receiver.codec.profile) {
                rtpInfo.profile = receiver.codec.profile;
              }
              if (receiver.codec.level) {
                rtpInfo.level = receiver.codec.level;
              }
            }
          } else {
            if (receiver.codec.profile) {
              rtpInfo.profile = receiver.codec.profile;
            }
            if (receiver.codec.level) {
              rtpInfo.level = receiver.codec.level;
            }
          }

          const properties = getVideoCodecProperties(codec, rtpInfo);

          if (sdpCodecInfo?.fmtp) {
            if (!properties.fmtpInfo) {
              properties.fmtpInfo = {
                payload: rtpInfo.payload ?? properties.payloadType,
                config: sdpCodecInfo.fmtp,
              };
            } else {
              properties.fmtpInfo.config = sdpCodecInfo.fmtp;
            }
          } else if (codec === 'H264' && rtpInfo.profile && rtpInfo.level) {
            const profileLevelId = createProfileLevelId(rtpInfo.profile, rtpInfo.level);
            if (profileLevelId) {
              if (!properties.fmtpInfo) {
                properties.fmtpInfo = {
                  payload: rtpInfo.payload ?? properties.payloadType,
                  config: `packetization-mode=1;profile-level-id=${profileLevelId}`,
                };
              } else {
                properties.fmtpInfo.config = `packetization-mode=1;profile-level-id=${profileLevelId}`;
              }
            }
          }

          const videoStreamInfo: VideoStreamInfo = {
            codec,
            ffmpegCodec,
            properties,
            direction: 'sendonly',
          };

          if (!videoStreamInfos.some((info) => isSameVideoStreamInfo(info, videoStreamInfo))) {
            videoStreamInfos.push(videoStreamInfo);
          }
        }
      }
    }
  }

  // If receivers yielded nothing, fall back to medias.
  if (videoStreamInfos.length === 0) {
    for (const producer of producers) {
      if (producer.medias) {
        for (const media of producer.medias) {
          if (media.startsWith('video')) {
            const parts = media.split(', ');
            if (parts.length >= 3) {
              const videoCodecStr = parts[2].split('/')[0];

              const videoCodec = mapVideoCodecName(videoCodecStr);
              if (!videoCodec) continue;

              const { codec, ffmpegCodec } = normalizeVideoCodecs(videoCodec);

              const rtpInfo: RTPInfo = {
                codec: videoCodecStr,
                rate: 90000,
              };

              const sdpCodecInfo = sdpInfo.video[codec];
              if (sdpCodecInfo) {
                if (sdpCodecInfo.payload) {
                  rtpInfo.payload = sdpCodecInfo.payload;
                }

                if ((codec === 'H264' || codec === 'H265') && sdpCodecInfo.profileLevelId) {
                  rtpInfo.profile = extractProfileFromProfileLevelId(sdpCodecInfo.profileLevelId);
                  rtpInfo.level = extractLevelFromProfileLevelId(sdpCodecInfo.profileLevelId);
                }
              }

              const properties = getVideoCodecProperties(codec, rtpInfo);

              if (sdpCodecInfo?.fmtp) {
                if (!properties.fmtpInfo) {
                  properties.fmtpInfo = {
                    payload: rtpInfo.payload ?? properties.payloadType,
                    config: sdpCodecInfo.fmtp,
                  };
                } else {
                  properties.fmtpInfo.config = sdpCodecInfo.fmtp;
                }
              }

              const videoStreamInfo: VideoStreamInfo = {
                codec,
                ffmpegCodec,
                properties,
                direction: 'sendonly',
              };

              if (!videoStreamInfos.some((info) => isSameVideoStreamInfo(info, videoStreamInfo))) {
                videoStreamInfos.push(videoStreamInfo);
              }
            }
          }
        }
      }
    }
  }

  return videoStreamInfos;
}
