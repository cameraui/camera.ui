<template>
  <div
    class="cui-occupancy-sensor"
    :class="[
      `cui-occupancy-sensor--${size}`,
      {
        'cui-occupancy-sensor--disabled': disabled,
        'cui-occupancy-sensor--empty': !detected,
        'cui-occupancy-sensor--occupied': detected,
      },
    ]"
  >
    <div class="cui-occupancy-sensor__header">
      <div class="cui-occupancy-sensor__icon">
        <i-mdi:motion-sensor v-if="detected" class="cui-occupancy-sensor__icon-svg" :style="detectedIconStyle" />
        <i-mdi:motion-sensor-off v-else class="cui-occupancy-sensor__icon-svg" :style="emptyIconStyle" />
      </div>

      <div class="cui-occupancy-sensor__info">
        <span v-if="label" class="cui-occupancy-sensor__label">{{ label }}</span>
        <span class="cui-occupancy-sensor__status" :class="statusClass">
          {{ detected ? t('components.occupancy_sensor.occupied') : t('components.occupancy_sensor.empty') }}
        </span>
      </div>

      <div class="cui-occupancy-sensor__indicator" :class="indicatorClass" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_OCCUPANCY_SENSOR_DEFAULTS } from './types.js';

import type { CuiOccupancySensorProps } from './types.js';

const props = withDefaults(defineProps<CuiOccupancySensorProps>(), CUI_OCCUPANCY_SENSOR_DEFAULTS);

const { t } = useI18n();

const { detected } = toRefs(props);

const detectedIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.5))',
}));

const emptyIconStyle = computed<Record<string, string>>(() => ({
  color: 'var(--text-secondary-color)',
}));

const statusClass = computed(() => (detected.value ? 'cui-occupancy-sensor__status--occupied' : 'cui-occupancy-sensor__status--empty'));

const indicatorClass = computed(() => (detected.value ? 'cui-occupancy-sensor__indicator--occupied' : 'cui-occupancy-sensor__indicator--empty'));
</script>

<style scoped>
.cui-occupancy-sensor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-occupancy-sensor--disabled {
  opacity: 0.6;
}

/* Header */
.cui-occupancy-sensor__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-occupancy-sensor__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-occupancy-sensor__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-occupancy-sensor__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-occupancy-sensor__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-occupancy-sensor__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.cui-occupancy-sensor__status--occupied {
  color: rgb(34, 197, 94);
}

.cui-occupancy-sensor__status--empty {
  color: var(--text-secondary-color);
}

/* Indicator dot */
.cui-occupancy-sensor__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.cui-occupancy-sensor__indicator--occupied {
  background-color: rgb(34, 197, 94);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.cui-occupancy-sensor__indicator--empty {
  background-color: var(--text-secondary-color);
}

/* Size variants */
.cui-occupancy-sensor--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-occupancy-sensor--small .cui-occupancy-sensor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-occupancy-sensor--small .cui-occupancy-sensor__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-occupancy-sensor--small .cui-occupancy-sensor__label {
  font-size: 0.75rem;
}

.cui-occupancy-sensor--small .cui-occupancy-sensor__status {
  font-size: 0.625rem;
}

.cui-occupancy-sensor--small .cui-occupancy-sensor__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-occupancy-sensor--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-occupancy-sensor--large .cui-occupancy-sensor__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-occupancy-sensor--large .cui-occupancy-sensor__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-occupancy-sensor--large .cui-occupancy-sensor__label {
  font-size: 1rem;
}

.cui-occupancy-sensor--large .cui-occupancy-sensor__status {
  font-size: 0.875rem;
}

.cui-occupancy-sensor--large .cui-occupancy-sensor__indicator {
  width: 0.625rem;
  height: 0.625rem;
}
</style>
