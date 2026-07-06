<template>
  <svg ref="zoneRef" width="100%" height="100%" class="zones-container polygon-container min-w-0">
    <defs>
      <marker
        v-for="(line, i) in cameraLines ?? []"
        :id="`arrow-ab-${i}`"
        :key="`marker-ab-${i}`"
        markerWidth="6"
        markerHeight="5"
        refX="5"
        refY="2.5"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M0,0 L6,2.5 L0,5 Z" :fill="line.color" />
      </marker>
      <marker
        v-for="(line, i) in cameraLines ?? []"
        :id="`arrow-ba-${i}`"
        :key="`marker-ba-${i}`"
        markerWidth="6"
        markerHeight="5"
        refX="1"
        refY="2.5"
        orient="auto"
        markerUnits="strokeWidth"
      >
        <path d="M6,0 L0,2.5 L6,5 Z" :fill="line.color" />
      </marker>
    </defs>

    <path
      v-for="(zone, i) in cameraZones"
      :key="`zone-${i}`"
      :d="convertToSvgPath(zone.points.map((coord: [number, number]) => coord))"
      :class="{
        dash: zone.type === 'intersect' && !zone.isPrivacyMask,
      }"
      :style="{
        fill: zone.isPrivacyMask ? 'rgba(16, 16, 16, 0.9)' : zone.filter === 'exclude' ? 'transparent' : `${zone.color}4D`,
        stroke: zone.isPrivacyMask ? '#333333' : zone.color,
        'stroke-width': '2',
      }"
    />

    <template v-for="(line, i) in cameraLines ?? []" :key="`line-${i}`">
      <line
        :x1="lineSvg(line).h1x"
        :y1="lineSvg(line).h1y"
        :x2="lineSvg(line).h2x"
        :y2="lineSvg(line).h2y"
        :stroke="line.color"
        stroke-width="2"
        stroke-dasharray="6,4"
        opacity="0.5"
      />
      <line
        :x1="lineSvg(line).ax"
        :y1="lineSvg(line).ay"
        :x2="lineSvg(line).bx"
        :y2="lineSvg(line).by"
        :stroke="line.color"
        stroke-width="3"
        :marker-end="line.direction !== 'b-to-a' ? `url(#arrow-ab-${i})` : undefined"
        :marker-start="line.direction !== 'a-to-b' ? `url(#arrow-ba-${i})` : undefined"
      />
      <rect :x="lineSvg(line).labelAx - 8" :y="lineSvg(line).labelAy - 8" width="16" height="16" rx="3" :fill="line.color" />
      <text :x="lineSvg(line).labelAx" :y="lineSvg(line).labelAy" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="central">A</text>
      <rect :x="lineSvg(line).labelBx - 8" :y="lineSvg(line).labelBy - 8" width="16" height="16" rx="3" :fill="line.color" />
      <text :x="lineSvg(line).labelBx" :y="lineSvg(line).labelBy" fill="#fff" font-size="10" font-weight="bold" text-anchor="middle" dominant-baseline="central">B</text>
    </template>
  </svg>
</template>

<script lang="ts" setup>
import type { DetectionLine } from '@camera.ui/sdk';

import type { CuiPolygonProps } from './types.js';

const props = defineProps<CuiPolygonProps>();

const { cameraZones } = toRefs(props);

const zoneRef = useTemplateRef<SVGSVGElement>('zoneRef');
const zoneElement = useElementSize(zoneRef);

function convertToSvgPath(coords: [number, number][]): string {
  if (!coords) {
    return '';
  }

  const points = coords.map((coord) => {
    const x = Math.round((coord[0] / 100) * zoneElement.width.value);
    const y = Math.round((coord[1] / 100) * zoneElement.height.value);
    return `${x},${y}`;
  });

  if (points.length === 0) {
    return '';
  }

  let path = `M ${points[0]}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i]}`;
  }
  path += ' Z';

  return path;
}

function lineSvg(line: DetectionLine) {
  const w = zoneElement.width.value;
  const h = zoneElement.height.value;

  const h1px = (line.points[0][0] / 100) * w;
  const h1py = (line.points[0][1] / 100) * h;
  const h2px = (line.points[1][0] / 100) * w;
  const h2py = (line.points[1][1] / 100) * h;

  const mx = (h1px + h2px) / 2;
  const my = (h1py + h2py) / 2;

  const hdx = h2px - h1px;
  const hdy = h2py - h1py;
  const hLen = Math.sqrt(hdx * hdx + hdy * hdy) || 1;

  const perpX = -hdy;
  const perpY = hdx;

  const rawAx = mx - perpX / 2;
  const rawAy = my - perpY / 2;
  const rawBx = mx + perpX / 2;
  const rawBy = my + perpY / 2;

  const ux = perpX / hLen;
  const uy = perpY / hLen;

  const labelHalf = 8;
  const gap = 5;

  const clamp = (x: number, y: number) => ({
    x: Math.max(labelHalf, Math.min(w - labelHalf, x)),
    y: Math.max(labelHalf, Math.min(h - labelHalf, y)),
  });
  const outset = labelHalf + gap + 5;
  const labelA = clamp(rawAx - ux * outset, rawAy - uy * outset);
  const labelB = clamp(rawBx + ux * outset, rawBy + uy * outset);

  const lineInset = labelHalf + gap;
  const ax = labelA.x + ux * lineInset;
  const ay = labelA.y + uy * lineInset;
  const bx = labelB.x - ux * lineInset;
  const by = labelB.y - uy * lineInset;

  return {
    h1x: h1px,
    h1y: h1py,
    h2x: h2px,
    h2y: h2py,
    ax,
    ay,
    bx,
    by,
    labelAx: labelA.x,
    labelAy: labelA.y,
    labelBx: labelB.x,
    labelBy: labelB.y,
  };
}
</script>

<style scoped>
.zones-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0.7;
}
</style>

<style lang="scss" scoped>
.polygon-container {
  position: absolute;

  .polygon {
    stroke-width: 2;
    cursor: pointer;

    &.selected {
      stroke-width: 2;
    }

    &.dash {
      stroke-dasharray: 5, 5;
    }
  }

  .polygon-exclude {
    stroke-width: 2;
    cursor: pointer;

    &.selected {
      stroke-width: 2;
    }

    &.dash {
      stroke-dasharray: 5, 5;
    }
  }

  .polygon-privacy {
    stroke-width: 2;
    cursor: pointer;

    &.selected {
      stroke-width: 2;
    }

    &.dash {
      stroke-dasharray: 5, 5;
    }
  }

  .polygon-privacy-exclude {
    stroke-width: 2;
    cursor: pointer;

    &.selected {
      stroke-width: 2;
    }

    &.dash {
      stroke-dasharray: 5, 5;
    }
  }

  path {
    &.selected {
      stroke-width: 2;
    }

    &.dash {
      stroke-dasharray: 5, 5;
    }
  }
}
</style>
