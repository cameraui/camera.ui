<template>
  <span class="cui-tile home-chip" :class="{ 'home-chip--on': on, 'home-chip--offline': !sensor.online.value }" :style="color ? { '--tile-color': color } : undefined">
    <CuiHomeMemberIcon class="home-chip__lead" :sensor>
      <span class="home-chip__dot cui-wait-ring" :class="{ 'cui-wait-ring--on': waiting, 'cui-wait-ring--failed': failed }" />
    </CuiHomeMemberIcon>
    <button
      type="button"
      class="home-chip__press"
      :disabled="disabled || !sensor.online.value"
      :aria-pressed="on"
      :aria-label="tailLabel ? `${label}, ${tailLabel}` : undefined"
      @click="emit('toggle')"
    >
      <span class="home-chip__name" :class="{ 'home-chip__name--note': note }">{{ note ?? label }}</span>
      <component :is="tail" v-if="tail" class="home-chip__tail" />
    </button>
  </span>
</template>

<script setup lang="ts">
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';

import type { CuiHomeToggleChipEmits, CuiHomeToggleChipProps } from './switches.js';

const props = defineProps<CuiHomeToggleChipProps>();
const emit = defineEmits<CuiHomeToggleChipEmits>();

const { waiting, failed, note } = useTileWait(() => props.sensor);
</script>

<style scoped>
.home-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  height: 2rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 0.8125rem;
  font-weight: 500;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.home-chip--offline {
  opacity: 0.5;
}

.home-chip:has(> .home-chip__press:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-chip__lead {
  display: flex;
  align-items: center;
  align-self: stretch;
  flex-shrink: 0;
  padding: 0 0.5rem 0 0.75rem;
  border-radius: 9999px;
}

.home-chip__press {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
  padding-right: 0.75rem;
  text-align: left;
  cursor: pointer;
}

.home-chip__press:disabled {
  cursor: default;
}

.home-chip__press:focus-visible {
  outline: none;
}

.home-chip--on {
  background: color-mix(in srgb, var(--tile-color) 22%, transparent);
  color: var(--text-color);
}

.home-chip__dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--text-muted-color);
}

.home-chip--on .home-chip__dot {
  background: var(--tile-color);
}

.home-chip__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-chip .home-chip__name--note {
  color: var(--p-red-500);
}

.home-chip__tail {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  margin-left: auto;
}

.home-chip--on .home-chip__tail {
  color: var(--tile-ink);
}
</style>
