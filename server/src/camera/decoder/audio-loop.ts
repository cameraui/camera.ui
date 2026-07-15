import { sleep } from '@camera.ui/common/utils';

import { isAudioModelSpec } from './plugin-registry.js';
import { ReconnectBackoff } from './reconnect-backoff.js';
import { AudioSource } from './sources/audio-source.js';

import type { Logger } from '@camera.ui/common/logger';
import type { AudioFrameData, AudioResult } from '@camera.ui/sdk';
import type { RegisteredPlugin } from './plugin-registry.js';
import type { AudioSourceConfig } from './sources/audio-source.js';

interface AudioLoopHooks {
  cameraId: string;
  getPlugin: () => RegisteredPlugin | undefined;
  getStreamUrl: () => string;
  getMinDecibels: () => number;
  onResult: (sensorId: string, result: AudioResult) => void;
}

function calculateDBFS(data: Buffer, format: 'pcm16' | 'float32'): number {
  let sumSquares = 0;
  let sampleCount = 0;

  if (format === 'float32') {
    const floatView = new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    sampleCount = floatView.length;
    for (let i = 0; i < sampleCount; i++) sumSquares += floatView[i] * floatView[i];
  } else {
    // PCM16: normalize [-32768, 32767] → [-1.0, 1.0]
    const int16View = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
    sampleCount = int16View.length;
    for (let i = 0; i < sampleCount; i++) {
      const normalized = int16View[i] / 32768;
      sumSquares += normalized * normalized;
    }
  }

  if (sampleCount === 0) return -100;

  const rms = Math.sqrt(sumSquares / sampleCount);
  return rms > 0 ? 20 * Math.log10(Math.max(rms, 1e-10)) : -100;
}

export class AudioDetectionLoop {
  private running = false;
  private loopPromise?: Promise<void>;
  private stopPromise?: Promise<void>;
  private readonly backoff = new ReconnectBackoff();
  private source?: AudioSource;

  constructor(
    private readonly hooks: AudioLoopHooks,
    private readonly logger: Logger,
  ) {}

  public start(): void {
    if (this.running || this.stopPromise) return;

    this.logger.debug('Starting audio detection loop');
    this.running = true;
    this.backoff.reset();
    this.loopPromise = this.run();
  }

  public async stop(): Promise<void> {
    if (!this.running) {
      if (this.stopPromise) await this.stopPromise;
      return;
    }

    this.logger.debug('Stopping audio detection loop');
    this.running = false;

    const doStop = async () => {
      await this.source?.stop();
      await this.loopPromise;
      this.loopPromise = undefined;
    };

    this.stopPromise = doStop();
    try {
      await this.stopPromise;
    } finally {
      this.stopPromise = undefined;
    }
  }

  public async waitForStop(): Promise<void> {
    if (this.stopPromise) await this.stopPromise;
  }

  private async run(): Promise<void> {
    const audioPlugin = this.hooks.getPlugin();
    if (!audioPlugin?.requiresFrames) return;

    const audioSpec = isAudioModelSpec(audioPlugin.modelSpec) ? audioPlugin.modelSpec : undefined;
    const sampleRate = audioSpec?.input.sampleRate ?? 16000;
    const channels = audioSpec?.input.channels ?? 1;
    const format = audioSpec?.input.format ?? 'float32';
    const samplesPerFrame = audioSpec?.input.samplesPerFrame;

    const audioConfig: AudioSourceConfig = {
      streamUrl: this.hooks.getStreamUrl(),
      sampleRate,
      channels,
      format,
      samplesPerFrame,
    };

    while (this.running) {
      try {
        this.source = new AudioSource(audioConfig, this.logger);
        await this.source.start();

        this.logger.debug('Audio stream connected, processing audio frames...');
        this.backoff.reset();

        let frameCount = 0;
        let lastAudioFrameId = -1;

        while (this.running) {
          const snap = await this.source.nextFrame(lastAudioFrameId);
          if (!snap) break; // source ended (stop or EOF)
          lastAudioFrameId = snap.id;
          const rawFrame = snap.frame;
          frameCount++;

          try {
            const frameData = rawFrame.data;
            if (!frameData?.[0]) continue;

            const rawData = frameData[0];
            const dBFS = calculateDBFS(rawData, format);
            if (dBFS < this.hooks.getMinDecibels()) continue;

            const audioFrame: AudioFrameData = {
              cameraId: this.hooks.cameraId,
              data: rawData,
              sampleRate,
              channels,
              format,
              timestamp: Date.now(),
            };

            const result = await audioPlugin.proxy.detectAudio(audioFrame);
            if (!result) continue;

            this.hooks.onResult(audioPlugin.sensorId, result);
          } catch (error) {
            this.logger.error('Audio detection error:', error);
          } finally {
            try {
              rawFrame[Symbol.dispose]?.();
            } catch {
              // best-effort
            }
          }
        }

        const streamError = this.source.lastError;
        await this.source.stop();

        if (this.running && streamError) {
          const delay = this.backoff.nextDelayMs();
          this.logger.warn(`Audio stream ended with read error, reconnecting in ${delay / 1000}s: ${streamError.message}`);
          await sleep(delay);
        } else if (this.running && frameCount === 0) {
          this.logger.debug('Audio stream ended without frames, waiting before reconnect...');
          await sleep(this.backoff.idleDelayMs);
        }
      } catch (error: any) {
        if (!this.running) break;

        await this.source?.stop();

        const delay = this.backoff.nextDelayMs();
        this.logger.warn(`Audio stream error, reconnecting in ${delay / 1000}s: ${error.message}`);
        await sleep(delay);
      }
    }

    await this.source?.stop();
    this.source = undefined;
    this.logger.debug('Audio detection loop ended');
  }
}
