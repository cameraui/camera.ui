<template>
  <div
    class="cui-smoke-sensor"
    :class="[
      `cui-smoke-sensor--${size}`,
      {
        'cui-smoke-sensor--disabled': disabled,
        'cui-smoke-sensor--clear': !detected,
        'cui-smoke-sensor--detected': detected,
      },
    ]"
  >
    <div class="cui-smoke-sensor__header">
      <div class="cui-smoke-sensor__icon">
        <i-mdi:smoke-detector-variant v-if="detected" class="cui-smoke-sensor__icon-svg" :style="detectedIconStyle" />
        <i-mdi:smoke-detector-variant-off v-else class="cui-smoke-sensor__icon-svg" :style="clearIconStyle" />
      </div>

      <div class="cui-smoke-sensor__info">
        <span v-if="label" class="cui-smoke-sensor__label">{{ label }}</span>
        <span class="cui-smoke-sensor__status" :class="statusClass">
          {{ detected ? t('components.smoke_sensor.detected') : t('components.smoke_sensor.clear') }}
        </span>
      </div>

      <div class="cui-smoke-sensor__indicator" :class="indicatorClass" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_SMOKE_SENSOR_DEFAULTS } from './types.js';

import type { CuiSmokeSensorProps } from './types.js';

const props = withDefaults(defineProps<CuiSmokeSensorProps>(), CUI_SMOKE_SENSOR_DEFAULTS);

const { t } = useI18n();

const { detected } = toRefs(props);

const detectedIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(239, 68, 68)',
  filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.5))',
}));

const clearIconStyle = computed<Record<string, string>>(() => ({
  color: 'var(--text-secondary-color)',
}));

const statusClass = computed(() => (detected.value ? 'cui-smoke-sensor__status--detected' : 'cui-smoke-sensor__status--clear'));

const indicatorClass = computed(() => (detected.value ? 'cui-smoke-sensor__indicator--detected' : 'cui-smoke-sensor__indicator--clear'));
</script>

<style scoped>
.cui-smoke-sensor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-smoke-sensor--disabled {
  opacity: 0.6;
}

/* Header */
.cui-smoke-sensor__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-smoke-sensor__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-smoke-sensor__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-smoke-sensor__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-smoke-sensor__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-smoke-sensor__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.cui-smoke-sensor__status--detected {
  color: rgb(239, 68, 68);
}

.cui-smoke-sensor__status--clear {
  color: var(--text-secondary-color);
}

/* Indicator dot */
.cui-smoke-sensor__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.cui-smoke-sensor__indicator--detected {
  background-color: rgb(239, 68, 68);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
  animation: pulse-indicator 1.5s ease-in-out infinite;
}

.cui-smoke-sensor__indicator--clear {
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
.cui-smoke-sensor--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-smoke-sensor--small .cui-smoke-sensor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-smoke-sensor--small .cui-smoke-sensor__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-smoke-sensor--small .cui-smoke-sensor__label {
  font-size: 0.75rem;
}

.cui-smoke-sensor--small .cui-smoke-sensor__status {
  font-size: 0.625rem;
}

.cui-smoke-sensor--small .cui-smoke-sensor__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-smoke-sensor--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-smoke-sensor--large .cui-smoke-sensor__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-smoke-sensor--large .cui-smoke-sensor__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-smoke-sensor--large .cui-smoke-sensor__label {
  font-size: 1rem;
}

.cui-smoke-sensor--large .cui-smoke-sensor__status {
  font-size: 0.875rem;
}

.cui-smoke-sensor--large .cui-smoke-sensor__indicator {
  width: 0.625rem;
  height: 0.625rem;
}
</style>
