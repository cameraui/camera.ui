<template>
  <div class="cui-tile home-status-row" :class="{ 'home-status-row--offline': offline }" :style="color ? { '--tile-color': color } : undefined">
    <CuiHomeMemberIcon
      class="home-status-row__icon cui-wait-ring"
      :class="{ 'home-status-row__icon--on': on, 'cui-wait-ring--on': waiting, 'cui-wait-ring--failed': failed }"
      :sensor
    >
      <component :is="icon" />
    </CuiHomeMemberIcon>
    <span class="home-status-row__text">
      <span class="home-status-row__name">{{ name }}</span>
      <span class="home-status-row__state" :class="{ 'home-status-row__state--note': note }">
        <slot name="state">{{ note ?? state }}</slot>
      </span>
    </span>
    <slot />
  </div>
</template>

<script setup lang="ts">
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';

import type { CuiHomeStatusRowProps } from './status.js';

const props = defineProps<CuiHomeStatusRowProps>();

const { waiting, failed, note } = useTileWait(() => props.sensor);
</script>

<style scoped>
.home-status-row {
  --row-deep: color-mix(in srgb, var(--text-color) 6%, var(--p-content-hover-background));
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  height: 3.5rem;
  padding: 0 0.5rem 0 0.625rem;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
}

.home-status-row--offline {
  opacity: 0.55;
}

.home-status-row__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: var(--row-deep);
  color: var(--text-secondary-color);
  transition:
    background 0.25s ease,
    color 0.25s ease;
}

.home-status-row__icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.home-status-row__icon--on {
  background: color-mix(in srgb, var(--tile-ink) 18%, var(--p-content-hover-background));
  color: var(--tile-ink);
}

.home-status-row__text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.home-status-row__name,
.home-status-row__state {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-status-row__name {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.125rem;
  color: var(--text-color);
}

.home-status-row__state {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--text-secondary-color);
}

.home-status-row .home-status-row__state--note {
  color: var(--p-red-500);
}

.home-status-row :deep(.tile-action) {
  flex: none;
  height: 2.25rem;
  background: var(--row-deep);
}

.home-status-row :deep(.tile-action__label) {
  font-size: 0.875rem;
}
</style>
