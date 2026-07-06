<template>
  <canvas ref="canvasRef" class="absolute inset-0 w-full h-full pointer-events-none z-1" style="opacity: 0.6" />
</template>

<script setup lang="ts">
import { usePlugin } from '@camera.ui/browser';

import type { NVRInterface } from '@camera.ui/nvr';
import type { CuiHeatmapProps } from './types.js';

const props = defineProps<CuiHeatmapProps>();

const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const canvasRef = useTemplateRef<HTMLCanvasElement>('canvasRef');

async function load() {
  const canvas = canvasRef.value;
  const nvrPlugin = nvrPluginRef.value as NVRInterface | undefined;
  if (!canvas || !nvrPlugin?.getDetectionHeatmap) return;

  try {
    const endMs = Date.now();
    const startMs = endMs - 24 * 60 * 60 * 1000;
    const result = await nvrPlugin.getDetectionHeatmap(props.cameraId, startMs, endMs);
    if (!result?.points?.length) return;
    render(canvas, result.points);
  } catch {
    // silently ignore (camera offline, NVR not running, etc.)
  }
}

function render(canvas: HTMLCanvasElement, points: { x: number; y: number }[]) {
  const W = 128;
  const H = 72; // 16:9
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Draw each point as a radial gradient dot
  const radius = 8;
  for (const pt of points) {
    const px = pt.x * W;
    const py = pt.y * H;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
  }

  // Read density and apply color gradient
  const imageData = ctx.getImageData(0, 0, W, H);
  const data = imageData.data;

  let maxAlpha = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > maxAlpha) maxAlpha = data[i];
  }
  if (maxAlpha === 0) return;

  for (let i = 0; i < data.length; i += 4) {
    const t = data[i + 3] / maxAlpha;
    if (t < 0.01) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    const [r, g, b] = heatColor(t);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = Math.floor(t * 200 + 55);
  }

  ctx.putImageData(imageData, 0, 0);
}

function heatColor(t: number): [number, number, number] {
  if (t < 0.25) {
    const s = t / 0.25;
    return [0, Math.floor(s * 255), 255]; // blue → cyan
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [0, 255, Math.floor((1 - s) * 255)]; // cyan → green
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [Math.floor(s * 255), 255, 0]; // green → yellow
  } else {
    const s = (t - 0.75) / 0.25;
    return [255, Math.floor((1 - s) * 255), 0]; // yellow → red
  }
}

onMounted(() => load());
</script>
