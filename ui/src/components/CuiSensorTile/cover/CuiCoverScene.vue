<template>
  <svg
    ref="sceneRef"
    class="cover-scene"
    :class="{
      'cover-scene--draggable': draggable,
      'cover-scene--sideways': kind === CoverKind.Curtain,
      'cover-scene--dragging': dragging,
    }"
    viewBox="0 0 200 220"
    aria-hidden="true"
  >
    <defs>
      <clipPath :id="clipId">
        <rect v-if="kind === CoverKind.Damper" x="34" y="44" width="132" height="132" rx="66" />
        <rect v-else :x="GX" :y="GY" :width="GW" :height="GH" rx="3" />
      </clipPath>
    </defs>

    <template v-if="kind === CoverKind.Damper">
      <circle cx="100" cy="110" r="76" class="cover-scene__frame" />
      <circle cx="100" cy="110" r="66" class="cover-scene__air" />
      <g :clip-path="`url(#${clipId})`">
        <ellipse cx="100" cy="110" rx="66" ry="66" class="cover-scene__fabric cover-scene__flap" :style="{ transform: `scaleY(${closed})` }" />
      </g>
      <line x1="24" y1="110" x2="176" y2="110" class="cover-scene__axle" />
    </template>

    <template v-else>
      <rect x="16" y="16" width="168" height="192" rx="10" class="cover-scene__frame" />
      <rect :x="GX" :y="GY" :width="GW" :height="GH" rx="3" :class="opensInward ? 'cover-scene__air' : 'cover-scene__glass'" />

      <template v-if="!opensInward">
        <line x1="100" :y1="GY" x2="100" :y2="GY + GH" class="cover-scene__muntin" />
        <line :x1="GX" :y1="GY + GH / 2" :x2="GX + GW" :y2="GY + GH / 2" class="cover-scene__muntin" />
      </template>

      <g :clip-path="`url(#${clipId})`">
        <g v-if="fromTop" class="cover-scene__move" :style="{ transform: `translateY(${-openRatio * (GH - RAIL)}px)` }">
          <rect :x="GX" :y="GY" :width="GW" :height="GH" :class="kind === CoverKind.Blind ? 'cover-scene__gap' : 'cover-scene__fabric'" />
          <template v-if="kind === CoverKind.Shutter">
            <line v-for="y in shutterLines" :key="y" :x1="GX" :y1="y" :x2="GX + GW" :y2="y" class="cover-scene__line" />
          </template>
          <template v-else-if="kind === CoverKind.Blind">
            <rect v-for="y in blindSlats" :key="y" :x="GX" :y="y - slatHeight / 2" :width="GW" :height="slatHeight" rx="1" class="cover-scene__slat" />
          </template>
          <rect :x="GX - 3" :y="GY + GH - RAIL" :width="GW + 6" :height="RAIL" rx="2" class="cover-scene__rail" />
          <template v-if="kind === CoverKind.Shade">
            <line x1="100" :y1="GY + GH" x2="100" :y2="GY + GH + 12" class="cover-scene__cord" />
          </template>
        </g>

        <template v-else-if="kind === CoverKind.Curtain">
          <g class="cover-scene__move" :style="{ transform: `translateX(${-openRatio * CURTAIN_TRAVEL}px)` }">
            <rect :x="GX" :y="GY" :width="GW / 2" :height="GH" class="cover-scene__fabric" />
            <line v-for="x in curtainFolds" :key="x" :x1="GX + x" :y1="GY" :x2="GX + x" :y2="GY + GH" class="cover-scene__line" />
          </g>
          <g class="cover-scene__move" :style="{ transform: `translateX(${openRatio * CURTAIN_TRAVEL}px)` }">
            <rect x="100" :y="GY" :width="GW / 2" :height="GH" class="cover-scene__fabric" />
            <line v-for="x in curtainFolds" :key="x" :x1="100 + x" :y1="GY" :x2="100 + x" :y2="GY + GH" class="cover-scene__line" />
          </g>
        </template>

        <polygon v-else-if="kind === CoverKind.Window" :points="sashPoints" class="cover-scene__glass cover-scene__sash" />

        <template v-else-if="kind === CoverKind.Door">
          <polygon :points="doorPoints" class="cover-scene__fabric cover-scene__sash" />
          <circle :cx="doorKnobX" cy="118" r="4" class="cover-scene__rail" />
        </template>
      </g>

      <template v-if="kind === CoverKind.Curtain">
        <line x1="8" y1="11" x2="192" y2="11" class="cover-scene__rod" />
      </template>

      <g v-if="kind === CoverKind.Awning" class="cover-scene__move cover-scene__awning" :style="{ transform: `scaleY(${0.12 + 0.88 * openRatio})` }">
        <rect
          v-for="(x, index) in awningStripes"
          :key="x"
          :x
          y="6"
          :width="AWNING_STRIPE"
          height="96"
          :class="index % 2 ? 'cover-scene__awning-light' : 'cover-scene__awning-dark'"
        />
      </g>
    </template>

    <rect v-if="obstructed" :x="GX" :y="GY + GH - 5" :width="GW" height="5" rx="2" class="cover-scene__obstruction" />
  </svg>
</template>

<script setup lang="ts">
import { CoverKind } from '@camera.ui/sdk';

import { clampRatio } from '../range.js';
import { usePointerDrag } from '../usePointerDrag.js';

