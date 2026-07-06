<template>
  <div class="cui-light-control" :class="[`cui-light-control--${size}`, { 'cui-light-control--disabled': disabled }]">
    <div class="cui-light-control__header">
      <div class="cui-light-control__icon">
        <i-mdi:lightbulb-on v-if="isOn" class="cui-light-control__icon-svg cui-light-control__icon-svg--on" :style="iconGlowStyle" />
        <i-mdi:lightbulb-outline v-else class="cui-light-control__icon-svg" />
      </div>

      <span v-if="label" class="cui-light-control__label">{{ label }}</span>

      <ToggleSwitch v-model="isOn" :disabled="disabled" class="cui-light-control__toggle" />
    </div>

    <div v-if="hasBrightness" class="cui-light-control__brightness">
      <div class="cui-light-control__brightness-header">
        <i-mdi:brightness-6 class="cui-light-control__brightness-icon" />
        <span class="cui-light-control__brightness-value">{{ brightnessValue }}%</span>
      </div>

      <Slider v-model="brightnessValue" :min="0" :max="100" :step="1" :disabled="disabled" class="cui-light-control__slider" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { CUI_LIGHT_CONTROL_DEFAULTS } from './types.js';

import type { CuiLightControlEmits, CuiLightControlProps } from './types.js';

const props = withDefaults(defineProps<CuiLightControlProps>(), CUI_LIGHT_CONTROL_DEFAULTS);
const emit = defineEmits<CuiLightControlEmits>();

const { on, brightness, hasBrightness } = toRefs(props);

const lastBrightness = ref(brightness.value > 0 ? brightness.value : 100);

const isOn = computed({
  get: () => on.value,
  set: (value: boolean) => {
    emit('update:on', value);
    if (value && brightness.value === 0) {
      emit('update:brightness', lastBrightness.value);
    }
  },
});

const brightnessValue = computed({
  get: () => brightness.value,
  set: (value: number) => {
    if (value > 0) {
      lastBrightness.value = value;
    }

    emit('update:brightness', value);

    if (value === 0 && on.value) {
      emit('update:on', false);
    } else if (value > 0 && !on.value) {
      emit('update:on', true);
    }
  },
});

const iconGlowStyle = computed<Record<string, string | number>>(() => {
  const value = hasBrightness.value ? brightness.value : 100;
  const glowIntensity = value / 100;
  const glowSize = 4 + glowIntensity * 12;
  const glowOpacity = 0.3 + glowIntensity * 0.7;

  return {
    color: 'rgb(250, 204, 21)',
    filter: `drop-shadow(0 0 ${glowSize}px rgba(250, 204, 21, ${glowOpacity}))`,
    opacity: 0.4 + glowIntensity * 0.6,
  };
});
</script>

<style scoped>
.cui-light-control {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 0.75rem;
}

.cui-light-control--disabled {
  opacity: 0.6;
  pointer-events: none;
}

/* Header */
.cui-light-control__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.cui-light-control__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
}

.cui-light-control__icon-svg {
  width: 1.5rem;
  height: 1.5rem;
  color: var(--text-secondary-color);
  transition:
    color 0.2s ease,
    filter 0.2s ease,
    opacity 0.2s ease;
}

.cui-light-control__icon-svg--on {
  color: var(--yellow-400);
}

.cui-light-control__label {
  flex: 1;
  font-weight: 500;
  color: var(--text-color);
}

.cui-light-control__toggle {
  margin-left: auto;
}

/* Brightness */
.cui-light-control__brightness {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.cui-light-control__brightness-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-light-control__brightness-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-secondary-color);
}

.cui-light-control__brightness-value {
  font-size: 0.875rem;
  color: var(--text-secondary-color);
  margin-left: auto;
}

.cui-light-control__slider {
  width: 100%;
}

/* Size variants */
.cui-light-control--small {
  padding: 0.75rem;
  gap: 0.5rem;
}

.cui-light-control--small .cui-light-control__icon {
  width: 1.5rem;
  height: 1.5rem;
}

.cui-light-control--small .cui-light-control__icon-svg {
  width: 1.25rem;
  height: 1.25rem;
}

.cui-light-control--small .cui-light-control__label {
  font-size: 0.875rem;
}

.cui-light-control--large {
  padding: 1.25rem;
  gap: 1rem;
}

.cui-light-control--large .cui-light-control__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.cui-light-control--large .cui-light-control__icon-svg {
  width: 2rem;
  height: 2rem;
}

.cui-light-control--large .cui-light-control__label {
  font-size: 1.125rem;
}
</style>
