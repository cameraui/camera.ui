import type { ObjectMask } from '@camera.ui/sdk';

const EDGE_FROM = 96;
const EDGE_TO = 160;
const DIM = 'rgb(0 0 0 / 0.5)';

export function maskShape(mask: ObjectMask, width: number, height: number): HTMLCanvasElement | undefined {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1 || !mask.width || !mask.height) return undefined;

  const source = document.createElement('canvas');
  source.width = mask.width;
  source.height = mask.height;
  const sourceContext = source.getContext('2d');
  if (!sourceContext) return undefined;
  const pixels = sourceContext.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.width * mask.height; i++) {
    pixels.data.fill(255, i * 4, i * 4 + 3);
    pixels.data[i * 4 + 3] = mask.data[i] ?? 0;
  }
  sourceContext.putImageData(pixels, 0, 0);

  const shape = document.createElement('canvas');
  shape.width = w;
  shape.height = h;
  const context = shape.getContext('2d', { willReadFrequently: true });
  if (!context) return undefined;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, w, h);
  const scaled = context.getImageData(0, 0, w, h);
  for (let i = 3; i < scaled.data.length; i += 4) {
    scaled.data[i] = ((scaled.data[i] - EDGE_FROM) * 255) / (EDGE_TO - EDGE_FROM);
  }
  context.putImageData(scaled, 0, 0);
  return shape;
}

export function drawOutline(canvas: HTMLCanvasElement, mask: ObjectMask, color: string): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const shape = maskShape(mask, mask.box.width * width, mask.box.height * height);
  if (!context || !shape) return;
  const x = Math.round(mask.box.x * width);
  const y = Math.round(mask.box.y * height);

  context.fillStyle = DIM;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(shape, x, y);

  const edge = Math.max(2, Math.round(2 * ratio));
  const ring = edgeOf(shape, edge, color);
  if (!ring) return;
  context.globalCompositeOperation = 'source-over';
  context.shadowColor = color;
  context.shadowBlur = 16 * ratio;
  context.drawImage(ring, x - edge, y - edge);
}

export function drawOutlines(canvas: HTMLCanvasElement, masks: ObjectMask[], color: string): void {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.round(canvas.clientWidth * ratio);
  const height = Math.round(canvas.clientHeight * ratio);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const edge = Math.max(2, Math.round(2 * ratio));

  for (const mask of masks) {
    const shape = maskShape(mask, mask.box.width * width, mask.box.height * height);
    const fill = shape && tinted(shape, color);
    const ring = shape && edgeOf(shape, edge, color);
    if (!fill || !ring) continue;
    const x = Math.round(mask.box.x * width);
    const y = Math.round(mask.box.y * height);
    context.globalAlpha = 0.3;
    context.drawImage(fill, x, y);
    context.globalAlpha = 1;
    context.drawImage(ring, x - edge, y - edge);
  }
}

function tinted(shape: HTMLCanvasElement, color: string): HTMLCanvasElement | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = shape.width;
  canvas.height = shape.height;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(shape, 0, 0);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function edgeOf(shape: HTMLCanvasElement, edge: number, color: string): HTMLCanvasElement | undefined {
  const ring = document.createElement('canvas');
  ring.width = shape.width + edge * 2;
  ring.height = shape.height + edge * 2;
  const context = ring.getContext('2d');
  if (!context) return undefined;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) context.drawImage(shape, edge + dx * edge, edge + dy * edge);
  }
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, ring.width, ring.height);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(shape, edge, edge);
  return ring;
}
