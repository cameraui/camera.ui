import { maskShape } from './objectMask.js';

import type { BoundingBox, ObjectMask } from '@camera.ui/sdk';

const CROP_MARGIN = 0.1;

export async function cropImage(source: Blob, box: BoundingBox, mask?: ObjectMask, maxEdge = 192): Promise<string | undefined> {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(source);
    const { x, y, width: w, height: h } = mask?.box ?? box;
    const left = Math.max(0, x - w * CROP_MARGIN) * bitmap.width;
    const top = Math.max(0, y - h * CROP_MARGIN) * bitmap.height;
    const right = Math.min(1, x + w * (1 + CROP_MARGIN)) * bitmap.width;
    const bottom = Math.min(1, y + h * (1 + CROP_MARGIN)) * bitmap.height;
    const sw = right - left;
    const sh = bottom - top;
    if (sw < 1 || sh < 1) return undefined;

    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(bitmap, left, top, sw, sh, 0, 0, canvas.width, canvas.height);
    if (!mask) return canvas.toDataURL('image/jpeg', 0.85);

    const scaleX = canvas.width / sw;
    const scaleY = canvas.height / sh;
    const shape = maskShape(mask, mask.box.width * bitmap.width * scaleX, mask.box.height * bitmap.height * scaleY);
    if (shape) {
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(shape, (mask.box.x * bitmap.width - left) * scaleX, (mask.box.y * bitmap.height - top) * scaleY);
    }
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  } finally {
    bitmap?.close();
  }
}
