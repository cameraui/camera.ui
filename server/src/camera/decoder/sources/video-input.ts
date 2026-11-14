import { Demuxer, FilterAPI, FilterPreset } from 'node-av/api';
import { AV_HWDEVICE_TYPE_OPENCL, FF_THREAD_SLICE } from 'node-av/constants';
import { availableParallelism } from 'node:os';

import { acquireHardwareContext } from '../hardware.js';

import type { Logger } from '@camera.ui/common/logger';
import type { FrameWorkerDecoderSettings } from '@camera.ui/sdk';
import type { HardwareContext } from 'node-av/api';
import type { CodecContext, Stream } from 'node-av/lib';

// go2rtc answers the RTSP keepalive every 55 s, so only a dead go2rtc trips this
export const RTSP_READ_TIMEOUT_US = 60_000_000;

const FALLBACK_FPS = 20;
const MAX_LOW_DELAY_FRAME_THREADS = 4;

export interface VideoInputOptions {
  decoder?: FrameWorkerDecoderSettings;
  hardwareContext?: HardwareContext | null;
  signal?: AbortSignal;
}

export interface VideoInput {
  input: Demuxer;
  videoStream: Stream;
  hardwareContext: HardwareContext | null;
  fps: number;
}

export async function openVideoInput(url: string, logger: Logger, options: VideoInputOptions = {}): Promise<VideoInput> {
  const input = await Demuxer.open(url, {
    options: {
      timeout: RTSP_READ_TIMEOUT_US,
      rtsp_transport: 'tcp',
      user_agent: 'camera.ui Decoder',
      avioflags: 'direct',
    },
    signal: options.signal,
  });

  const videoStream = input.video();
  if (!videoStream) {
    try {
      await input[Symbol.asyncDispose]();
    } catch {
      // ignore
    }
    throw new Error('No video stream found');
  }

  return {
    input,
    videoStream,
    hardwareContext: options.hardwareContext ?? acquireHardware(logger, options.decoder),
    fps: resolveFps(videoStream),
  };
}

export function createFrameFilter(hardwareContext: HardwareContext | null, fps: number): FilterAPI {
  let chain = FilterPreset.chain(hardwareContext).filter('setpts', { expr: `N/(${fps}*TB)` });

  if (hardwareContext?.deviceType === AV_HWDEVICE_TYPE_OPENCL) {
    chain = chain.hwupload();
  }

  return FilterAPI.create(chain.build(), { hardware: hardwareContext });
}

export function configureLowDelayDecoder(context: CodecContext): void {
  if (context.hwDeviceCtx) {
    context.threadType = FF_THREAD_SLICE;
    return;
  }

  const cpus = availableParallelism();
  context.threadCount = cpus > 1 ? Math.min(cpus + 1, MAX_LOW_DELAY_FRAME_THREADS) : 1;
}

function acquireHardware(logger: Logger, decoder?: FrameWorkerDecoderSettings): HardwareContext | null {
  const context = acquireHardwareContext(decoder, logger);

  if (context) {
    logger.debug('Using hardware acceleration:', context.deviceTypeName);
  } else if (decoder?.hardware === 'cpu') {
    logger.debug('Software decoding (configured)');
  } else {
    logger.warn('No hardware acceleration available, using software decoding');
  }

  return context;
}

function resolveFps(videoStream: Stream): number {
  const fps = videoStream.avgFrameRate.num / videoStream.avgFrameRate.den;
  return Number.isFinite(fps) && fps > 0 ? fps : FALLBACK_FPS;
}
