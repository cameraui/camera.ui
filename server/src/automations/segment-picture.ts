import { hasInterface, PluginInterface } from '@camera.ui/sdk';
import { Scaler } from 'node-av/api';

import { iou } from '../camera/decoder/detection-window.js';
import { withPicture } from '../utils/image.js';

import type { BoundingBox, ImageMetadata, ObjectDetectionPluginResponse, PluginContract, SegmentationImage, SegmentationPluginResponse } from '@camera.ui/sdk';
import type { Frame } from 'node-av/lib';

const LABELS = new Set(['person', 'vehicle', 'animal']);
const MIN_CONFIDENCE = 0.5;
const MAX_OBJECTS = 8;
const NMS_IOU = 0.45;
const REGION_PADDING = 0.15;
const REGION_MAX_EDGE = 640;
const JPEG_QUALITY = 92;
const WHOLE_PICTURE: BoundingBox = { x: 0, y: 0, width: 1, height: 1 };

export interface SegmentedObject {
  label?: string;
  confidence?: number;
  box: BoundingBox;
  outline: BoundingBox;
}

export interface SegmentedPicture {
  detected: boolean;
  detections: SegmentedObject[];
}

export interface SegmentingPlugin {
  testObjectDetection?(imageData: Buffer, metadata: ImageMetadata, config: Record<string, unknown>): Promise<ObjectDetectionPluginResponse | undefined>;
  segmentImages?(images: SegmentationImage[], config?: Record<string, unknown>): Promise<(SegmentationPluginResponse | undefined)[]>;
}

interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function segmentPicture(
  plugin: SegmentingPlugin,
  contract: PluginContract | undefined,
  picture: Buffer,
  config: Record<string, unknown>,
): Promise<SegmentedPicture> {
  if (!picture?.length) throw new Error('A picture is needed');
  const detections = await withPicture(picture, async (frame) => {
    const objects = contract && hasInterface(contract, PluginInterface.ObjectDetection) ? await objectsIn(plugin, picture, frame) : [{ box: WHOLE_PICTURE }];
    return await outline(plugin, frame, objects, config);
  });
  if (!detections) throw new Error('The picture could not be read');
  return { detected: detections.length > 0, detections };
}

async function objectsIn(plugin: SegmentingPlugin, picture: Buffer, frame: Frame): Promise<Omit<SegmentedObject, 'outline'>[]> {
  const response = await plugin.testObjectDetection?.(picture, { width: frame.width, height: frame.height }, {});
  const candidates = (response?.detections ?? [])
    .filter((d) => d.box && LABELS.has(d.label.toLowerCase()) && d.confidence >= MIN_CONFIDENCE)
    .map((d) => ({ label: d.label.toLowerCase(), confidence: d.confidence, box: d.box }))
    .sort((a, b) => b.confidence - a.confidence);
  const kept: typeof candidates = [];
  for (const candidate of candidates) {
    if (kept.every((k) => k.label !== candidate.label || iou(k.box, candidate.box) <= NMS_IOU)) kept.push(candidate);
  }
  return kept.slice(0, MAX_OBJECTS);
}

async function outline(plugin: SegmentingPlugin, frame: Frame, objects: Omit<SegmentedObject, 'outline'>[], config: Record<string, unknown>): Promise<SegmentedObject[]> {
  using scaler = new Scaler();
  const sent: { object: Omit<SegmentedObject, 'outline'>; region: Region }[] = [];
  const images: SegmentationImage[] = [];
  for (const object of objects) {
    const region = regionAround(object.box, frame.width, frame.height);
    if (!region) continue;
    const scale = Math.min(1, REGION_MAX_EDGE / Math.max(region.width, region.height));
    const resize = { width: Math.max(2, Math.round(region.width * scale) & ~1), height: Math.max(2, Math.round(region.height * scale) & ~1) };
    const image = await scaler.toJpeg(frame, { crop: region, resize, quality: JPEG_QUALITY });
    images.push({ image, box: boxInRegion(object.box, region, frame.width, frame.height) });
    sent.push({ object, region });
  }
  if (!images.length) return [];

  const results = (await plugin.segmentImages?.(images, config)) ?? [];
  const outlined: SegmentedObject[] = [];
  sent.forEach(({ object, region }, i) => {
    const mask = results[i]?.mask;
    if (mask) outlined.push({ ...object, outline: boxInPicture(mask.box, region, frame.width, frame.height) });
  });
  return outlined;
}

function regionAround(box: BoundingBox, width: number, height: number): Region | undefined {
  const padX = box.width * width * REGION_PADDING;
  const padY = box.height * height * REGION_PADDING;
  const side = Math.min(Math.max(box.width * width + 2 * padX, box.height * height + 2 * padY), width, height) & ~1;
  if (side < 2) return undefined;
  const cx = (box.x + box.width / 2) * width;
  const cy = (box.y + box.height / 2) * height;
  const x = Math.min(Math.max(Math.round(cx - side / 2), 0), width - side) & ~1;
  const y = Math.min(Math.max(Math.round(cy - side / 2), 0), height - side) & ~1;
  return { x, y, width: side, height: side };
}

function boxInRegion(box: BoundingBox, region: Region, width: number, height: number): BoundingBox {
  return {
    x: (box.x * width - region.x) / region.width,
    y: (box.y * height - region.y) / region.height,
    width: (box.width * width) / region.width,
    height: (box.height * height) / region.height,
  };
}

function boxInPicture(box: BoundingBox, region: Region, width: number, height: number): BoundingBox {
  return {
    x: (region.x + box.x * region.width) / width,
    y: (region.y + box.y * region.height) / height,
    width: (box.width * region.width) / width,
    height: (box.height * region.height) / height,
  };
}
