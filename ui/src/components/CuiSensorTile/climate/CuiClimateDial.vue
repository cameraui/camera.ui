<template>
  <div class="climate-dial" :class="{ 'climate-dial--dragging': dragging, 'climate-dial--draggable': draggable }">
    <svg ref="svgRef" viewBox="0 0 240 240" aria-hidden="true">
      <path :d="ARC" class="climate-dial__track" />
      <path v-if="target !== undefined && !ranged" :d="ARC" pathLength="1" class="climate-dial__level" :style="stretch(0, ratio(target))" />
      <path
        v-if="band"
        :d="ARC"
        pathLength="1"
        class="climate-dial__band"
        :class="{ 'climate-dial__band--working': working && !still }"
        :style="stretch(band[0], band[1])"
      />

      <line v-if="current !== undefined" v-bind="TICK" class="climate-dial__turn climate-dial__current" :style="turn(ratio(current))" />

      <template v-if="ranged">
        <circle v-bind="KNOB" class="climate-dial__turn climate-dial__knob climate-dial__knob--low" :style="turn(ratio(low!))" />
        <circle v-bind="KNOB" class="climate-dial__turn climate-dial__knob climate-dial__knob--high" :style="turn(ratio(high!))" />
      </template>
      <circle v-else-if="target !== undefined" v-bind="KNOB" class="climate-dial__turn climate-dial__knob" :style="turn(ratio(target))" />

      <path ref="hitRef" :d="ARC" class="climate-dial__hit" />
    </svg>

    <span class="climate-dial__end" :style="label(0)">{{ range.min }}{{ unit }}</span>
    <span class="climate-dial__end" :style="label(1)">{{ range.max }}{{ unit }}</span>

    <div class="climate-dial__center">
      <slot>
        <span class="climate-dial__value" :class="{ 'climate-dial__value--off': activity === 'off' }">{{ value }}</span>
      </slot>
      <span v-if="reading" class="climate-dial__reading">{{ reading }}</span>
    </div>

    <div class="climate-dial__bottom">
      <slot name="bottom" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { toneColor } from '@/common/sensorDisplay.js';

import { clampRatio, fromRatio, toRatio } from '../range.js';
import { usePointerDrag } from '../usePointerDrag.js';

import type { ClimateKnob, CuiClimateDialEmits, CuiClimateDialProps } from './types.js';

const props = withDefaults(defineProps<CuiClimateDialProps>(), {
  unit: '°',
});
const emit = defineEmits<CuiClimateDialEmits>();

const CENTER = 120;
const RADIUS = 96;
const START = 135;
const SWEEP = 270;
const ARC = arc();
const KNOB = { cx: point(0)[0], cy: point(0)[1], r: 11 };
const TICK = { x1: point(0, RADIUS - 11)[0], y1: point(0, RADIUS - 11)[1], x2: point(0, RADIUS + 11)[0], y2: point(0, RADIUS + 11)[1] };
const heatColor = toneColor('warn');
const coolColor = toneColor('info');

const svgRef = useTemplateRef<SVGSVGElement>('svgRef');
const hitRef = useTemplateRef<SVGPathElement>('hitRef');

const ranged = computed(() => props.low !== undefined && props.high !== undefined);
const draggable = computed(() => !props.disabled && (ranged.value || props.target !== undefined));
const working = computed(() => props.activity === 'heat' || props.activity === 'cool');
const band = computed<[number, number] | undefined>(() => {
  if (ranged.value) return [ratio(props.low!), ratio(props.high!)];
  if (!working.value || props.current === undefined || props.target === undefined) return undefined;
  const ends = [ratio(props.current), ratio(props.target)];
  return [Math.min(...ends), Math.max(...ends)];
});

let held: ClimateKnob = 'target';
let last = 0;

const { dragging } = usePointerDrag(hitRef, {
  draggable: () => draggable.value,
  onStart: (event) => {
    held = nearestKnob(ratioAt(event));
  },
  onMove: (event) => {
    last = valueAt(event);
    emit('input', held, last);
  },
  onEnd: () => emit('commit', held, last),
  onTap: (event) => {
    if (!draggable.value) return;
    const knob = nearestKnob(ratioAt(event));
    emit('commit', knob, valueAt(event));
  },
});

function ratio(value: number): number {
  return toRatio(value, props.range);
}

function point(at: number, radius = RADIUS): [number, number] {
  const angle = ((START + at * SWEEP) * Math.PI) / 180;
  return [CENTER + radius * Math.cos(angle), CENTER + radius * Math.sin(angle)];
}

function arc(): string {
  const [x1, y1] = point(0);
  const [x2, y2] = point(1);
  return `M ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 1 1 ${x2} ${y2}`;
}

