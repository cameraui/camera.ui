import { Scaler } from 'node-av/api';
import { SWS_AREA, SWS_BICUBIC } from 'node-av/constants';
import { Frame } from 'node-av/lib';

import { PrivacyMask } from '../privacy/mask.js';

import type { Logger } from '@camera.ui/common/logger';
import type { Detection, VideoFrameData, VideoInputSpec } from '@camera.ui/sdk';
import type { HardwareContext, ScalerCrop } from 'node-av/api';
import type { CroppedRegion } from '../../rpc/interfaces/detection.js';

type ScaledFormat = 'rgb' | 'nv12' | 'gray';

export interface JpegCrop {
  index: number;
  jpeg: Buffer;
}

export type CropFit = 'stretch' | 'expand';

export interface ConsumerSpec {
  key: string;
  triggerLabels: string[];
  input: VideoInputSpec;
  fit: CropFit;
}

export interface ScaleTarget {
  key: string;
  width: number;
  height: number;
  format: ScaledFormat;
  fit?: CropFit;
}

export interface ScaledFrame {
  data: Buffer;
  width: number;
  height: number;
  format: ScaledFormat;
}

export interface LetterboxGeometry {
  padX: number;
  padY: number;
  innerWidth: number;
  innerHeight: number;
  targetWidth: number;
  targetHeight: number;
  window?: { x: number; y: number; width: number; height: number };
}

export interface LetterboxedFrame {
  padded: ScaledFrame;
  inner: ScaledFrame;
  geometry: LetterboxGeometry;
}

const LETTERBOX_FILL = 114;

export class FrameScaler {
  private readonly MIN_THUMBNAIL_CROP = 64;

  private downScaler?: Scaler;
  private upScaler?: Scaler;
  private privacy: PrivacyMask;
  private maskedFrame?: { pts: bigint; width: number; height: number; revision: number; frame: Frame };

  constructor(
    private hardwareContext?: HardwareContext | null,
    private logger?: Logger,
    privacy?: PrivacyMask,
  ) {
    this.privacy = privacy ?? new PrivacyMask(logger);
  }

  public async scale(frame: Frame, targetWidth: number, targetHeight: number, format: ScaledFormat = 'rgb'): Promise<ScaledFrame | null> {
    if (targetWidth < 2 || targetHeight < 2) return null;
    const scaler = this.getScaler(frame.width, targetWidth);
    const data = await scaler.toBuffer(frame, { resize: { width: targetWidth, height: targetHeight }, format });
    return { data, width: targetWidth, height: targetHeight, format };
  }

  public async scaleToSpec(frame: Frame, spec: VideoInputSpec): Promise<ScaledFrame | null> {
    return this.scale(frame, spec.width, spec.height, spec.format);
  }

  public async letterboxToSpec(frame: Frame, spec: VideoInputSpec): Promise<LetterboxedFrame | null> {
    // nv12 is semi-planar, padding it row by row would tear the chroma plane apart
    if (spec.format === 'nv12') {
      const stretched = await this.scaleToSpec(frame, spec);
      return stretched ? { padded: stretched, inner: stretched, geometry: this.identityGeometry(spec) } : null;
    }

    const ratio = Math.min(spec.width / frame.width, spec.height / frame.height);
    const innerWidth = Math.max(2, Math.round((frame.width * ratio) / 2) * 2);
    const innerHeight = Math.max(2, Math.round((frame.height * ratio) / 2) * 2);

    const inner = await this.scale(frame, Math.min(innerWidth, spec.width), Math.min(innerHeight, spec.height), spec.format);
    if (!inner) return null;

    const geometry: LetterboxGeometry = {
      padX: Math.floor((spec.width - inner.width) / 2),
      padY: Math.floor((spec.height - inner.height) / 2),
      innerWidth: inner.width,
      innerHeight: inner.height,
      targetWidth: spec.width,
      targetHeight: spec.height,
    };

    if (geometry.padX === 0 && geometry.padY === 0 && inner.width === spec.width && inner.height === spec.height) {
      return { padded: inner, inner, geometry };
    }

    const channels = spec.format === 'gray' ? 1 : 3;
    const data = Buffer.alloc(spec.width * spec.height * channels, LETTERBOX_FILL);
    const rowBytes = inner.width * channels;

    for (let y = 0; y < inner.height; y++) {
      const target = ((geometry.padY + y) * spec.width + geometry.padX) * channels;
      inner.data.copy(data, target, y * rowBytes, (y + 1) * rowBytes);
    }

    return { padded: { data, width: spec.width, height: spec.height, format: spec.format }, inner, geometry };
  }

