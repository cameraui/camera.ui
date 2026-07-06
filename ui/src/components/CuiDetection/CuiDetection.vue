<template>
  <div
    class="cui-detection"
    :class="[
      `cui-detection--${size}`,
      `cui-detection--${type}`,
      {
        'cui-detection--disabled': disabled,
        'cui-detection--detected': detected,
      },
    ]"
  >
    <div class="cui-detection__header">
      <div class="cui-detection__icon" :class="{ 'cui-detection__icon--detected': detected }">
        <i-mingcute:run-fill v-if="type === 'motion'" class="cui-detection__icon-svg" />
        <i-mdi:cube-scan v-else-if="type === 'object'" class="cui-detection__icon-svg" />
        <i-mdi:microphone v-else-if="type === 'audio'" class="cui-detection__icon-svg" />
        <i-mdi:face-recognition v-else-if="type === 'face'" class="cui-detection__icon-svg" />
        <i-mdi:car v-else-if="type === 'licensePlate'" class="cui-detection__icon-svg" />
      </div>

      <div class="cui-detection__info">
        <span v-if="label" class="cui-detection__label">{{ label }}</span>
        <span class="cui-detection__status" :class="{ 'cui-detection__status--detected': detected }">
          {{ statusText }}
        </span>
      </div>

      <div class="cui-detection__indicator" :class="{ 'cui-detection__indicator--detected': detected }" />
    </div>

    <div v-if="detections && detections.length > 0" class="cui-detection__detections">
      <span v-for="(detection, index) in detections" :key="index" class="cui-detection__detection-tag">
        {{ detection }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_DETECTION_DEFAULTS } from './types.js';

import type { CuiDetectionProps } from './types.js';

const props = withDefaults(defineProps<CuiDetectionProps>(), CUI_DETECTION_DEFAULTS);

const { t } = useI18n();

const { detected } = toRefs(props);

const statusText = computed(() => {
  if (detected.value) {
    return t('components.detection.detected');
  }
  return t('components.detection.idle');
});
</script>

<style scoped>
.cui-detection {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-detection--detected {
  border-color: rgba(34, 197, 94, 0.3);
}

.cui-detection--disabled {
  opacity: 0.6;
}

/* Header */
.cui-detection__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-detection__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-detection__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition: color 0.2s ease;
}

.cui-detection__icon--detected .cui-detection__icon-svg {
  color: rgb(34, 197, 94);
}

.cui-detection__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-detection__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-detection__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-detection__status--detected {
  color: rgb(34, 197, 94);
}

/* Indicator dot */
.cui-detection__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: var(--surface-300);
  transition: all 0.2s ease;
}

.cui-detection__indicator--detected {
  background-color: rgb(34, 197, 94);
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
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

/* Detections tags */
.cui-detection__detections {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding-top: 0.5rem;
}

.cui-detection__detection-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  background: rgba(34, 197, 94, 0.15);
  color: rgb(34, 197, 94);
  border-radius: 1rem;
  text-transform: capitalize;
}

/* Size variants */
.cui-detection--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-detection--small .cui-detection__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-detection--small .cui-detection__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-detection--small .cui-detection__label {
  font-size: 0.75rem;
}

.cui-detection--small .cui-detection__status {
  font-size: 0.625rem;
}

.cui-detection--small .cui-detection__indicator {
  width: 0.375rem;
  height: 0.375rem;
}

.cui-detection--small .cui-detection__detection-tag {
  font-size: 0.5rem;
  padding: 0.0625rem 0.375rem;
}

.cui-detection--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-detection--large .cui-detection__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-detection--large .cui-detection__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-detection--large .cui-detection__label {
  font-size: 1rem;
}

.cui-detection--large .cui-detection__status {
  font-size: 0.875rem;
}

.cui-detection--large .cui-detection__indicator {
  width: 0.625rem;
  height: 0.625rem;
}

.cui-detection--large .cui-detection__detection-tag {
  font-size: 0.75rem;
  padding: 0.1875rem 0.625rem;
}
</style>