function stretch(from: number, to: number) {
  return { strokeDasharray: `${Math.max(to - from, 0)} 2`, strokeDashoffset: -from };
}

function turn(at: number) {
  return { transform: `rotate(${at * SWEEP}deg)` };
}

function label(at: number) {
  const angle = ((START + at * SWEEP) * Math.PI) / 180;
  // the text keeps its size, so its distance from the arc is part dial size and part rem
  const reach = `(${(((RADIUS + 8) / 240) * 100).toFixed(2)}% + 0.625rem)`;
  return { left: `calc(50% + ${Math.cos(angle).toFixed(4)} * ${reach})`, top: `calc(50% + ${Math.sin(angle).toFixed(4)} * ${reach})` };
}

function ratioAt(event: PointerEvent): number {
  const rect = svgRef.value!.getBoundingClientRect();
  const scale = rect.width / 240;
  const x = (event.clientX - rect.left) / scale - CENTER;
  const y = (event.clientY - rect.top) / scale - CENTER;
  const angle = ((((Math.atan2(y, x) * 180) / Math.PI - START) % 360) + 360) % 360;
  if (angle > SWEEP) return angle > (SWEEP + 360) / 2 ? 0 : 1;
  return clampRatio(angle / SWEEP);
}

function valueAt(event: PointerEvent): number {
  return fromRatio(ratioAt(event), props.range);
}

function nearestKnob(at: number): ClimateKnob {
  if (!ranged.value) return 'target';
  const toLow = Math.abs(at - ratio(props.low!));
  const toHigh = Math.abs(at - ratio(props.high!));
  if (toLow === toHigh) return at > ratio(props.low!) ? 'high' : 'low';
  return toLow < toHigh ? 'low' : 'high';
}
</script>

<style scoped>
.climate-dial {
  position: relative;
  width: min(100%, 15rem);
  aspect-ratio: 1;
  container-type: inline-size;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.climate-dial svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.climate-dial path,
.climate-dial line {
  fill: none;
  stroke-linecap: round;
}

.climate-dial__track {
  stroke: var(--p-content-hover-background);
  stroke-width: 14;
}

.climate-dial__level {
  stroke: color-mix(in srgb, var(--tile-color) 30%, var(--p-content-hover-background));
  stroke-width: 14;
}

.climate-dial__band {
  stroke: var(--tile-color);
  stroke-width: 14;
}

.climate-dial__band--working {
  animation: climate-glow 3s ease-in-out infinite;
}

.climate-dial__current {
  stroke: var(--text-color);
  stroke-width: 3;
}

.climate-dial__end {
  position: absolute;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--text-muted-color);
  pointer-events: none;
}

.climate-dial__turn {
  transform-box: view-box;
  transform-origin: 120px 120px;
}

.climate-dial__knob {
  fill: var(--p-content-background);
  stroke: var(--tile-ink);
  stroke-width: 4;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.35));
}

.climate-dial__knob--low {
  stroke: v-bind(coolColor);
}

.climate-dial__knob--high {
  stroke: v-bind(heatColor);
}

.climate-dial__turn,
.climate-dial__level,
.climate-dial__band {
  transition:
    transform 0.3s ease,
    stroke-dasharray 0.3s ease,
    stroke-dashoffset 0.3s ease,
    stroke 0.3s ease;
}

.climate-dial--dragging .climate-dial__turn,
.climate-dial--dragging .climate-dial__level,
.climate-dial--dragging .climate-dial__band {
  transition: none;
}

.climate-dial__hit {
  stroke: transparent;
  stroke-width: 44;
  pointer-events: none;
}

.climate-dial--draggable svg {
  touch-action: none;
}

.climate-dial--draggable .climate-dial__hit {
  pointer-events: stroke;
  cursor: grab;
}

.climate-dial--dragging .climate-dial__hit {
  cursor: grabbing;
}

.climate-dial__center {
  position: absolute;
  inset: 24%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  text-align: center;
  pointer-events: none;
}

.climate-dial__value {
  font-size: clamp(1.5rem, 18cqi, 2.75rem);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
}

.climate-dial__value--off {
  color: var(--text-muted-color);
}

.climate-dial__reading {
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.climate-dial__bottom {
  position: absolute;
  left: 22%;
  right: 22%;
  bottom: 0;
  display: flex;
  justify-content: center;
  gap: min(1rem, 4cqi);
}

@keyframes climate-glow {
  50% {
    opacity: 0.6;
  }
}

@media (prefers-reduced-motion: reduce) {
  .climate-dial__band--working {
    animation: none;
  }
}
</style>
