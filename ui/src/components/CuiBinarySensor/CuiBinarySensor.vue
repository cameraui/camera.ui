<template>
  <div
    class="cui-binary-sensor"
    :style="toneColor ? { '--cui-binary-sensor-tone': toneColor } : undefined"
    :class="[
      `cui-binary-sensor--${size}`,
      {
        'cui-binary-sensor--disabled': disabled,
        'cui-binary-sensor--clear': !detected,
        'cui-binary-sensor--detected': detected,
      },
    ]"
  >
    <div class="cui-binary-sensor__header">
      <div class="cui-binary-sensor__icon">
        <component :is="typeIcon" class="cui-binary-sensor__icon-svg" />
      </div>

      <div class="cui-binary-sensor__info">
        <span v-if="label" class="cui-binary-sensor__label">{{ label }}</span>
        <span class="cui-binary-sensor__status">{{ t(sensorStateKey(type, detected)) }}</span>
      </div>

      <div class="cui-binary-sensor__indicator" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorStateKey, sensorToneColor, sensorTypeIcon } from '@/common/sensorDisplay.js';
import { CUI_BINARY_SENSOR_DEFAULTS } from './types.js';

import type { CuiBinarySensorProps } from './types.js';

const props = withDefaults(defineProps<CuiBinarySensorProps>(), CUI_BINARY_SENSOR_DEFAULTS);

const { t } = useI18n();

const { type, detected } = toRefs(props);

const typeIcon = computed(() => sensorTypeIcon(type.value, detected.value));

const toneColor = computed(() => sensorToneColor(type.value, detected.value));
</script>

<style scoped>
.cui-binary-sensor {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-binary-sensor--disabled {
  opacity: 0.6;
}

.cui-binary-sensor__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-binary-sensor__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-binary-sensor__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--cui-binary-sensor-tone, var(--text-secondary-color));
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-binary-sensor__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-binary-sensor__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-binary-sensor__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--cui-binary-sensor-tone, var(--text-secondary-color));
}

.cui-binary-sensor__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: var(--cui-binary-sensor-tone, var(--text-secondary-color));
  transition: background-color 0.2s ease;
}

.cui-binary-sensor--detected .cui-binary-sensor__icon-svg {
  filter: drop-shadow(0 0 6px var(--cui-binary-sensor-tone, transparent));
}

.cui-binary-sensor--detected .cui-binary-sensor__indicator {
  box-shadow: 0 0 6px var(--cui-binary-sensor-tone, transparent);
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

.cui-binary-sensor--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-binary-sensor--small .cui-binary-sensor__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-binary-sensor--small .cui-binary-sensor__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-binary-sensor--small .cui-binary-sensor__label {
  font-size: 0.75rem;
}

.cui-binary-sensor--small .cui-binary-sensor__status {
  font-size: 0.625rem;
}

.cui-binary-sensor--small .cui-binary-sensor__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-binary-sensor--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-binary-sensor--large .cui-binary-sensor__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-binary-sensor--large .cui-binary-sensor__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-binary-sensor--large .cui-binary-sensor__label {
  font-size: 1rem;
}

.cui-binary-sensor--large .cui-binary-sensor__status {
  font-size: 0.875rem;
}

.cui-binary-sensor--large .cui-binary-sensor__indicator {
  width: 0.625rem;
  height: 0.625rem;
}
</style>
