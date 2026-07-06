<template>
  <div class="cui-security-system" :class="[`cui-security-system--${size}`, { 'cui-security-system--disabled': disabled }]">
    <div class="cui-security-system__header">
      <div class="cui-security-system__icon">
        <i-mdi:shield-alert v-if="isAlarmTriggered" class="cui-security-system__icon-svg" :style="alarmIconStyle" />
        <i-mdi:shield-check v-else-if="isArmed" class="cui-security-system__icon-svg" :style="armedIconStyle" />
        <i-mdi:shield-off-outline v-else class="cui-security-system__icon-svg" />
      </div>

      <div class="cui-security-system__info">
        <span v-if="label" class="cui-security-system__label">{{ label }}</span>
        <span class="cui-security-system__status" :class="statusClass">{{ statusText }}</span>
      </div>
    </div>

    <div v-if="isAlarmTriggered" class="cui-security-system__alarm">
      <i-mdi:alarm-light class="cui-security-system__alarm-icon" />
      <span>{{ t('components.security_system.alarm_triggered') }}</span>
      <Button size="small" severity="danger" :label="t('components.security_system.reset')" @click="resetAlarm" />
    </div>

    <div class="cui-security-system__modes">
      <button
        type="button"
        class="cui-security-system__mode"
        :class="{ 'cui-security-system__mode--active': targetStateValue === SecuritySystemState.Disarmed }"
        :disabled="disabled || isAlarmTriggered"
        @click="setTargetState(SecuritySystemState.Disarmed)"
      >
        <i-mdi:shield-off-outline class="cui-security-system__mode-icon" />
        <span>{{ t('components.security_system.off') }}</span>
      </button>

      <button
        type="button"
        class="cui-security-system__mode"
        :class="{ 'cui-security-system__mode--active': targetStateValue === SecuritySystemState.StayArm }"
        :disabled="disabled || isAlarmTriggered"
        @click="setTargetState(SecuritySystemState.StayArm)"
      >
        <i-mdi:home class="cui-security-system__mode-icon" />
        <span>{{ t('components.security_system.home') }}</span>
      </button>

      <button
        type="button"
        class="cui-security-system__mode"
        :class="{ 'cui-security-system__mode--active': targetStateValue === SecuritySystemState.AwayArm }"
        :disabled="disabled || isAlarmTriggered"
        @click="setTargetState(SecuritySystemState.AwayArm)"
      >
        <i-mdi:exit-run class="cui-security-system__mode-icon" />
        <span>{{ t('components.security_system.away') }}</span>
      </button>

      <button
        type="button"
        class="cui-security-system__mode"
        :class="{ 'cui-security-system__mode--active': targetStateValue === SecuritySystemState.NightArm }"
        :disabled="disabled || isAlarmTriggered"
        @click="setTargetState(SecuritySystemState.NightArm)"
      >
        <i-mdi:weather-night class="cui-security-system__mode-icon" />
        <span>{{ t('components.security_system.night') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { SecuritySystemState } from './types.js';

import type { CuiSecuritySystemEmits, CuiSecuritySystemProps } from './types.js';

const props = withDefaults(defineProps<CuiSecuritySystemProps>(), {
  currentState: SecuritySystemState.Disarmed,
  targetState: SecuritySystemState.Disarmed,
  disabled: false,
  size: 'medium',
});

const emit = defineEmits<CuiSecuritySystemEmits>();

const { t } = useI18n();

const { currentState, targetState } = toRefs(props);

const currentStateValue = computed({
  get: () => currentState.value,
  set: (value: SecuritySystemState) => emit('update:currentState', value),
});

const targetStateValue = computed({
  get: () => targetState.value,
  set: (value: SecuritySystemState) => emit('update:targetState', value),
});

const isAlarmTriggered = computed(() => currentStateValue.value === SecuritySystemState.AlarmTriggered);

const isArmed = computed(
  () =>
    currentStateValue.value === SecuritySystemState.StayArm ||
    currentStateValue.value === SecuritySystemState.AwayArm ||
    currentStateValue.value === SecuritySystemState.NightArm,
);

const isTransitioning = computed(() => !isAlarmTriggered.value && targetStateValue.value !== currentStateValue.value);

const statusText = computed(() => {
  if (isTransitioning.value) {
    if (targetStateValue.value === SecuritySystemState.Disarmed) {
      return t('components.security_system.status_disarming');
    }
    return t('components.security_system.status_arming');
  }

  switch (currentStateValue.value) {
    case SecuritySystemState.StayArm:
      return t('components.security_system.status_home_armed');
    case SecuritySystemState.AwayArm:
      return t('components.security_system.status_away_armed');
    case SecuritySystemState.NightArm:
      return t('components.security_system.status_night_armed');
    case SecuritySystemState.Disarmed:
      return t('components.security_system.status_disarmed');
    case SecuritySystemState.AlarmTriggered:
      return t('components.security_system.status_alarm');
    default:
      return t('components.security_system.status_unknown');
  }
});

const statusClass = computed(() => {
  if (isAlarmTriggered.value) return 'cui-security-system__status--alarm';
  if (isTransitioning.value) return 'cui-security-system__status--transitioning';
  if (isArmed.value) return 'cui-security-system__status--armed';
  return 'cui-security-system__status--disarmed';
});

const alarmIconStyle = computed(() => ({
  color: 'rgb(239, 68, 68)',
  filter: 'drop-shadow(0 0 12px rgba(239, 68, 68, 0.8))',
  animation: 'pulse 0.5s ease-in-out infinite alternate',
}));

const armedIconStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))',
}));

