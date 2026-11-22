<template>
  <div class="cui-thermostat-control" :class="[`cui-thermostat-control--${size}`, { 'cui-thermostat-control--disabled': disabled }]">
    <div class="cui-thermostat-control__header">
      <div class="cui-thermostat-control__icon">
        <component :is="icon" class="cui-thermostat-control__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-thermostat-control__info">
        <span v-if="label" class="cui-thermostat-control__label">{{ label }}</span>
        <span v-if="status" class="cui-thermostat-control__status">{{ status }}</span>
      </div>

      <Select
        v-if="modes && modes.length > 1"
        :model-value="mode"
        :options="modes"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        class="cui-thermostat-control__mode"
        @update:model-value="(value: string) => emit('update:mode', value)"
      />
    </div>

    <template v-if="showRange">
      <div class="cui-thermostat-control__row">
        <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_targetTemperatureLow') }}</span>
        <CuiNumberStepper v-model="lowValue" v-bind="stepper" />
      </div>
      <div class="cui-thermostat-control__row">
        <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_targetTemperatureHigh') }}</span>
        <CuiNumberStepper v-model="highValue" v-bind="stepper" />
      </div>
    </template>

    <div v-else-if="showTarget" class="cui-thermostat-control__row">
      <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_targetTemperature') }}</span>
      <CuiNumberStepper v-model="targetValue" v-bind="stepper" />
    </div>

    <div v-if="hasTargetHumidity" class="cui-thermostat-control__row">
      <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_targetHumidity') }}</span>
      <CuiNumberStepper v-model="humidityValue" :min="humidityMin" :max="humidityMax" :step="humidityStep" suffix=" %" size="small" :disabled />
    </div>

    <div v-if="presets?.length" class="cui-thermostat-control__row">
      <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_preset') }}</span>
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

    <div v-if="fanModes?.length" class="cui-thermostat-control__row">
      <span class="cui-thermostat-control__row-label">{{ t('components.automation_nodes.sensor_property_fanMode') }}</span>
      <Select
        :model-value="fanMode"
        :options="fanModes"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: string) => emit('update:fanMode', value)"
      />
    </div>

    <div v-for="toggle in toggles" :key="toggle.property" class="cui-thermostat-control__row">
      <span class="cui-thermostat-control__row-label">{{ toggle.label }}</span>
      <ToggleSwitch :model-value="toggle.value" :disabled @update:model-value="(value: boolean) => emit('update:toggle', toggle.property, value)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { shownStep, shownValue, storedValue } from '@/common/units.js';
import { useRestingValue } from '@/composables/useRestingValue.js';
import { CUI_THERMOSTAT_CONTROL_DEFAULTS } from './types.js';

import type { CuiThermostatControlEmits, CuiThermostatControlProps } from './types.js';

const props = withDefaults(defineProps<CuiThermostatControlProps>(), CUI_THERMOSTAT_CONTROL_DEFAULTS);
const emit = defineEmits<CuiThermostatControlEmits>();

const { t } = useI18n();

const { targetTemperature, targetTemperatureLow, targetTemperatureHigh, targetHumidity, min, max, step, disabled } = toRefs(props);

const CELSIUS = '°C';
const STEP_REST = 800;

const targetValue = useRestingValue(shown(targetTemperature), (value) => emit('update:targetTemperature', storedValue(value, CELSIUS)), STEP_REST);
const lowValue = useRestingValue(shown(targetTemperatureLow), (value) => emit('update:targetTemperatureLow', storedValue(value, CELSIUS)), STEP_REST);
const highValue = useRestingValue(shown(targetTemperatureHigh), (value) => emit('update:targetTemperatureHigh', storedValue(value, CELSIUS)), STEP_REST);
const humidityValue = useRestingValue(targetHumidity, (value) => emit('update:targetHumidity', value), STEP_REST);

const stepper = computed(() => ({
  min: shownValue(min.value, CELSIUS).value,
  max: shownValue(max.value, CELSIUS).value,
  step: shownStep(step.value, CELSIUS),
  suffix: ` ${shownValue(0, CELSIUS).unit}`,
  maxFractionDigits: 1,
  size: 'small',
  disabled: disabled.value,
}));

function shown(celsius: Readonly<Ref<number>>) {
  return computed(() => shownValue(celsius.value, CELSIUS).value);
}
</script>

<style scoped>
.cui-thermostat-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-thermostat-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-thermostat-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-thermostat-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-thermostat-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-thermostat-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-thermostat-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-thermostat-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-thermostat-control__mode {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-thermostat-control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
}

.cui-thermostat-control__row-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-thermostat-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-thermostat-control--small .cui-thermostat-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-thermostat-control--small .cui-thermostat-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-thermostat-control--small .cui-thermostat-control__label {
  font-size: 0.75rem;
}

.cui-thermostat-control--small .cui-thermostat-control__status {
  font-size: 0.625rem;
}

.cui-thermostat-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-thermostat-control--large .cui-thermostat-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-thermostat-control--large .cui-thermostat-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-thermostat-control--large .cui-thermostat-control__label {
  font-size: 1rem;
}

.cui-thermostat-control--large .cui-thermostat-control__status {
  font-size: 0.875rem;
}
</style>
