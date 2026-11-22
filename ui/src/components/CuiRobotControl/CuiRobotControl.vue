<template>
  <div class="cui-robot-control" :class="[`cui-robot-control--${size}`, { 'cui-robot-control--disabled': disabled }]">
    <div class="cui-robot-control__header">
      <div class="cui-robot-control__icon">
        <component :is="icon" class="cui-robot-control__icon-svg" :style="iconStyle" />
      </div>

      <div class="cui-robot-control__info">
        <span v-if="label" class="cui-robot-control__label">{{ label }}</span>
        <span v-if="status" class="cui-robot-control__status">{{ status }}</span>
      </div>
    </div>

    <div v-if="commands?.length" class="cui-robot-control__commands">
      <Button
        v-for="command in commands"
        :key="command.value"
        :label="command.label"
        :disabled
        size="small"
        severity="secondary"
        @click="emit('command', command.value)"
      />
    </div>

    <div v-if="fanSpeeds?.length" class="cui-robot-control__row">
      <span class="cui-robot-control__row-label">{{ t('components.automation_nodes.sensor_property_fanSpeed') }}</span>
      <Select
        :model-value="fanSpeed"
        :options="fanSpeeds"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value: string) => emit('update:fanSpeed', value)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_ROBOT_CONTROL_DEFAULTS } from './types.js';

import type { CuiRobotControlEmits, CuiRobotControlProps } from './types.js';

withDefaults(defineProps<CuiRobotControlProps>(), CUI_ROBOT_CONTROL_DEFAULTS);
const emit = defineEmits<CuiRobotControlEmits>();

const { t } = useI18n();
</script>

<style scoped>
.cui-robot-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-robot-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-robot-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-robot-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-robot-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-robot-control__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cui-robot-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-robot-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-robot-control__commands {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.cui-robot-control__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2rem;
}

.cui-robot-control__row-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-robot-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-robot-control--small .cui-robot-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-robot-control--small .cui-robot-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-robot-control--small .cui-robot-control__label {
  font-size: 0.75rem;
}

.cui-robot-control--small .cui-robot-control__status {
  font-size: 0.625rem;
}

.cui-robot-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-robot-control--large .cui-robot-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-robot-control--large .cui-robot-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-robot-control--large .cui-robot-control__label {
  font-size: 1rem;
}

.cui-robot-control--large .cui-robot-control__status {
  font-size: 0.875rem;
}
</style>
