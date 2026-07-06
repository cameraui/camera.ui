<template>
  <div class="cui-siren-control" :class="[`cui-siren-control--${size}`, { 'cui-siren-control--disabled': disabled }]">
    <div class="cui-siren-control__header">
      <div class="cui-siren-control__icon">
        <i-mdi:alarm-light v-if="isActive" class="cui-siren-control__icon-svg cui-siren-control__icon-svg--active" :style="iconGlowStyle" />
        <i-mdi:alarm-light-outline v-else class="cui-siren-control__icon-svg" />
      </div>

      <span v-if="label" class="cui-siren-control__label">{{ label }}</span>

      <ToggleSwitch v-model="isActive" :disabled="disabled" class="cui-siren-control__toggle" />
    </div>

    <div v-if="hasVolume" class="cui-siren-control__volume">
      <div class="cui-siren-control__volume-header">
        <i-mdi:volume-high class="cui-siren-control__volume-icon" />
        <span class="cui-siren-control__volume-value">{{ volumeValue }}%</span>
      </div>

      <Slider v-model="volumeValue" :min="0" :max="100" :step="1" :disabled="disabled" class="cui-siren-control__slider" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_SIREN_CONTROL_DEFAULTS } from './types.js';

import type { CuiSirenControlEmits, CuiSirenControlProps } from './types.js';

const props = withDefaults(defineProps<CuiSirenControlProps>(), CUI_SIREN_CONTROL_DEFAULTS);
const emit = defineEmits<CuiSirenControlEmits>();

const { active, volume, hasVolume } = toRefs(props);

const isActive = computed({
  get: () => active.value,
  set: (value: boolean) => emit('update:active', value),
});

const volumeValue = computed({
  get: () => volume.value,
  set: (value: number) => emit('update:volume', value),
});

const iconGlowStyle = computed<Record<string, string | number>>(() => {
  const volumeVal = hasVolume.value ? volume.value : 100;
  const glowIntensity = volumeVal / 100;
  const glowSize = 4 + glowIntensity * 12;
  const glowOpacity = 0.3 + glowIntensity * 0.7;

  return {
    color: 'rgb(239, 68, 68)',
    filter: `drop-shadow(0 0 ${glowSize}px rgba(239, 68, 68, ${glowOpacity}))`,
    opacity: 0.4 + glowIntensity * 0.6,
  };
});
</script>

<style scoped>
.cui-siren-control {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.75rem;
}

.cui-siren-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.cui-siren-control__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cui-siren-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
}

.cui-siren-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease,
    opacity 0.2s ease;
}

.cui-siren-control__icon-svg--active {
  animation: siren-pulse 0.5s ease-in-out infinite alternate;
}

@keyframes siren-pulse {
  from {
    transform: scale(1);
  }

  to {
    transform: scale(1.1);
  }
}

.cui-siren-control__label {
  flex: 1;
  font-weight: 500;
  color: var(--text-color);
}

.cui-siren-control__toggle {
  margin-left: auto;
}

/* Volume */
.cui-siren-control__volume {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.cui-siren-control__volume-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-siren-control__volume-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-secondary-color);
}

.cui-siren-control__volume-value {
  font-size: 0.875rem;
  color: var(--text-secondary-color);
  margin-left: auto;
}

.cui-siren-control__slider {
  width: 100%;
}

.cui-siren-control--small {
  padding: 0.75rem;
  gap: 0.5rem;
}

.cui-siren-control--small .cui-siren-control__icon {
  width: 1.5rem;
  height: 1.5rem;
}

.cui-siren-control--small .cui-siren-control__icon-svg {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-siren-control--small .cui-siren-control__label {
  font-size: 0.875rem;
}

.cui-siren-control--large {
  padding: 1.25rem;
  gap: 1rem;
}

.cui-siren-control--large .cui-siren-control__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.cui-siren-control--large .cui-siren-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-siren-control--large .cui-siren-control__label {
  font-size: 1.125rem;
}
</style>
