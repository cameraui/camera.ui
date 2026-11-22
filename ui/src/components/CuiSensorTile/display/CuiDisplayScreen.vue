<template>
  <div class="display-screen">
    <div class="display-screen__pixels">
      <Transition name="display-screen__text" mode="out-in">
        <span :key="text" class="display-screen__text" :class="{ 'display-screen__text--empty': !text }">{{ text || empty }}</span>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CuiDisplayScreenProps } from './types.js';

defineProps<CuiDisplayScreenProps>();
</script>

<style scoped>
.display-screen {
  --pixel: 3px;
  width: 100%;
  border-radius: 0.875rem;
  overflow: hidden;
  border: 6px solid color-mix(in srgb, var(--text-color) 12%, var(--p-content-background));
  background-color: color-mix(in srgb, var(--tile-color) 14%, #050607);
  background-image: linear-gradient(rgb(0 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, rgb(0 0 0 / 0.6) 1px, transparent 1px);
  background-size: var(--pixel) var(--pixel);
  box-shadow: inset 0 0 24px rgb(0 0 0 / 0.7);
}

.display-screen__pixels {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 6.5rem;
  padding: 1rem 1.25rem;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--tile-color) 80%, transparent));
  -webkit-mask-image: linear-gradient(transparent 1px, #000 1px), linear-gradient(90deg, transparent 1px, #000 1px);
  -webkit-mask-size: var(--pixel) var(--pixel);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(transparent 1px, #000 1px), linear-gradient(90deg, transparent 1px, #000 1px);
  mask-size: var(--pixel) var(--pixel);
  mask-composite: intersect;
}

.display-screen__text {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: 0.04em;
  text-align: center;
  overflow-wrap: anywhere;
  color: color-mix(in srgb, var(--tile-color) 55%, white);
}

.display-screen__text--empty {
  color: rgb(255 255 255 / 0.22);
}

.display-screen__text-enter-active,
.display-screen__text-leave-active {
  transition: opacity 0.25s ease;
}

.display-screen__text-enter-from,
.display-screen__text-leave-to {
  opacity: 0;
}
</style>
