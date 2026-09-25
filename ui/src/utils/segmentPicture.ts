import { boxInCrop, boxInFrame, cropRect, nms } from '@camera.ui/nvr';
import { hasInterface, PluginInterface } from '@camera.ui/sdk';

import type { PixelRect } from '@camera.ui/nvr';
import type { Promisify } from '@camera.ui/rpc';
import type { BasePlugin, BoundingBox, ObjectMask, PluginContract, PluginInterfaces, SegmentationImage } from '@camera.ui/sdk';

export interface SegmentedObject {
  label?: string;
  confidence?: number;
  box: BoundingBox;
  mask?: ObjectMask;
}

type Plugin = Promisify<BasePlugin & PluginInterfaces>;

const LABELS = new Set(['person', 'vehicle', 'animal']);
const MIN_CONFIDENCE = 0.5;
const MAX_OBJECTS = 8;
const NMS_IOU = 0.45;
const REGION_PADDING = 0.15;
const REGION_MAX_EDGE = 640;

export async function segmentPicture(file: Blob, plugin: Plugin, contract: PluginContract | undefined, config: Record<string, unknown>): Promise<SegmentedObject[]> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const objects: SegmentedObject[] =
      contract && hasInterface(contract, PluginInterface.ObjectDetection) ? await detect(file, bitmap, plugin) : [{ box: { x: 0, y: 0, width: 1, height: 1 } }];

    const sent = objects.flatMap((object) => {
      const region = cropRect(object.box, width, height, REGION_PADDING, 1);
      return region ? [{ object, region }] : [];
    });
    const images = await Promise.all(
      sent.map(async ({ object, region }): Promise<SegmentationImage> => ({
        image: await encode(bitmap, region),
        box: boxInCrop(object.box, region, width, height),
      })),
    );
    const results = images.length ? await plugin.segmentImages?.(images, config) : undefined;

    results?.forEach((result, i) => {
      const mask = result?.mask;
      const { object, region } = sent[i] ?? {};
      if (!mask || !object || !region || mask.data.length < mask.width * mask.height) return;
      object.mask = { ...mask, box: boxInFrame(mask.box, region, width, height) };
    });
    return objects;
  } finally {
    bitmap.close();
  }
}

async function detect(file: Blob, bitmap: ImageBitmap, plugin: Plugin): Promise<SegmentedObject[]> {
  const response = await plugin.testObjectDetection?.(new Uint8Array(await file.arrayBuffer()), { width: bitmap.width, height: bitmap.height }, {});
  const candidates = (response?.detections ?? [])
    .map((d) => ({ label: d.label.toLowerCase(), confidence: d.confidence, box: d.box }))
    .filter((d) => LABELS.has(d.label) && d.confidence >= MIN_CONFIDENCE && d.box);
  return nms(candidates, NMS_IOU).slice(0, MAX_OBJECTS);
}

async function encode(bitmap: ImageBitmap, region: PixelRect): Promise<Uint8Array> {
  const scale = Math.min(1, REGION_MAX_EDGE / Math.max(region.width, region.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  return new Uint8Array(await (blob ?? new Blob()).arrayBuffer());
}