  public static undoLetterbox(detections: Detection[], geometry: LetterboxGeometry): Detection[] {
    const identity = geometry.padX === 0 && geometry.padY === 0 && geometry.innerWidth === geometry.targetWidth && geometry.innerHeight === geometry.targetHeight;
    if (identity && !geometry.window) {
      return detections;
    }

    const clamp = (value: number): number => Math.min(1, Math.max(0, value));
    const window = geometry.window ?? { x: 0, y: 0, width: 1, height: 1 };

    return detections.map((detection) => {
      const cropX = clamp((detection.box.x * geometry.targetWidth - geometry.padX) / geometry.innerWidth);
      const cropY = clamp((detection.box.y * geometry.targetHeight - geometry.padY) / geometry.innerHeight);
      const cropWidth = clamp((detection.box.width * geometry.targetWidth) / geometry.innerWidth);
      const cropHeight = clamp((detection.box.height * geometry.targetHeight) / geometry.innerHeight);

      const x = clamp(window.x + cropX * window.width);
      const y = clamp(window.y + cropY * window.height);
      const width = Math.min(cropWidth * window.width, 1 - x);
      const height = Math.min(cropHeight * window.height, 1 - y);

      return { ...detection, box: { x, y, width, height } };
    });
  }

  public async cropToSpec(frame: Frame, window: { x: number; y: number; width: number; height: number }, spec: VideoInputSpec): Promise<LetterboxedFrame | null> {
    const crop = this.quantizeCrop(
      {
        x: Math.round(window.x * frame.width),
        y: Math.round(window.y * frame.height),
        width: Math.round(window.width * frame.width),
        height: Math.round(window.height * frame.height),
      },
      frame.width,
      frame.height,
      2,
    );

    const scaler = this.getScaler(crop.width, spec.width);
    const data = await scaler.toBuffer(frame, { crop, resize: { width: spec.width, height: spec.height }, format: spec.format });
    const scaled: ScaledFrame = { data, width: spec.width, height: spec.height, format: spec.format };

    return {
      padded: scaled,
      inner: scaled,
      geometry: {
        ...this.identityGeometry(spec),
        window: {
          x: crop.x / frame.width,
          y: crop.y / frame.height,
          width: crop.width / frame.width,
          height: crop.height / frame.height,
        },
      },
    };
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
        const jpeg = await this.encodeJpeg(frame, { crop, resize, quality });
        if (jpeg) results.push({ index, jpeg });
      } catch (error) {
        this.logger?.debug(`Thumbnail crop failed for ${detection.label}: ${error}`);
      }
    }

    return results;
  }

  public async cropWindowToJPEG(frame: Frame, crop: ScalerCrop, width: number, height: number, quality: number): Promise<Buffer | null> {
    try {
      return await this.encodeJpeg(frame, { crop, resize: { width, height }, quality });
    } catch (error) {
      this.logger?.debug(
        // eslint-disable-next-line @stylistic/max-len
        `Moment crop failed: ${error} (frame=${frame.width}x${frame.height} pts=${frame.pts} hw=${frame.isHwFrame()} crop=${crop.x},${crop.y},${crop.width}x${crop.height} out=${width}x${height})`,
      );
      return null;
    }
  }

  public async frameToJPEG(frame: Frame, maxWidth = 320, quality = 90): Promise<Buffer | null> {
    if (frame.width < 2 || frame.height < 2) return null;
    const resize = this.scaledSize(frame.width, frame.height, maxWidth);
    if (resize.width < 2 || resize.height < 2) return null;
    try {
      return await this.encodeJpeg(frame, { resize, quality });
    } catch (error) {
      this.logger?.debug(`Full-frame JPEG failed: ${error}`);
      return null;
    }
  }

  public async cropAndScaleMulti(frame: Frame, detection: Detection, targets: ScaleTarget[], padding = 0.1): Promise<Map<string, CroppedRegion>> {
    const results = new Map<string, CroppedRegion>();
    if (targets.length === 0) return results;

    const baseCrop = this.paddedCrop(detection.box, frame.width, frame.height, padding, 0, 32);
    if (!baseCrop) return results;

    for (const t of targets) {
      const fitted = t.fit === 'expand' ? this.expandCropToAspect(baseCrop, frame.width, frame.height, t.width / t.height) : baseCrop;
      const crop = this.quantizeCrop(fitted, frame.width, frame.height);
      const scaler = this.getScaler(crop.width, t.width);
      const data = await scaler.toBuffer(frame, { crop, resize: { width: t.width, height: t.height }, format: t.format });
      results.set(t.key, {
        frame: { id: `crop:${detection.label}:${t.key}`, data, width: t.width, height: t.height, format: t.format },
        detection,
        offset: { x: crop.x, y: crop.y },
        cropSize: { width: crop.width, height: crop.height },
        originalSize: { width: frame.width, height: frame.height },
      });
    }

    return results;
  }

  private async encodeJpeg(frame: Frame, options: { crop?: ScalerCrop; resize: { width: number; height: number }; quality: number }): Promise<Buffer | null> {
    const region = options.crop ?? { x: 0, y: 0, width: frame.width, height: frame.height };
    const scaler = this.getScaler(region.width, options.resize.width);

    if (!this.privacy.active) return scaler.toJpeg(frame, options);

    // a picture that would be black end to end is not worth encoding
    if (this.privacy.covers(region, frame.width, frame.height)) return null;

    if (frame.isSwFrame()) {
      if (!this.privacy.apply(frame)) return this.unmaskedFallback(frame, options);
      return scaler.toJpeg(frame, options);
    }

    const masked = await this.maskedCopy(frame);
    if (!masked) return this.unmaskedFallback(frame, options);
    return scaler.toJpeg(masked, options);
  }

  private async maskedCopy(frame: Frame): Promise<Frame | null> {
    const cached = this.maskedFrame;
    if (cached?.pts === frame.pts && cached?.width === frame.width && cached?.height === frame.height && cached?.revision === this.privacy.revision) {
      return cached.frame;
    }

    const sw = new Frame();
    sw.alloc();
    const ret = await frame.hwframeTransferData(sw);
    if (ret >= 0) {
      sw.copyProps(frame);
      if (sw.timeBase.num === 0 || sw.timeBase.den === 0) sw.timeBase = { num: 1, den: 90_000 };
    }
    if (ret < 0 || !this.privacy.apply(sw)) {
      sw.free();
      return null;
    }

    cached?.frame.free();
    this.maskedFrame = { pts: frame.pts, width: frame.width, height: frame.height, revision: this.privacy.revision, frame: sw };
    return sw;
  }

  private async unmaskedFallback(frame: Frame, options: { crop?: ScalerCrop; resize: { width: number; height: number }; quality: number }): Promise<Buffer | null> {
    if (this.privacy.reportFailure() === 'drop') return null;
    const region = options.crop ?? { x: 0, y: 0, width: frame.width, height: frame.height };
    return this.getScaler(region.width, options.resize.width).toJpeg(frame, options);
  }

  public clearCache(): void {
    this.downScaler?.[Symbol.dispose]();
    this.upScaler?.[Symbol.dispose]();
    this.downScaler = undefined;
    this.upScaler = undefined;
    this.maskedFrame?.frame.free();
    this.maskedFrame = undefined;
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

  private expandCropToAspect(crop: ScalerCrop, frameWidth: number, frameHeight: number, aspect: number): ScalerCrop {
    let { x, y, width, height } = crop;

    if (width / height < aspect) {
      const grow = Math.round(height * aspect) - width;
      x -= Math.floor(grow / 2);
      width += grow;
    } else {
      const grow = Math.round(width / aspect) - height;
      y -= Math.floor(grow / 2);
      height += grow;
    }

    x = Math.max(0, Math.min(x, frameWidth - width));
    y = Math.max(0, Math.min(y, frameHeight - height));
    width = Math.min(width, frameWidth - x);
    height = Math.min(height, frameHeight - y);

    return { x, y, width, height };
  }

  private quantizeCrop(crop: ScalerCrop, frameWidth: number, frameHeight: number, grid = 32): ScalerCrop {
    const width = Math.min(frameWidth, Math.ceil(crop.width / grid) * grid);
    const height = Math.min(frameHeight, Math.ceil(crop.height / grid) * grid);
    const x = Math.max(0, Math.min(crop.x - Math.floor((width - crop.width) / 2), frameWidth - width));
    const y = Math.max(0, Math.min(crop.y - Math.floor((height - crop.height) / 2), frameHeight - height));
    return { x, y, width, height };
  }

  private identityGeometry(spec: VideoInputSpec): LetterboxGeometry {
    return { padX: 0, padY: 0, innerWidth: spec.width, innerHeight: spec.height, targetWidth: spec.width, targetHeight: spec.height };
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

  private getScaler(sourceWidth = 0, targetWidth = 0): Scaler {
    const hardware = this.hardwareContext ? { hardware: this.hardwareContext } : {};
    if (targetWidth > sourceWidth) {
      this.upScaler ??= new Scaler({ ...hardware, flags: SWS_BICUBIC });
      return this.upScaler;
    }
    this.downScaler ??= new Scaler({ ...hardware, flags: SWS_AREA });
    return this.downScaler;
  }
}
