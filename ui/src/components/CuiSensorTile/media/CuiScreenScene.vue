<template>
  <svg class="screen" :class="{ 'screen--lit': lit, 'screen--playing': playing }" :viewBox="projector ? '0 0 200 140' : '0 -12 200 140'" aria-hidden="true">
    <defs>
      <clipPath :id="`${uid}-panel`">
        <rect v-bind="panel" />
      </clipPath>
      <radialGradient v-for="glow in GLOWS" :id="`${uid}-${glow.key}`" :key="glow.key">
        <stop offset="0" :stop-color="glow.color" :stop-opacity="glow.opacity" />
        <stop offset="1" :stop-color="glow.color" stop-opacity="0" />
      </radialGradient>
      <linearGradient :id="`${uid}-sheen`" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.1" />
        <stop offset="0.42" stop-color="#fff" stop-opacity="0.025" />
        <stop offset="0.43" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <linearGradient :id="`${uid}-beam`" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#fff7ed" stop-opacity="0.22" />
        <stop offset="1" stop-color="#fff7ed" stop-opacity="0.03" />
      </linearGradient>
    </defs>

    <template v-if="projector">
      <path d="M90 116 L22 100 V12 H178 V100 L110 116 Z" class="screen__beam" :fill="`url(#${uid}-beam)`" />
      <rect x="18" y="7" width="164" height="5" rx="2.5" class="screen__frame" />
      <rect v-bind="panel" class="screen__surface" />
    </template>
    <template v-else>
      <rect x="13" y="7" width="174" height="102" rx="3.5" class="screen__frame" />
      <rect v-bind="panel" class="screen__glass" />
    </template>

    <g class="screen__content" :clip-path="`url(#${uid}-panel)`">
      <rect v-bind="panel" class="screen__backdrop" />
      <ellipse
        v-for="glow in GLOWS"
        :key="glow.key"
        :class="`screen__glow screen__glow--${glow.key}`"
        :cx="glow.cx"
        :cy="glow.cy"
        :rx="glow.rx"
        :ry="glow.ry"
        :fill="`url(#${uid}-${glow.key})`"
      />
    </g>

    <g class="screen__pause">
      <rect x="89" y="44" width="7" height="24" rx="1.5" />
      <rect x="104" y="44" width="7" height="24" rx="1.5" />
    </g>

    <template v-if="projector">
      <rect x="66" y="112" width="68" height="20" rx="5" class="screen__frame" />
      <circle cx="100" cy="122" r="6.5" class="screen__lens-ring" />
      <circle cx="100" cy="122" r="4" class="screen__lens" />
    </template>
    <template v-else>
      <rect v-bind="panel" class="screen__sheen" :fill="`url(#${uid}-sheen)`" />
      <circle cx="100" cy="106" r="1.1" class="screen__standby" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import type { CuiScreenSceneProps } from './types.js';

const props = defineProps<CuiScreenSceneProps>();

const uid = useId();

const GLOWS = [
  { key: 'amber', color: '#f59e0b', opacity: 0.75, cx: 68, cy: 46, rx: 62, ry: 44 },
  { key: 'rose', color: '#fb7185', opacity: 0.6, cx: 136, cy: 72, rx: 56, ry: 40 },
  { key: 'light', color: '#fef3c7', opacity: 0.4, cx: 104, cy: 98, rx: 72, ry: 24 },
];

const panel = computed(() => (props.projector ? { x: 22, y: 12, width: 156, height: 88 } : { x: 16, y: 10, width: 168, height: 93, rx: 1.5 }));
</script>

<style scoped>
.screen {
  width: min(100%, 13rem);
}

.screen__frame {
  fill: #141518;
  stroke: color-mix(in srgb, var(--text-color) 22%, transparent);
  stroke-width: 0.75;
}

.screen__glass {
  fill: #060607;
}

.screen__surface {
  fill: color-mix(in srgb, var(--text-color) 10%, var(--p-content-background));
}

.screen__backdrop {
  fill: #1e1a1b;
}

.screen__content {
  opacity: 0;
  transition: opacity 0.6s ease;
}

.screen--lit .screen__content {
  opacity: 0.5;
}

.screen--playing .screen__content {
  opacity: 1;
}

.screen__glow {
  animation: 12s ease-in-out infinite alternate paused;
}

.screen--playing .screen__glow {
  animation-play-state: running;
}

.screen__glow--amber {
  animation-name: screen-drift-amber;
}

.screen__glow--rose {
  animation-name: screen-drift-rose;
  animation-duration: 15s;
}

.screen__glow--light {
  animation-name: screen-drift-light;
  animation-duration: 10s;
}

.screen__sheen {
  pointer-events: none;
  transition: opacity 0.6s ease;
}

.screen--lit .screen__sheen {
  opacity: 0.4;
}

.screen__standby {
  fill: #ef4444;
  opacity: 0.8;
  transition: opacity 0.3s ease;
}

.screen--lit .screen__standby {
  opacity: 0;
}

.screen__beam {
  opacity: 0;
  transition: opacity 0.6s ease;
}

.screen--lit .screen__beam {
  opacity: 1;
}

.screen__lens-ring {
  fill: #0b0b0d;
  stroke: color-mix(in srgb, var(--text-color) 30%, transparent);
  stroke-width: 1;
}

.screen__lens {
  fill: #1d1d21;
  transition: fill 0.4s ease;
}

.screen--lit .screen__lens {
  fill: #fff7ed;
}

.screen__pause {
  fill: #fff;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.screen--lit:not(.screen--playing) .screen__pause {
  opacity: 0.85;
}

@keyframes screen-drift-amber {
  to {
    transform: translate(34px, 14px);
  }
}

@keyframes screen-drift-rose {
  to {
    transform: translate(-38px, -16px);
  }
}

@keyframes screen-drift-light {
  to {
    transform: translate(-18px, -10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen__glow {
    animation: none;
  }
}
</style>
