<template>
  <div class="bell-scene" :class="{ 'bell-scene--ringing': ringing, 'bell-scene--camera': cameraId }">
    <CuiDetectionFrame v-if="cameraId" :camera-id="cameraId" :boxes="[]" />
    <div class="bell-scene__bell">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <path d="M22 50 a40 40 0 0 1 8 -22 M98 50 a40 40 0 0 0 -8 -22" class="bell-scene__wave" />
        <path d="M10 56 a52 52 0 0 1 10 -34 M110 56 a52 52 0 0 0 -10 -34" class="bell-scene__wave bell-scene__wave--outer" />
        <g class="bell-scene__swing">
          <circle cx="60" cy="20" r="6" class="bell-scene__body" />
          <path d="M60 24 c-18 0 -30 14 -30 32 v18 l-9 13 h78 l-9 -13 v-18 c0 -18 -12 -32 -30 -32 z" class="bell-scene__body" />
          <circle cx="60" cy="94" r="8" class="bell-scene__clapper" />
        </g>
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import CuiDetectionFrame from '../detection/CuiDetectionFrame.vue';

import type { CuiBellSceneProps } from './types.js';

defineProps<CuiBellSceneProps>();
</script>

<style scoped>
.bell-scene {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
}

.bell-scene__bell {
  width: 7rem;
  height: 7rem;
}

.bell-scene--camera .bell-scene__bell {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  width: 3.5rem;
  height: 3.5rem;
  padding: 0.375rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--p-content-background) 80%, transparent);
  backdrop-filter: blur(6px);
}

.bell-scene__bell svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.bell-scene__body {
  fill: var(--text-secondary-color);
  transition: fill 0.3s ease;
}

.bell-scene__clapper {
  fill: var(--text-secondary-color);
}

.bell-scene__swing {
  transform-origin: 60px 20px;
}

.bell-scene__wave {
  fill: none;
  stroke: var(--tile-color);
  stroke-width: 5;
  stroke-linecap: round;
  opacity: 0;
}

.bell-scene--ringing .bell-scene__body {
  fill: var(--tile-color);
}

.bell-scene--ringing .bell-scene__swing {
  animation: bell-swing 0.5s ease-in-out infinite alternate;
}

.bell-scene--ringing .bell-scene__clapper {
  fill: var(--tile-color);
  animation: bell-swing 0.5s ease-in-out infinite alternate-reverse;
  transform-origin: 60px 20px;
}

.bell-scene--ringing .bell-scene__wave {
  animation: bell-wave 1s ease-out infinite;
}

.bell-scene--ringing .bell-scene__wave--outer {
  animation-delay: 0.25s;
}

@keyframes bell-swing {
  from {
    transform: rotate(-14deg);
  }
  to {
    transform: rotate(14deg);
  }
}

@keyframes bell-wave {
  0% {
    opacity: 0;
  }
  30% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bell-scene--ringing .bell-scene__swing,
  .bell-scene--ringing .bell-scene__clapper,
  .bell-scene--ringing .bell-scene__wave {
    animation: none;
    opacity: 1;
  }
}
</style>
