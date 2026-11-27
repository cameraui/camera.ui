<template>
  <div class="sound" :class="{ 'sound--lit': lit, 'sound--playing': playing }">
    <span v-for="(bar, index) in BARS" :key="index" class="sound__bar" :style="{ '--rest': bar.rest, animationDelay: `${bar.delay}s`, animationDuration: `${bar.duration}s` }" />
  </div>
</template>

<script setup lang="ts">
import type { CuiSoundSceneProps } from './types.js';

defineProps<CuiSoundSceneProps>();

const BARS = [
  { rest: 0.35, delay: 0, duration: 0.9 },
  { rest: 0.55, delay: 0.2, duration: 1.1 },
  { rest: 0.75, delay: 0.05, duration: 0.8 },
  { rest: 0.5, delay: 0.35, duration: 1.2 },
  { rest: 0.85, delay: 0.15, duration: 0.95 },
  { rest: 0.6, delay: 0.4, duration: 1.05 },
  { rest: 0.4, delay: 0.1, duration: 0.85 },
];
</script>

<style scoped>
.sound {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.5rem;
  height: 8rem;
  padding: 0.5rem 0;
}

.sound__bar {
  width: 0.875rem;
  height: 8%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-color) 25%, var(--p-content-background));
  transform-origin: bottom;
  transition:
    height 0.5s ease,
    background 0.4s ease;
}

.sound--lit .sound__bar {
  height: calc(var(--rest) * 45%);
  background: var(--tile-color);
}

.sound--playing .sound__bar {
  height: calc(var(--rest) * 100%);
  animation: sound-bounce ease-in-out infinite alternate;
}

@keyframes sound-bounce {
  from {
    transform: scaleY(1);
  }
  to {
    transform: scaleY(0.3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sound--playing .sound__bar {
    animation: none;
  }
}
</style>
