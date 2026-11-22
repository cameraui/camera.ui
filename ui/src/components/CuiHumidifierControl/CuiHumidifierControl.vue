<template>
  <div class="cui-humidifier-control" :class="[`cui-humidifier-control--${size}`, { 'cui-humidifier-control--disabled': disabled }]">
    <div class="cui-humidifier-control__header">
      <div class="cui-humidifier-control__icon">
        <component :is="icon" class="cui-humidifier-control__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-humidifier-control__info">
        <span v-if="label" class="cui-humidifier-control__label">{{ label }}</span>
        <span v-if="status" class="cui-humidifier-control__status">{{ status }}</span>
      </div>

      <ToggleSwitch :model-value="on" :disabled class="cui-humidifier-control__toggle" @update:model-value="(value: boolean) => emit('update:on', value)" />
    </div>

    <div class="cui-humidifier-control__row">
      <span class="cui-humidifier-control__row-label">{{ t('components.automation_nodes.sensor_property_targetHumidity') }}</span>
      <CuiNumberStepper v-model="humidityValue" :min :max :step :suffix="` ${unit}`" size="small" :disabled />
    </div>

    <div v-if="modes?.length" class="cui-humidifier-control__row">
      <span class="cui-humidifier-control__row-label">{{ t('components.automation_nodes.sensor_property_mode') }}</span>
      <Select
        :model-value="mode"
        :options="modes"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: string) => emit('update:mode', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRestingValue } from '@/composables/useRestingValue.js';
import { CUI_HUMIDIFIER_CONTROL_DEFAULTS } from './types.js';

import type { CuiHumidifierControlEmits, CuiHumidifierControlProps } from './types.js';

const props = withDefaults(defineProps<CuiHumidifierControlProps>(), CUI_HUMIDIFIER_CONTROL_DEFAULTS);
const emit = defineEmits<CuiHumidifierControlEmits>();

const { t } = useI18n();

const { targetHumidity } = toRefs(props);

const humidityValue = useRestingValue(targetHumidity, (value) => emit('update:targetHumidity', value), 800);
</script>

<style scoped>
.cui-humidifier-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-humidifier-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-humidifier-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-humidifier-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-humidifier-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-humidifier-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-humidifier-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-humidifier-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-humidifier-control__toggle {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-humidifier-control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
}

.cui-humidifier-control__row-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-humidifier-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-humidifier-control--small .cui-humidifier-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-humidifier-control--small .cui-humidifier-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-humidifier-control--small .cui-humidifier-control__label {
  font-size: 0.75rem;
}

.cui-humidifier-control--small .cui-humidifier-control__status {
  font-size: 0.625rem;
}

.cui-humidifier-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-humidifier-control--large .cui-humidifier-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-humidifier-control--large .cui-humidifier-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-humidifier-control--large .cui-humidifier-control__label {
  font-size: 1rem;
}

.cui-humidifier-control--large .cui-humidifier-control__status {
  font-size: 0.875rem;
}
</style>
