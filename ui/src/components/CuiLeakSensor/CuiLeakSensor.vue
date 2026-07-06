<template>
  <div
    class="cui-leak-sensor"
    :class="[
      `cui-leak-sensor--${size}`,
      {
        'cui-leak-sensor--disabled': disabled,
        'cui-leak-sensor--clear': !detected,
        'cui-leak-sensor--detected': detected,
      },
    ]"
  >
    <div class="cui-leak-sensor__header">
      <div class="cui-leak-sensor__icon">
        <i-mdi:water-alert v-if="detected" class="cui-leak-sensor__icon-svg" :style="detectedIconStyle" />
        <i-mdi:water-off v-else class="cui-leak-sensor__icon-svg" :style="clearIconStyle" />
      </div>

      <div class="cui-leak-sensor__info">
        <span v-if="label" class="cui-leak-sensor__label">{{ label }}</span>
        <span class="cui-leak-sensor__status" :class="statusClass">
          {{ detected ? t('components.leak_sensor.detected') : t('components.leak_sensor.clear') }}
        </span>
      </div>

      <div class="cui-leak-sensor__indicator" :class="indicatorClass" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_LEAK_SENSOR_DEFAULTS } from './types.js';

import type { CuiLeakSensorProps } from './types.js';

const props = withDefaults(defineProps<CuiLeakSensorProps>(), CUI_LEAK_SENSOR_DEFAULTS);

const { t } = useI18n();

const { detected } = toRefs(props);

const detectedIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(59, 130, 246)',
  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.5))',
}));

const clearIconStyle = computed<Record<string, string>>(() => ({
  color: 'var(--text-secondary-color)',
}));

const statusClass = computed(() => (detected.value ? 'cui-leak-sensor__status--detected' : 'cui-leak-sensor__status--clear'));

const indicatorClass = computed(() => (detected.value ? 'cui-leak-sensor__indicator--detected' : 'cui-leak-sensor__indicator--clear'));
</script>

<style scoped>
.cui-leak-sensor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-leak-sensor--disabled {
  opacity: 0.6;
}

/* Header */
.cui-leak-sensor__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-leak-sensor__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-leak-sensor__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-leak-sensor__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-leak-sensor__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-leak-sensor__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.cui-leak-sensor__status--detected {
  color: rgb(59, 130, 246);
}

.cui-leak-sensor__status--clear {
  color: var(--text-secondary-color);
}

/* Indicator dot */
.cui-leak-sensor__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.cui-leak-sensor__indicator--detected {
  background-color: rgb(59, 130, 246);
  box-shadow: 0 0 6px rgba(59, 130, 246, 0.6);
  animation: pulse-indicator 1.5s ease-in-out infinite;
}

.cui-leak-sensor__indicator--clear {
  background-color: var(--text-secondary-color);
}

@keyframes pulse-indicator {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

/* Size variants */
.cui-leak-sensor--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-leak-sensor--small .cui-leak-sensor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-leak-sensor--small .cui-leak-sensor__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-leak-sensor--small .cui-leak-sensor__label {
  font-size: 0.75rem;
}

.cui-leak-sensor--small .cui-leak-sensor__status {
  font-size: 0.625rem;
}

.cui-leak-sensor--small .cui-leak-sensor__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-leak-sensor--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-leak-sensor--large .cui-leak-sensor__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-leak-sensor--large .cui-leak-sensor__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-leak-sensor--large .cui-leak-sensor__label {
  font-size: 1rem;
}

.cui-leak-sensor--large .cui-leak-sensor__status {
  font-size: 0.875rem;
}

.cui-leak-sensor--large .cui-leak-sensor__indicator {
  width: 0.625rem;
  height: 0.625rem;
}
</style>
