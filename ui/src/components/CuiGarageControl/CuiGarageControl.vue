<template>
  <div class="cui-garage-control" :class="[`cui-garage-control--${size}`, { 'cui-garage-control--disabled': disabled }]">
    <div class="cui-garage-control__header">
      <div class="cui-garage-control__icon">
        <i-mdi:garage-alert-variant v-if="currentState === GarageState.Stopped" class="cui-garage-control__icon-svg" :style="stoppedIconStyle" />
        <i-mdi:garage-open-variant
          v-else-if="currentState === GarageState.Open || currentState === GarageState.Opening"
          class="cui-garage-control__icon-svg"
          :style="currentState === GarageState.Open ? openIconStyle : transitioningIconStyle"
        />
        <i-mdi:garage-variant v-else class="cui-garage-control__icon-svg" :style="currentState === GarageState.Closing ? transitioningIconStyle : undefined" />

        <span v-if="obstructionDetected" class="cui-garage-control__obstruction" />
      </div>

      <div class="cui-garage-control__info">
        <span v-if="label" class="cui-garage-control__label">{{ label }}</span>
        <span class="cui-garage-control__status" :class="statusClass">{{ statusText }}</span>
      </div>

      <ToggleSwitch :model-value="isOpen" :disabled="disabled" class="ml-auto shrink-0" @update:model-value="onToggle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_GARAGE_CONTROL_DEFAULTS, GarageState, GarageTargetState } from './types.js';

import type { CuiGarageControlEmits, CuiGarageControlProps } from './types.js';

const props = withDefaults(defineProps<CuiGarageControlProps>(), CUI_GARAGE_CONTROL_DEFAULTS);
const emit = defineEmits<CuiGarageControlEmits>();

const { t } = useI18n();

const { currentState } = toRefs(props);

const isOpen = computed(() => currentState.value === GarageState.Open || currentState.value === GarageState.Opening);

const statusText = computed(() => {
  switch (currentState.value) {
    case GarageState.Open:
      return t('components.garage_control.open');
    case GarageState.Closed:
      return t('components.garage_control.closed');
    case GarageState.Opening:
      return t('components.garage_control.opening');
    case GarageState.Closing:
      return t('components.garage_control.closing');
    case GarageState.Stopped:
      return t('components.garage_control.stopped');
    default:
      return '';
  }
});

const statusClass = computed(() => {
  switch (currentState.value) {
    case GarageState.Open:
      return 'cui-garage-control__status--open';
    case GarageState.Opening:
    case GarageState.Closing:
      return 'cui-garage-control__status--transitioning';
    case GarageState.Stopped:
      return 'cui-garage-control__status--stopped';
    default:
      return '';
  }
});

const openIconStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))',
}));

const transitioningIconStyle = computed(() => ({
  color: 'rgb(250, 204, 21)',
  filter: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.5))',
}));

const stoppedIconStyle = computed(() => ({
  color: 'rgb(251, 146, 60)',
}));

function onToggle(open: boolean) {
  emit('update:targetState', open ? GarageTargetState.Open : GarageTargetState.Closed);
}
</script>

<style scoped>
.cui-garage-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-garage-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-garage-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-garage-control__icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-garage-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-garage-control__obstruction {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: rgb(239, 68, 68);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

.cui-garage-control__info {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cui-garage-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-garage-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-garage-control__status--open {
  color: rgb(34, 197, 94);
}

.cui-garage-control__status--transitioning {
  color: rgb(250, 204, 21);
  animation: cui-garage-pulse-text 1s ease-in-out infinite;
}

.cui-garage-control__status--stopped {
  color: rgb(251, 146, 60);
}

@keyframes cui-garage-pulse-text {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

/* Size variants */
.cui-garage-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-garage-control--small .cui-garage-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-garage-control--small .cui-garage-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-garage-control--small .cui-garage-control__label {
  font-size: 0.75rem;
}

.cui-garage-control--small .cui-garage-control__status {
  font-size: 0.625rem;
}

.cui-garage-control--small .cui-garage-control__obstruction {
  width: 6px;
  height: 6px;
}

.cui-garage-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-garage-control--large .cui-garage-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-garage-control--large .cui-garage-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-garage-control--large .cui-garage-control__label {
  font-size: 1rem;
}

.cui-garage-control--large .cui-garage-control__status {
  font-size: 0.875rem;
}
</style>
