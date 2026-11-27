<template>
  <!-- a new svg restarts its clock, so a lap or the way home starts when the phase does -->
  <svg :key="phase" class="robot-scene" :class="[`robot-scene--${phase}`, { 'robot-scene--lawn': lawn }]" viewBox="0 0 200 140" aria-hidden="true">
    <rect x="4" y="4" width="192" height="132" rx="10" class="robot-scene__ground" />
    <template v-if="lawn">
      <rect v-for="stripe in STRIPES" :key="stripe" x="4" :y="stripe" width="192" height="12" class="robot-scene__stripe" />
    </template>

    <path v-if="trail" :d="LANES" pathLength="100" class="robot-scene__trail" :stroke-dasharray="trail === 'half' ? '50 100' : '100 100'">
      <animate v-if="trail === 'grow'" attributeName="stroke-dashoffset" from="100" to="0" :dur="`${LAP_S}s`" repeatCount="indefinite" />
    </path>

    <rect x="14" y="101" width="10" height="28" rx="3" class="robot-scene__dock" />
    <circle cx="19" cy="108" r="2" class="robot-scene__dock-light" />

    <g :transform="still ? `translate(${still[0]} ${still[1]})` : undefined">
      <animateMotion v-if="phase === 'working' && moving" :path="LANES" :dur="`${LAP_S}s`" repeatCount="indefinite" rotate="auto" />
      <animateMotion v-else-if="phase === 'returning' && moving" :path="HOME" :dur="`${HOME_S}s`" fill="freeze" rotate="auto" />
      <g class="robot-scene__robot">
        <template v-if="lawn">
          <rect x="-12" y="-9" width="24" height="18" rx="5" class="robot-scene__body" />
          <rect x="-9" y="-12" width="6" height="4" rx="1" class="robot-scene__wheel" />
          <rect x="3" y="-12" width="6" height="4" rx="1" class="robot-scene__wheel" />
          <rect x="-9" y="8" width="6" height="4" rx="1" class="robot-scene__wheel" />
          <rect x="3" y="8" width="6" height="4" rx="1" class="robot-scene__wheel" />
          <circle cx="4" cy="0" r="3" class="robot-scene__eye" />
        </template>
        <template v-else>
          <circle r="10" class="robot-scene__body" />
          <path d="M6 -7.5 A10 10 0 0 1 6 7.5" class="robot-scene__bumper" />
          <circle r="3" class="robot-scene__eye" />
        </template>
      </g>
      <g v-if="phase === 'error'" class="robot-scene__alert" transform="translate(0 -20)">
        <circle r="7" />
        <rect x="-1" y="-4" width="2" height="5" rx="1" class="robot-scene__alert-mark" />
        <circle cy="3" r="1.1" class="robot-scene__alert-mark" />
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiRobotSceneProps } from './types.js';

const props = defineProps<CuiRobotSceneProps>();

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

const LAP_S = 14;
const HOME_S = 4;
const LANES = 'M36 115 H176 V92 H36 V69 H176 V46 H36 V23 H176';
const HOME = 'M106 69 H36 V115';
const STRIPES = [16, 40, 64, 88, 112];
const DOCK: [number, number] = [36, 115];
const MIDWAY: [number, number] = [106, 69];

const moving = computed(() => !reducedMotion.value);

const still = computed(() => {
  if (props.phase === 'docked' || props.phase === 'idle') return DOCK;
  if ((props.phase === 'working' || props.phase === 'returning') && moving.value) return undefined;
  return props.phase === 'returning' ? DOCK : MIDWAY;
});
const trail = computed(() => {
  if (props.phase === 'working') return moving.value ? 'grow' : 'full';
  if (props.phase === 'paused' || props.phase === 'error' || props.phase === 'returning') return 'half';
  return undefined;
});
</script>

<style scoped>
.robot-scene {
  width: min(100%, 16rem);
}

.robot-scene__ground {
  fill: var(--p-content-hover-background);
  stroke: var(--border-color);
  stroke-width: 2;
}

.robot-scene--lawn .robot-scene__ground {
  fill: color-mix(in srgb, #22c55e 30%, var(--p-content-background));
}

.robot-scene__stripe {
  fill: color-mix(in srgb, #15803d 18%, transparent);
}

.robot-scene__trail {
  fill: none;
  stroke: color-mix(in srgb, var(--tile-color) 22%, transparent);
  stroke-width: 23;
  stroke-linejoin: round;
}

.robot-scene--lawn .robot-scene__trail {
  stroke: color-mix(in srgb, #bbf7d0 45%, transparent);
}

.robot-scene__dock {
  fill: color-mix(in srgb, var(--text-color) 65%, var(--p-content-background));
}

.robot-scene__dock-light {
  fill: var(--p-content-background);
}

.robot-scene--docked .robot-scene__dock-light {
  fill: var(--tile-color);
  animation: robot-charge 2s ease-in-out infinite alternate;
}

.robot-scene__body {
  fill: color-mix(in srgb, var(--text-color) 80%, var(--p-content-background));
  stroke: var(--p-content-background);
  stroke-width: 1.5;
}

.robot-scene__bumper {
  fill: none;
  stroke: var(--p-content-background);
  stroke-width: 2;
  stroke-linecap: round;
}

.robot-scene__wheel {
  fill: var(--text-color);
}

.robot-scene__eye {
  fill: var(--p-content-background);
  transition: fill 0.3s ease;
}

.robot-scene--working .robot-scene__eye,
.robot-scene--returning .robot-scene__eye {
  fill: var(--tile-color);
}

.robot-scene--error .robot-scene__robot {
  transform: rotate(18deg);
}

.robot-scene__alert circle:first-child {
  fill: var(--tile-color);
}

.robot-scene__alert-mark {
  fill: #fff;
}

@keyframes robot-charge {
  to {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  .robot-scene--docked .robot-scene__dock-light {
    animation: none;
  }
}
</style>
