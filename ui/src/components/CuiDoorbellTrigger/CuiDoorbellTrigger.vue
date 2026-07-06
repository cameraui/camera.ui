<template>
  <div class="cui-doorbell" :class="[`cui-doorbell--${size}`, { 'cui-doorbell--disabled': disabled, 'cui-doorbell--ringing': isRinging }]">
    <div class="cui-doorbell__header">
      <div class="cui-doorbell__icon">
        <i-mdi:doorbell v-if="isRinging" class="cui-doorbell__icon-svg cui-doorbell__icon-svg--ringing" :style="ringIconStyle" />
        <i-mdi:doorbell v-else class="cui-doorbell__icon-svg" />
      </div>

      <div class="cui-doorbell__info">
        <span v-if="label" class="cui-doorbell__label">{{ label }}</span>
        <span class="cui-doorbell__status" :class="{ 'cui-doorbell__status--ringing': isRinging }">
          {{ isRinging ? t('components.doorbell_trigger.ringing') : t('components.doorbell_trigger.ready') }}
        </span>
      </div>

      <Button :disabled="disabled || isRinging" size="small" severity="warn" class="cui-doorbell__button" @click="triggerRing">
        <template #icon>
          <i-mdi:bell-ring class="cui-doorbell__button-icon" />
        </template>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_DOORBELL_TRIGGER_DEFAULTS } from './types.js';

import type { CuiDoorbellTriggerEmits, CuiDoorbellTriggerProps } from './types.js';

const props = withDefaults(defineProps<CuiDoorbellTriggerProps>(), CUI_DOORBELL_TRIGGER_DEFAULTS);
const emit = defineEmits<CuiDoorbellTriggerEmits>();

const { t } = useI18n();

const { ring } = toRefs(props);

const isRinging = computed(() => ring.value);

const ringIconStyle = computed<Record<string, string>>(() => ({
  color: 'rgb(234, 179, 8)',
  filter: 'drop-shadow(0 0 10px rgba(234, 179, 8, 0.8))',
}));

function triggerRing() {
  emit('update:ring', true);
  emit('trigger');

  setTimeout(() => {
    emit('update:ring', false);
  }, 2000);
}
</script>

<style scoped>
.cui-doorbell {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
}

.cui-doorbell--disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Header */
.cui-doorbell__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-doorbell__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
}

.cui-doorbell__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease;
}

.cui-doorbell__icon-svg--ringing {
  animation: doorbell-shake 0.15s ease-in-out infinite;
}

@keyframes doorbell-shake {
  0%,
  100% {
    transform: rotate(-15deg);
  }

  50% {
    transform: rotate(15deg);
  }
}

.cui-doorbell__info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 0;
}

.cui-doorbell__label {
  font-weight: 500;
  font-size: 0.875rem;
  color: var(--text-color);
}

.cui-doorbell__status {
  font-size: 0.75rem;
  color: var(--text-secondary-color);
}

.cui-doorbell__status--ringing {
  color: rgb(234, 179, 8);
  font-weight: 600;
  animation: blink 0.3s ease-in-out infinite alternate;
}

@keyframes blink {
  from {
    opacity: 1;
  }

  to {
    opacity: 0.5;
  }
}

.cui-doorbell__button {
  margin-left: auto;
}

.cui-doorbell__button-icon {
  width: 1rem;
  height: 1rem;
}

/* Size variants */
.cui-doorbell--small {
  padding: 0.5rem;
  gap: 0.375rem;
}

.cui-doorbell--small .cui-doorbell__icon {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-doorbell--small .cui-doorbell__icon-svg {
  width: 1.125rem;
  height: 1.125rem;
}

.cui-doorbell--small .cui-doorbell__label {
  font-size: 0.75rem;
}

.cui-doorbell--small .cui-doorbell__status {
  font-size: 0.625rem;
}

.cui-doorbell--large {
  padding: 1rem;
  gap: 0.75rem;
}

.cui-doorbell--large .cui-doorbell__icon {
  width: 2.25rem;
  height: 2.25rem;
}

.cui-doorbell--large .cui-doorbell__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-doorbell--large .cui-doorbell__label {
  font-size: 1rem;
}

.cui-doorbell--large .cui-doorbell__status {
  font-size: 0.875rem;
}
</style>
