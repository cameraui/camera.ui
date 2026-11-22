<template>
  <svg class="screen" :class="{ 'screen--lit': lit, 'screen--playing': playing }" viewBox="0 0 200 140" aria-hidden="true">
    <defs>
      <linearGradient :id="glowId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" class="screen__glow-a" />
        <stop offset="1" class="screen__glow-b" />
      </linearGradient>
    </defs>
    <template v-if="projector">
      <path d="M62 112 L20 20 H180 L138 112 Z" class="screen__beam" />
      <rect x="20" y="10" width="160" height="92" rx="4" class="screen__panel" :fill="`url(#${glowId})`" />
      <rect x="70" y="112" width="60" height="22" rx="6" class="screen__body" />
      <circle cx="100" cy="123" r="6" class="screen__lens" />
    </template>
    <template v-else>
      <rect x="16" y="8" width="168" height="104" rx="8" class="screen__body" />
      <rect x="24" y="16" width="152" height="88" rx="3" class="screen__panel" :fill="`url(#${glowId})`" />
      <path d="M84 112 L78 128 H122 L116 112" class="screen__stand" />
    </template>
    <g class="screen__pause">
      <rect x="88" y="44" width="8" height="28" rx="2" />
      <rect x="104" y="44" width="8" height="28" rx="2" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { CuiScreenSceneProps } from './types.js';

defineProps<CuiScreenSceneProps>();

const glowId = useId();
</script>

<style scoped>
.screen {
  width: min(100%, 13rem);
}

.screen__body {
  fill: color-mix(in srgb, var(--text-color) 70%, var(--p-content-background));
}

.screen__stand {
  fill: color-mix(in srgb, var(--text-color) 45%, var(--p-content-background));
}

.screen__lens {
  fill: var(--p-content-background);
  transition: fill 0.4s ease;
}

.screen--lit .screen__lens {
  fill: var(--tile-color);
}

.screen__panel {
  opacity: 0.12;
  transition: opacity 0.5s ease;
}

.screen--lit .screen__panel {
  opacity: 0.9;
}

.screen__glow-a {
  stop-color: var(--tile-color);
}

.screen__glow-b {
  stop-color: color-mix(in srgb, var(--tile-color) 35%, #a855f7);
}

.screen--playing .screen__panel {
  animation: screen-flicker 4s ease-in-out infinite alternate;
}

.screen__beam {
  fill: var(--tile-color);
  opacity: 0;
  transition: opacity 0.5s ease;
}

.screen--lit .screen__beam {
  opacity: 0.12;
}

.screen__pause {
  fill: var(--p-content-background);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.screen--lit:not(.screen--playing) .screen__pause {
  opacity: 0.85;
}

@keyframes screen-flicker {
  to {
    opacity: 0.65;
  }
}

@media (prefers-reduced-motion: reduce) {
  .screen--playing .screen__panel {
    animation: none;
  }
}
</style>
