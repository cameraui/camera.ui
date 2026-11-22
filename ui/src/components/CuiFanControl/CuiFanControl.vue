<template>
  <div class="cui-fan-control" :class="[`cui-fan-control--${size}`, { 'cui-fan-control--disabled': disabled }]">
    <div class="cui-fan-control__header">
      <div class="cui-fan-control__icon">
        <component :is="icon" class="cui-fan-control__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-fan-control__info">
        <span v-if="label" class="cui-fan-control__label">{{ label }}</span>
        <span v-if="status" class="cui-fan-control__status">{{ status }}</span>
      </div>

      <ToggleSwitch :model-value="on" :disabled class="cui-fan-control__toggle" @update:model-value="(value: boolean) => emit('update:on', value)" />
    </div>

    <div v-if="hasSpeed" class="cui-fan-control__setting">
      <div class="cui-fan-control__row">
        <span class="cui-fan-control__row-label">{{ t('components.automation_nodes.sensor_property_speed') }}</span>
        <span class="cui-fan-control__row-value">{{ speedValue }} %</span>
      </div>
      <Slider v-model="speedValue" :min="0" :max="100" :step="speedStep" :disabled class="w-full" />
    </div>

    <div v-if="hasDirection" class="cui-fan-control__row">
      <span class="cui-fan-control__row-label">{{ t('components.automation_nodes.sensor_property_direction') }}</span>
      <Select
        :model-value="direction"
        :options="directions"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: FanDirection) => emit('update:direction', value)"
      />
    </div>

    <div v-if="hasOscillation" class="cui-fan-control__row">
      <span class="cui-fan-control__row-label">{{ t('components.automation_nodes.sensor_property_oscillating') }}</span>
      <ToggleSwitch :model-value="oscillating" :disabled @update:model-value="(value: boolean) => emit('update:oscillating', value)" />
    </div>

    <div v-if="presets?.length" class="cui-fan-control__row">
      <span class="cui-fan-control__row-label">{{ t('components.automation_nodes.sensor_property_preset') }}</span>
      <Select
        :model-value="preset"
        :options="presets"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: string) => emit('update:preset', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { FanDirection } from '@camera.ui/sdk';

import { useRestingValue } from '@/composables/useRestingValue.js';
import { CUI_FAN_CONTROL_DEFAULTS } from './types.js';

import type { CuiFanControlEmits, CuiFanControlProps } from './types.js';

const props = withDefaults(defineProps<CuiFanControlProps>(), CUI_FAN_CONTROL_DEFAULTS);
const emit = defineEmits<CuiFanControlEmits>();

const { t } = useI18n();

const { speed } = toRefs(props);

const speedValue = useRestingValue(speed, (value) => emit('update:speed', value));

const directions = computed(() => Object.values(FanDirection).map((value) => ({ label: t(`components.automation_nodes.fan_state_${value}`), value })));
</script>

<style scoped>
.cui-fan-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-fan-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-fan-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-fan-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-fan-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-fan-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-fan-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-fan-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-fan-control__toggle {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-fan-control__setting {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.cui-fan-control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
}

.cui-fan-control__row-label,
.cui-fan-control__row-value {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-fan-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-fan-control--small .cui-fan-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-fan-control--small .cui-fan-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-fan-control--small .cui-fan-control__label {
  font-size: 0.75rem;
}

.cui-fan-control--small .cui-fan-control__status {
  font-size: 0.625rem;
}

.cui-fan-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-fan-control--large .cui-fan-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-fan-control--large .cui-fan-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-fan-control--large .cui-fan-control__label {
  font-size: 1rem;
}

.cui-fan-control--large .cui-fan-control__status {
  font-size: 0.875rem;
}
</style>
