<template>
  <div class="cui-measurement-info" :class="[`cui-measurement-info--${size}`, { 'cui-measurement-info--disabled': disabled }]">
    <div class="cui-measurement-info__header">
      <div class="cui-measurement-info__icon">
        <component :is="typeIcon" class="cui-measurement-info__icon-svg" />
      </div>

      <div class="cui-measurement-info__info">
        <span v-if="label" class="cui-measurement-info__label">{{ label }}</span>
        <span class="cui-measurement-info__value">{{ value ?? '--' }}</span>
        <span v-if="details" class="cui-measurement-info__value">{{ details }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorTypeIcon } from '@/common/sensorDisplay.js';
import { CUI_MEASUREMENT_INFO_DEFAULTS } from './types.js';

import type { CuiMeasurementInfoProps } from './types.js';

const props = withDefaults(defineProps<CuiMeasurementInfoProps>(), CUI_MEASUREMENT_INFO_DEFAULTS);

const { type } = toRefs(props);

const typeIcon = computed(() => sensorTypeIcon(type.value));
</script>

<style scoped>
.cui-measurement-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-measurement-info--disabled {
  opacity: 0.6;
}

.cui-measurement-info__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-measurement-info__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-measurement-info__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
}

.cui-measurement-info__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-measurement-info__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-measurement-info__value {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-measurement-info--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-measurement-info--small .cui-measurement-info__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-measurement-info--small .cui-measurement-info__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-measurement-info--small .cui-measurement-info__label {
  font-size: 0.75rem;
}

.cui-measurement-info--small .cui-measurement-info__value {
  font-size: 0.625rem;
}

.cui-measurement-info--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-measurement-info--large .cui-measurement-info__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-measurement-info--large .cui-measurement-info__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-measurement-info--large .cui-measurement-info__label {
  font-size: 1rem;
}

.cui-measurement-info--large .cui-measurement-info__value {
  font-size: 0.875rem;
}
</style>
