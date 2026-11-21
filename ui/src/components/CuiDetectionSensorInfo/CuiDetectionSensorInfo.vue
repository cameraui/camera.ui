<template>
  <div
    class="cui-detection-info"
    :class="[
      `cui-detection-info--${size}`,
      {
        'cui-detection-info--active': detected,
      },
    ]"
  >
    <div class="cui-detection-info__header">
      <div class="cui-detection-info__icon">
        <component :is="sensorTypeIcon(type)" class="cui-detection-info__icon-svg" :style="detected ? activeIconStyle : undefined" />
      </div>

      <div class="cui-detection-info__info">
        <span v-if="label" class="cui-detection-info__label">{{ label }}</span>
        <span class="cui-detection-info__status" :class="detected ? 'cui-detection-info__status--active' : 'cui-detection-info__status--idle'">
          {{ statusText }}
        </span>
      </div>

      <span v-if="decibels !== undefined" class="cui-detection-info__decibels">{{ Math.round(decibels) }} dB</span>

      <div class="cui-detection-info__indicator" :class="detected ? 'cui-detection-info__indicator--active' : 'cui-detection-info__indicator--idle'" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorTypeIcon } from '@/common/sensorDisplay.js';
import { CUI_DETECTION_SENSOR_INFO_DEFAULTS } from './types.js';

import type { CuiDetectionSensorInfoProps } from './types.js';

const props = withDefaults(defineProps<CuiDetectionSensorInfoProps>(), CUI_DETECTION_SENSOR_INFO_DEFAULTS);

const { t } = useI18n();

const activeIconStyle: Record<string, string> = {
  color: 'rgb(251, 146, 60)',
  filter: 'drop-shadow(0 0 8px rgba(251, 146, 60, 0.6))',
};

const statusText = computed(() => {
  if (!props.detected) return t('components.detection_sensor.idle');
  const labels = (props.labels ?? []).filter(Boolean);
  return labels.length ? labels.join(', ') : t('components.detection_sensor.detected');
});
</script>

<style scoped>
.cui-detection-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-detection-info__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-detection-info__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-detection-info__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-detection-info__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.cui-detection-info__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-detection-info__status {
  font-size: 0.75rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cui-detection-info__status--active {
  color: rgb(251, 146, 60);
}

.cui-detection-info__status--idle {
  color: var(--text-secondary-color);
}

.cui-detection-info__decibels {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
  flex-shrink: 0;
}

.cui-detection-info__indicator {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
  transition: background-color 0.2s ease;
}

.cui-detection-info__indicator--active {
  background-color: rgb(251, 146, 60);
  box-shadow: 0 0 6px rgba(251, 146, 60, 0.6);
  animation: pulse-indicator 1.5s ease-in-out infinite;
}

.cui-detection-info__indicator--idle {
  background-color: var(--border-color);
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

.cui-detection-info--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-detection-info--small .cui-detection-info__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-detection-info--small .cui-detection-info__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-detection-info--small .cui-detection-info__label {
  font-size: 0.75rem;
}

.cui-detection-info--small .cui-detection-info__status {
  font-size: 0.625rem;
}

.cui-detection-info--small .cui-detection-info__indicator {
  width: 0.375rem;
  height: 0.375rem;
}
</style>