import type { CuiCoverSceneEmits, CuiCoverSceneProps } from './types.js';

const GX = 26;
const GY = 26;
const GW = 148;
const GH = 172;
const RAIL = 6;
const CURTAIN_TRAVEL = GW / 2 - 12;
const AWNING_STRIPE = 22;
const FROM_TOP = new Set<CoverKind>([CoverKind.Shutter, CoverKind.Blind, CoverKind.Shade]);

const props = defineProps<CuiCoverSceneProps>();
const emit = defineEmits<CuiCoverSceneEmits>();

const sceneRef = useTemplateRef<SVGSVGElement>('sceneRef');
const clipId = useId();

const closed = computed(() => 1 - props.openRatio);
const fromTop = computed(() => FROM_TOP.has(props.kind));
const opensInward = computed(() => props.kind === CoverKind.Window || props.kind === CoverKind.Door);
const slatHeight = computed(() => 7 * (1 - 0.8 * ((props.tilt ?? 0) / 100)));

const shutterLines = range(GY + 8, GY + GH - RAIL, 8);
const blindSlats = range(GY + 5, GY + GH - RAIL - 2, 9);
const curtainFolds = range(9, GW / 2, 9);
const awningStripes = range(GX - 12, GX + GW + 12, AWNING_STRIPE);

const sashPoints = computed(() => {
  const inset = 10 * props.openRatio;
  const drop = 16 * props.openRatio;
  return `${GX + inset},${GY + drop} ${GX + GW - inset},${GY + drop} ${GX + GW},${GY + GH} ${GX},${GY + GH}`;
});
const doorRight = computed(() => GX + GW * (1 - 0.75 * props.openRatio));
const doorPoints = computed(() => {
  const skew = 10 * props.openRatio;
  return `${GX},${GY} ${doorRight.value},${GY + skew} ${doorRight.value},${GY + GH - skew} ${GX},${GY + GH}`;
});
const doorKnobX = computed(() => doorRight.value - 12);

let last = props.openRatio;

const { dragging } = usePointerDrag(sceneRef, {
  get axis() {
    return props.kind === CoverKind.Curtain ? 'x' : 'y';
  },
  draggable: () => props.draggable,
  onMove: (event) => {
    last = ratioAt(event);
    emit('input', last);
  },
  onEnd: () => emit('commit', last),
  onTap: (event) => {
    if (props.draggable) emit('commit', ratioAt(event));
  },
});

function ratioAt(event: PointerEvent): number {
  const rect = sceneRef.value!.getBoundingClientRect();
  const scale = rect.width / 200;
  const x = (event.clientX - rect.left) / scale;
  const y = (event.clientY - rect.top) / scale;
  if (props.kind === CoverKind.Curtain) return clampRatio(1 - Math.min(x - GX, GX + GW - x) / (GW / 2));
  if (props.kind === CoverKind.Awning) return clampRatio((y - GY) / GH);
  return clampRatio(1 - (y - GY) / GH);
}

function range(from: number, to: number, step: number): number[] {
  return Array.from({ length: Math.max(Math.ceil((to - from) / step), 0) }, (_, index) => from + index * step);
}
</script>

<style scoped>
.cover-scene {
  width: min(100%, 13rem);
  aspect-ratio: 200 / 220;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.cover-scene--draggable {
  cursor: ns-resize;
  touch-action: none;
}

.cover-scene--draggable.cover-scene--sideways {
  cursor: ew-resize;
}

.cover-scene__frame {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.cover-scene__glass {
  fill: color-mix(in srgb, #38bdf8 20%, var(--p-content-background));
}

.cover-scene__air {
  fill: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
}

.cover-scene__muntin {
  stroke: var(--p-content-hover-background);
  stroke-width: 3;
}

.cover-scene__fabric {
  fill: color-mix(in srgb, var(--text-color) 22%, var(--p-content-background));
}

.cover-scene__gap {
  fill: transparent;
}

.cover-scene__slat {
  fill: color-mix(in srgb, var(--text-color) 30%, var(--p-content-background));
}

.cover-scene__line {
  stroke: color-mix(in srgb, var(--text-color) 35%, var(--p-content-background));
  stroke-width: 1;
}

.cover-scene__rail {
  fill: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
}

.cover-scene__cord {
  stroke: color-mix(in srgb, var(--text-color) 45%, var(--p-content-background));
  stroke-width: 1.5;
}

.cover-scene__rod {
  stroke: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
  stroke-width: 3;
  stroke-linecap: round;
}

.cover-scene__sash {
  stroke: var(--border-color);
  stroke-width: 2;
}

.cover-scene__awning-dark {
  fill: var(--tile-color);
}

.cover-scene__awning-light {
  fill: color-mix(in srgb, var(--tile-color) 18%, white);
}

.cover-scene__awning {
  transform-origin: top;
  transform-box: fill-box;
}

.cover-scene__flap {
  transform-origin: center;
  transform-box: fill-box;
}

.cover-scene__axle {
  stroke: color-mix(in srgb, var(--text-color) 55%, var(--p-content-background));
  stroke-width: 3;
  stroke-linecap: round;
}

.cover-scene__move,
.cover-scene__flap {
  transition: transform 0.45s ease;
}

.cover-scene--dragging .cover-scene__move,
.cover-scene--dragging .cover-scene__flap {
  transition: none;
}

.cover-scene__obstruction {
  fill: rgb(239 68 68);
}
</style>
