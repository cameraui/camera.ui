<template>
  <div class="cui-cover-control" :class="[`cui-cover-control--${size}`, { 'cui-cover-control--disabled': disabled }]">
    <div class="cui-cover-control__header">
      <div class="cui-cover-control__icon">
        <component :is="icon" class="cui-cover-control__icon-svg" :style="iconStyle" />
        <span v-if="obstructionDetected" class="cui-cover-control__obstruction" />
      </div>

      <div class="cui-cover-control__info">
        <span v-if="label" class="cui-cover-control__label">{{ label }}</span>
        <span class="cui-cover-control__status" :class="statusClass">{{ statusText }}</span>
      </div>

      <Button
        v-if="canStop"
        :disabled
        size="small"
        severity="secondary"
        text
        rounded
        class="cui-cover-control__stop"
        :aria-label="t('components.cover_control.stop')"
        @click="emit('stop')"
      >
        <template #icon>
          <i-mdi:stop />
        </template>
      </Button>

      <ToggleSwitch :model-value="isOpen" :disabled class="shrink-0" :class="{ 'ml-auto': !canStop }" @update:model-value="onToggle" />
    </div>

    <div v-if="hasPosition" class="cui-cover-control__setting">
      <div class="cui-cover-control__setting-header">
        <i-mdi:arrow-expand-vertical class="cui-cover-control__setting-icon" />
        <span class="cui-cover-control__setting-value">{{ positionValue }} %</span>
      </div>

      <Slider v-model="positionValue" :min="0" :max="100" :disabled class="w-full" />
    </div>

    <div v-if="hasTilt" class="cui-cover-control__setting">
      <div class="cui-cover-control__setting-header">
        <i-mdi:angle-acute class="cui-cover-control__setting-icon" />
        <span class="cui-cover-control__setting-value">{{ tiltValue }} %</span>
      </div>

      <Slider v-model="tiltValue" :min="0" :max="100" :disabled class="w-full" />
    </div>

    <div v-if="hasDuration" class="cui-cover-control__setting-header">
      <i-mdi:timer-outline class="cui-cover-control__setting-icon" />
      <span class="cui-cover-control__setting-label">{{ t('components.automation_nodes.sensor_property_duration') }}</span>
      <CuiNumberStepper v-model="durationMinutes" :min="0" :max="Math.floor(durationMax / 60)" :step="1" suffix=" min" size="small" :disabled class="ml-auto" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CoverState } from '@camera.ui/sdk';

import { useRestingValue } from '@/composables/useRestingValue.js';
import { CUI_COVER_CONTROL_DEFAULTS } from './types.js';

import type { CuiCoverControlEmits, CuiCoverControlProps } from './types.js';

const props = withDefaults(defineProps<CuiCoverControlProps>(), CUI_COVER_CONTROL_DEFAULTS);
const emit = defineEmits<CuiCoverControlEmits>();

const { t } = useI18n();

const { currentState, position, targetPosition, tilt, hasPosition, duration, remaining } = toRefs(props);

const STATE_NAMES: Record<CoverState, string> = {
  [CoverState.Open]: 'open',
  [CoverState.Closed]: 'closed',
  [CoverState.Opening]: 'opening',
  [CoverState.Closing]: 'closing',
  [CoverState.Stopped]: 'stopped',
};

const positionValue = useRestingValue(targetPosition, (value) => emit('update:targetPosition', value));
const tiltValue = useRestingValue(tilt, (value) => emit('update:targetTilt', value));
const durationMinutes = useRestingValue(
  computed(() => Math.round(duration.value / 60)),
  (value) => emit('update:duration', value * 60),
);

const isOpen = computed(() => currentState.value === CoverState.Open || currentState.value === CoverState.Opening);

const statusText = computed(() => {
  const name = STATE_NAMES[currentState.value];
  if (!name) return '';
  const state = t(`components.sensor_state.${name}`);
  const partly = currentState.value === CoverState.Open || currentState.value === CoverState.Stopped;
  if (hasPosition.value && partly) return `${state} · ${position.value} %`;
  return remaining.value > 0 ? `${state} · ${clock(remaining.value)}` : state;
});

const statusClass = computed(() => {
  switch (currentState.value) {
    case CoverState.Open:
      return 'cui-cover-control__status--open';
    case CoverState.Opening:
    case CoverState.Closing:
      return 'cui-cover-control__status--transitioning';
    case CoverState.Stopped:
      return 'cui-cover-control__status--stopped';
    default:
      return '';
  }
});

const iconStyle = computed(() => {
  switch (currentState.value) {
    case CoverState.Open:
      return { color: 'rgb(34, 197, 94)', filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))' };
    case CoverState.Opening:
    case CoverState.Closing:
      return { color: 'rgb(250, 204, 21)', filter: 'drop-shadow(0 0 8px rgba(250, 204, 21, 0.5))' };
    case CoverState.Stopped:
      return { color: 'rgb(251, 146, 60)' };
    default:
      return undefined;
  }
});

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function onToggle(open: boolean) {
  emit('update:targetState', open ? CoverState.Open : CoverState.Closed);
}
</script>

<style scoped>
.cui-cover-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-cover-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-cover-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-cover-control__icon {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-cover-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-cover-control__obstruction {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: rgb(239, 68, 68);
  box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
}

.cui-cover-control__info {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.cui-cover-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-cover-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-cover-control__status--open {
  color: rgb(34, 197, 94);
}

.cui-cover-control__status--transitioning {
  color: rgb(250, 204, 21);
  animation: cui-cover-pulse-text 1s ease-in-out infinite;
}

.cui-cover-control__status--stopped {
  color: rgb(251, 146, 60);
}

@keyframes cui-cover-pulse-text {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.cui-cover-control__stop {
  margin-left: auto;
  flex-shrink: 0;
}

.cui-cover-control__setting {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.25rem;
}

.cui-cover-control__setting-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-cover-control__setting-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-secondary-color);
}

.cui-cover-control__setting-label {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-cover-control__setting-value {
  font-size: 0.875rem;
  color: var(--text-secondary-color);
  margin-left: auto;
}

.cui-cover-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-cover-control--small .cui-cover-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-cover-control--small .cui-cover-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-cover-control--small .cui-cover-control__label {
  font-size: 0.75rem;
}

.cui-cover-control--small .cui-cover-control__status {
  font-size: 0.625rem;
}

.cui-cover-control--small .cui-cover-control__setting-value {
  font-size: 0.75rem;
}

.cui-cover-control--small .cui-cover-control__obstruction {
  width: 6px;
  height: 6px;
}

.cui-cover-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-cover-control--large .cui-cover-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-cover-control--large .cui-cover-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-cover-control--large .cui-cover-control__label {
  font-size: 1rem;
}

.cui-cover-control--large .cui-cover-control__status {
  font-size: 0.875rem;
}
</style>
