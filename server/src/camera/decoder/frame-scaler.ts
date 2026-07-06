import { Scaler } from 'node-av/api';

import type { Logger } from '@camera.ui/common/logger';
import type { Detection, VideoFrameData, VideoInputSpec } from '@camera.ui/sdk';
import type { HardwareContext, ScalerCrop } from 'node-av/api';
import type { Frame } from 'node-av/lib';
import type { CroppedRegion } from '../../rpc/interfaces/detection.js';

type ScaledFormat = 'rgb' | 'nv12' | 'gray';

export interface JpegCrop {
  index: number;
  jpeg: Buffer;
}

export interface ConsumerSpec {
  key: string;
  triggerLabels: string[];
  input: VideoInputSpec;
}

export interface ScaleTarget {
  key: string;
  width: number;
  height: number;
  format: ScaledFormat;
}

export interface ScaledFrame {
  data: Buffer;
  width: number;
  height: number;
  format: ScaledFormat;
}

export class FrameScaler {
  private readonly MIN_THUMBNAIL_CROP = 64;

  private scaler?: Scaler;

  constructor(
    private hardwareContext?: HardwareContext | null,
    private logger?: Logger,
  ) {}

  public async scale(frame: Frame, targetWidth: number, targetHeight: number, format: ScaledFormat = 'rgb'): Promise<ScaledFrame | null> {
    if (targetWidth < 2 || targetHeight < 2) return null;
    const data = await this.getScaler().toBuffer(frame, { resize: { width: targetWidth, height: targetHeight }, format });
    return { data, width: targetWidth, height: targetHeight, format };
  }

  public async scaleToSpec(frame: Frame, spec: VideoInputSpec): Promise<ScaledFrame | null> {
    return this.scale(frame, spec.width, spec.height, spec.format);
  }

  public async scaleProportional(frame: Frame, maxWidth: number, format: ScaledFormat = 'gray'): Promise<ScaledFrame | null> {
    const { width, height } = this.proportionalSize(frame.width, frame.height, maxWidth);
    return this.scale(frame, width, height, format);
  }

  public toVideoFrameData(scaled: ScaledFrame, id = 'scaled'): VideoFrameData {
    return {
      id,
      data: scaled.data,
      width: scaled.width,
      height: scaled.height,
      format: scaled.format,
    };
  }

  public async cropToJPEG(
    frame: Frame,
    detections: Detection[],
    options: { maxWidth?: number; quality?: number; padding?: number; minCrop?: number } = {},
  ): Promise<JpegCrop[]> {
    const { maxWidth = 320, quality = 90, padding = 0.15, minCrop = this.MIN_THUMBNAIL_CROP } = options;
    const results: JpegCrop[] = [];

    for (const [index, detection] of detections.entries()) {
      const crop = this.paddedCrop(detection.box, frame.width, frame.height, padding, minCrop);
      if (!crop) continue;

      const resize = this.scaledSize(crop.width, crop.height, maxWidth);
      try {
        const jpeg = await this.getScaler().toJpeg(frame, { crop, resize, quality });
        results.push({ index, jpeg });
      } catch (error) {
        this.logger?.debug(`Thumbnail crop failed for ${detection.label}: ${error}`);
      }
    }

    return results;
  }

  public async frameToJPEG(frame: Frame, maxWidth = 320, quality = 90): Promise<Buffer | null> {
    if (frame.width < 2 || frame.height < 2) return null;
    const resize = this.scaledSize(frame.width, frame.height, maxWidth);
    if (resize.width < 2 || resize.height < 2) return null;
    try {
      return await this.getScaler().toJpeg(frame, { resize, quality });
    } catch (error) {
      this.logger?.debug(`Full-frame JPEG failed: ${error}`);
      return null;
    }
  }

  public async cropAndScaleMulti(frame: Frame, detection: Detection, targets: ScaleTarget[], padding = 0.1): Promise<Map<string, CroppedRegion>> {
    const results = new Map<string, CroppedRegion>();
    if (targets.length === 0) return results;

    const crop = this.paddedCrop(detection.box, frame.width, frame.height, padding, 0, 32);
    if (!crop) return results;

    const meta = {
      detection,
      offset: { x: crop.x, y: crop.y },
      cropSize: { width: crop.width, height: crop.height },
      originalSize: { width: frame.width, height: frame.height },
    };

    const scaler = this.getScaler();
    for (const t of targets) {
      const data = await scaler.toBuffer(frame, { crop, resize: { width: t.width, height: t.height }, format: t.format });
      results.set(t.key, {
        frame: { id: `crop:${detection.label}:${t.key}`, data, width: t.width, height: t.height, format: t.format },
        ...meta,
      });
    }

    return results;
  }

  public clearCache(): void {
    this.scaler?.[Symbol.dispose]();
    this.scaler = undefined;
  }

  public updateHardwareContext(context: HardwareContext | null | undefined): void {
    if (this.hardwareContext !== context) {
      this.clearCache();
      this.hardwareContext = context;
    }
  }

  public dispose(): void {
    this.clearCache();
  }

  private paddedCrop(
    box: { x: number; y: number; width: number; height: number },
    frameWidth: number,
    frameHeight: number,
    padding: number,
    minCrop: number,
    minValid = 2,
  ): ScalerCrop | null {
    const x = Math.floor(box.x * frameWidth);
    const y = Math.floor(box.y * frameHeight);
    const w = Math.floor(box.width * frameWidth);
    const h = Math.floor(box.height * frameHeight);

    const extraPadX = minCrop > 0 ? Math.max(0, Math.ceil((minCrop - w) / 2)) : 0;
    const extraPadY = minCrop > 0 ? Math.max(0, Math.ceil((minCrop - h) / 2)) : 0;
    const padX = Math.floor(w * padding) + extraPadX;
    const padY = Math.floor(h * padding) + extraPadY;

    const cropX = Math.max(0, x - padX);
    const cropY = Math.max(0, y - padY);
    const cropW = Math.min(frameWidth - cropX, w + 2 * padX);
    const cropH = Math.min(frameHeight - cropY, h + 2 * padY);

    if (cropW < minValid || cropH < minValid) return null;
    return { x: cropX, y: cropY, width: cropW, height: cropH };
  }

  // Scale proportionally to maxWidth (never upscale), even dimensions.
  private scaledSize(width: number, height: number, maxWidth: number): { width: number; height: number } {
    const scaleW = width > maxWidth ? maxWidth : width & ~1;
    const scaleH = width > maxWidth ? Math.round((height * maxWidth) / width) & ~1 : height & ~1;
    return { width: scaleW, height: scaleH };
  }

  private proportionalSize(frameWidth: number, frameHeight: number, maxWidth: number): { width: number; height: number } {
    if (frameWidth <= maxWidth) {
      return { width: frameWidth & ~1, height: frameHeight & ~1 };
    }
    const scale = maxWidth / frameWidth;
    return { width: maxWidth & ~1, height: Math.round(frameHeight * scale) & ~1 };
  }

  private getScaler(): Scaler {
    this.scaler ??= new Scaler(this.hardwareContext ? { hardware: this.hardwareContext } : {});
    return this.scaler;
  }
}
