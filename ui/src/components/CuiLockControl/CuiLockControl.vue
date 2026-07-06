<template>
  <div class="cui-lock-control" :class="[`cui-lock-control--${size}`, { 'cui-lock-control--disabled': disabled }]">
    <div class="cui-lock-control__header">
      <div class="cui-lock-control__icon">
        <i-mdi:lock v-if="isSecured" class="cui-lock-control__icon-svg" :style="securedIconStyle" />
        <i-mdi:lock-open-outline v-else class="cui-lock-control__icon-svg" />
      </div>

      <div class="cui-lock-control__info">
        <span v-if="label" class="cui-lock-control__label">{{ label }}</span>
        <span class="cui-lock-control__status" :class="statusClass">{{ statusText }}</span>
      </div>

      <ToggleSwitch :model-value="isSecured" :disabled="disabled" class="ml-auto shrink-0" @update:model-value="onToggle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_LOCK_CONTROL_DEFAULTS, LockState } from './types.js';

import type { CuiLockControlEmits, CuiLockControlProps } from './types.js';

const props = withDefaults(defineProps<CuiLockControlProps>(), CUI_LOCK_CONTROL_DEFAULTS);
const emit = defineEmits<CuiLockControlEmits>();

const { t } = useI18n();

const { currentState, targetState } = toRefs(props);

const isSecured = computed(() => targetState.value === LockState.Secured);
const isTransitioning = computed(() => currentState.value !== targetState.value && currentState.value !== LockState.Unknown);

const statusText = computed(() => {
  if (isTransitioning.value) {
    return targetState.value === LockState.Secured ? t('components.lock.status_locking') : t('components.lock.status_unlocking');
  }
  switch (currentState.value) {
    case LockState.Secured:
      return t('components.lock.status_locked');
    case LockState.Unsecured:
      return t('components.lock.status_unlocked');
    default:
      return t('components.lock.status_unknown');
  }
});

const statusClass = computed(() => {
  if (isTransitioning.value) return 'cui-lock-control__status--transitioning';
  if (currentState.value === LockState.Secured) return 'cui-lock-control__status--secured';
  if (currentState.value === LockState.Unsecured) return 'cui-lock-control__status--unsecured';
  return '';
});

const securedIconStyle = computed(() => ({
  color: 'rgb(34, 197, 94)',
  filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))',
}));

function onToggle(secured: boolean) {
  emit('update:targetState', secured ? LockState.Secured : LockState.Unsecured);
}
</script>

<style scoped>
.cui-lock-control {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
}

.cui-lock-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-lock-control__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-lock-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-lock-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-lock-control__info {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cui-lock-control__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-lock-control__status {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-secondary-color);
}

.cui-lock-control__status--secured {
  color: rgb(34, 197, 94);
}

.cui-lock-control__status--unsecured {
  color: rgb(234, 179, 8);
}

.cui-lock-control__status--transitioning {
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

.cui-lock-control--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-lock-control--small .cui-lock-control__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-lock-control--small .cui-lock-control__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-lock-control--small .cui-lock-control__label {
  font-size: 0.75rem;
}

.cui-lock-control--small .cui-lock-control__status {
  font-size: 0.625rem;
}

.cui-lock-control--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-lock-control--large .cui-lock-control__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-lock-control--large .cui-lock-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-lock-control--large .cui-lock-control__label {
  font-size: 1rem;
}

.cui-lock-control--large .cui-lock-control__status {
  font-size: 0.875rem;
}
</style>
