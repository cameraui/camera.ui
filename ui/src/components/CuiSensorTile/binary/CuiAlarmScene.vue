<template>
  <div class="alarm-scene" :class="{ 'alarm-scene--active': active }" :style="{ '--alarm-calm': calm }">
    <span v-for="wave in WAVES" :key="wave" class="alarm-scene__wave" :style="{ animationDelay: `${wave * 0.8}s` }" />
    <span class="alarm-scene__ring">
      <component :is="icon" class="alarm-scene__icon" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { toneColor } from '@/common/sensorDisplay.js';

import type { CuiAlarmSceneProps } from './types.js';

const WAVES = [0, 1, 2];

withDefaults(defineProps<CuiAlarmSceneProps>(), {
  calm: toneColor('ok'),
});
</script>

<style scoped>
.alarm-scene {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 10rem;
  height: 10rem;
}

.alarm-scene__ring {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  border: 4px solid color-mix(in srgb, var(--alarm-calm) 70%, var(--p-content-background));
  background: color-mix(in srgb, var(--alarm-calm) 10%, var(--p-content-background));
  color: var(--text-secondary-color);
  transition:
    border-color 0.4s ease,
    background 0.4s ease,
    color 0.4s ease;
}

.alarm-scene--active .alarm-scene__ring {
  border-color: var(--tile-color);
  background: color-mix(in srgb, var(--tile-color) 18%, var(--p-content-background));
  color: var(--tile-ink);
}

.alarm-scene__icon {
  width: 2.75rem;
  height: 2.75rem;
}

.alarm-scene__wave {
  position: absolute;
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  border: 2px solid var(--tile-color);
  opacity: 0;
}

.alarm-scene--active .alarm-scene__wave {
  animation: alarm-wave 2.4s ease-out infinite;
}

@keyframes alarm-wave {
  0% {
    opacity: 0.6;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.65);
  }
}

@media (prefers-reduced-motion: reduce) {
  .alarm-scene--active .alarm-scene__wave {
    animation: none;
  }
}
</style>