function setTargetState(state: SecuritySystemState) {
  targetStateValue.value = state;
}

function resetAlarm() {
  currentStateValue.value = targetStateValue.value;
}
</script>

<style scoped>
.cui-security-system {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-security-system--disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Header */
.cui-security-system__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-security-system__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-security-system__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-security-system__info {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cui-security-system__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-security-system__status {
  font-size: 0.75rem;
  font-weight: 500;
}

.cui-security-system__status--disarmed {
  color: var(--text-secondary-color);
}

.cui-security-system__status--armed {
  color: rgb(34, 197, 94);
}

.cui-security-system__status--transitioning {
  color: rgb(234, 179, 8);
  animation: pulse-text 1s ease-in-out infinite;
}

@keyframes pulse-text {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.cui-security-system__status--alarm {
  color: rgb(239, 68, 68);
  animation: blink 0.5s ease-in-out infinite alternate;
}

@keyframes blink {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.5;
  }
}

@keyframes pulse {
  from {
    transform: scale(1);
  }

  to {
    transform: scale(1.1);
  }
}

/* Alarm Banner */
.cui-security-system__alarm {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem;
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  color: rgb(239, 68, 68);
  font-weight: 500;
  font-size: 0.75rem;
}

.cui-security-system__alarm-icon {
  width: 1rem;
  height: 1rem;
  animation: pulse 0.5s ease-in-out infinite alternate;
}

.cui-security-system__alarm :deep(.p-button) {
  margin-left: auto;
}

/* Mode Buttons */
.cui-security-system__modes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.375rem;
}

.cui-security-system__mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
  padding: 0.5rem 0.25rem;
  border: 1px solid var(--surface-border);
  border-radius: 0.375rem;
  background-color: var(--surface-ground);
  color: var(--text-secondary-color);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.625rem;
  font-weight: 500;
}

.cui-security-system__mode:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cui-security-system__mode--active {
  background-color: var(--primary-500);
  border-color: var(--primary-500);
  color: #fff;
}

.cui-security-system__mode--active:hover:not(:disabled) {
  background-color: var(--primary-600);
}

.cui-security-system__mode-icon {
  width: 1.125rem;
  height: 1.125rem;
}

/* Size variants */
.cui-security-system--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-security-system--small .cui-security-system__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-security-system--small .cui-security-system__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-security-system--small .cui-security-system__label {
  font-size: 0.75rem;
}

.cui-security-system--small .cui-security-system__status {
  font-size: 0.625rem;
}

.cui-security-system--small .cui-security-system__mode {
  padding: 0.375rem 0.125rem;
  font-size: 0.5rem;
}

.cui-security-system--small .cui-security-system__mode-icon {
  width: 0.875rem;
  height: 0.875rem;
}

.cui-security-system--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-security-system--large .cui-security-system__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-security-system--large .cui-security-system__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-security-system--large .cui-security-system__label {
  font-size: 1rem;
}

.cui-security-system--large .cui-security-system__status {
  font-size: 0.875rem;
}

.cui-security-system--large .cui-security-system__mode {
  padding: 0.625rem 0.375rem;
  font-size: 0.75rem;
}

.cui-security-system--large .cui-security-system__mode-icon {
  width: 1.375rem;
  height: 1.375rem;
}
</style>
