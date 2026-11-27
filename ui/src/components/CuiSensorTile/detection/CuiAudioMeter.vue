<template>
  <div class="audio-meter" :class="{ 'audio-meter--active': active }">
    <div class="audio-meter__bars">
      <span v-for="(ratio, index) in bars" :key="index" class="audio-meter__bar" :style="{ height: `${Math.max(ratio * 100, 4)}%` }" />
      <span v-if="peak !== undefined" class="audio-meter__peak" :style="{ bottom: `calc(0.5rem + ${peak} * (100% - 1rem))` }" />
    </div>
    <span class="audio-meter__value">{{ text }}</span>
  </div>
</template>

<script setup lang="ts">
import { toRatio } from '../range.js';

import type { CuiAudioMeterProps } from './types.js';

const props = defineProps<CuiAudioMeterProps>();

const BARS = 32;
const PEAK_HOLD = 3_000;

const bars = ref<number[]>(Array.from({ length: BARS }, () => 0));
const peak = ref<number>();

let peakAt = 0;

watch(
  () => props.level,
  (level) => {
    const ratio = level === undefined ? 0 : toRatio(level, { min: props.min, max: props.max, step: 1 });
    bars.value = [...bars.value.slice(1), ratio];
    const now = Date.now();
    if (peak.value === undefined || ratio >= peak.value || now - peakAt > PEAK_HOLD) {
      peak.value = level === undefined ? undefined : ratio;
      peakAt = now;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.audio-meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.audio-meter__bars {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  width: 100%;
  height: 7rem;
  padding: 0.5rem;
  border-radius: 0.75rem;
  background: var(--p-content-hover-background);
}

.audio-meter__bar {
  flex: 1;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-color) 30%, var(--p-content-background));
  transition:
    height 0.2s ease,
    background 0.4s ease;
}

.audio-meter--active .audio-meter__bar {
  background: var(--tile-color);
}

.audio-meter__peak {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  height: 2px;
  border-radius: 999px;
  background: var(--text-secondary-color);
  transition: bottom 0.3s ease;
}

.audio-meter__value {
  font-size: 0.8125rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary-color);
}
</style>
