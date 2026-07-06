<template>
  <div
    class="cui-contact-sensor"
    :class="[
      `cui-contact-sensor--${size}`,
      {
        'cui-contact-sensor--disabled': disabled,
        'cui-contact-sensor--open': !detected,
        'cui-contact-sensor--closed': detected,
      },
    ]"
  >
    <div class="cui-contact-sensor__header">
      <div class="cui-contact-sensor__icon">
        <i-lucide:door-closed v-if="detected" class="cui-contact-sensor__icon-svg" :style="closedIconStyle" />
        <i-lucide:door-open v-else class="cui-contact-sensor__icon-svg" :style="openIconStyle" />
      </div>

      <div class="cui-contact-sensor__info">
        <span v-if="label" class="cui-contact-sensor__label">{{ label }}</span>
        <span class="cui-contact-sensor__status" :class="statusClass">
          {{ detected ? t('components.contact_sensor.closed') : t('components.contact_sensor.open') }}
        </span>
      </div>

      <div class="cui-contact-sensor__indicator" :class="indicatorClass" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_CONTACT_SENSOR_DEFAULTS } from './types.js';

import type { CuiContactSensorProps } from './types.js';

const props = withDefaults(defineProps<CuiContactSensorProps>(), CUI_CONTACT_SENSOR_DEFAULTS);

const { t } = useI18n();

const { detected } = toRefs(props);

const closedIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 6px rgba(34, 197, 94, 0.5))',
}));

const openIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(251, 146, 60)',
  filter: 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.6))',
}));

const statusClass = computed(() => (detected.value ? 'cui-contact-sensor__status--closed' : 'cui-contact-sensor__status--open'));

const indicatorClass = computed(() => (detected.value ? 'cui-contact-sensor__indicator--closed' : 'cui-contact-sensor__indicator--open'));
</script>

<style scoped>
.cui-contact-sensor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-contact-sensor--disabled {
  opacity: 0.6;
}

/* Header */
.cui-contact-sensor__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-contact-sensor__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-contact-sensor__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-contact-sensor__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-contact-sensor__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-contact-sensor__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.cui-contact-sensor__status--closed {
  color: rgb(34, 197, 94);
}

.cui-contact-sensor__status--open {
  color: rgb(251, 146, 60);
}

/* Indicator dot */
.cui-contact-sensor__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  transition: background-color 0.2s ease;
}

.cui-contact-sensor__indicator--closed {
  background-color: rgb(34, 197, 94);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.cui-contact-sensor__indicator--open {
  background-color: rgb(251, 146, 60);
  box-shadow: 0 0 6px rgba(251, 146, 60, 0.6);
  animation: pulse-indicator 1.5s ease-in-out infinite;
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
.cui-contact-sensor--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-contact-sensor--small .cui-contact-sensor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-contact-sensor--small .cui-contact-sensor__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-contact-sensor--small .cui-contact-sensor__label {
  font-size: 0.75rem;
}

.cui-contact-sensor--small .cui-contact-sensor__status {
  font-size: 0.625rem;
}

.cui-contact-sensor--small .cui-contact-sensor__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-contact-sensor--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-contact-sensor--large .cui-contact-sensor__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-contact-sensor--large .cui-contact-sensor__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-contact-sensor--large .cui-contact-sensor__label {
  font-size: 1rem;
}

.cui-contact-sensor--large .cui-contact-sensor__status {
  font-size: 0.875rem;
}

.cui-contact-sensor--large .cui-contact-sensor__indicator {
  width: 0.625rem;
  height: 0.625rem;
}
</style>
