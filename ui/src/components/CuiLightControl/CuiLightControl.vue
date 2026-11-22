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

    <div v-if="hasBrightness" class="cui-light-control__setting">
      <div class="cui-light-control__setting-header">
        <i-mdi:brightness-6 class="cui-light-control__setting-icon" />
        <span class="cui-light-control__setting-value">{{ brightnessValue }}{{ unit }}</span>
      </div>

      <Slider v-model="brightnessValue" :min :max :step :disabled="disabled" class="cui-light-control__slider" @slideend="flushBrightness" />
    </div>

    <div v-if="hasColorTemperature" class="cui-light-control__setting">
      <div class="cui-light-control__setting-header">
        <i-mdi:thermometer class="cui-light-control__setting-icon" />
        <span class="cui-light-control__setting-value">{{ temperatureValue }} K</span>
      </div>

      <Slider
        v-model="temperatureValue"
        :min="temperatureMin"
        :max="temperatureMax"
        :disabled="disabled"
        class="cui-light-control__slider cui-light-control__slider--gradient"
        :style="{ '--p-slider-track-background': temperatureTrack }"
        @slideend="flushTemperature"
      />
    </div>

    <div v-if="hasColor" class="cui-light-control__setting">
      <div class="cui-light-control__setting-header">
        <i-mdi:palette class="cui-light-control__setting-icon" />
        <span class="cui-light-control__swatch" :style="{ background: lightColorCss(shownColor) }" />
      </div>

      <Slider
        v-model="hueValue"
        :min="0"
        :max="360"
        :disabled="disabled"
        class="cui-light-control__slider cui-light-control__slider--gradient"
        :style="{ '--p-slider-track-background': HUE_TRACK }"
        @slideend="flushColor"
      />
      <Slider
        v-model="saturationValue"
        :min="0"
        :max="100"
        :disabled="disabled"
        class="cui-light-control__slider cui-light-control__slider--gradient"
        :style="{ '--p-slider-track-background': saturationTrack }"
        @slideend="flushColor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { LightColorMode } from '@camera.ui/sdk';

import { kelvinColor, lightColorCss } from '@/common/lightColor.js';

import { CUI_LIGHT_CONTROL_DEFAULTS } from './types.js';

import type { LightColor } from '@camera.ui/sdk';
import type { CuiLightControlEmits, CuiLightControlProps } from './types.js';

const props = withDefaults(defineProps<CuiLightControlProps>(), CUI_LIGHT_CONTROL_DEFAULTS);
const emit = defineEmits<CuiLightControlEmits>();

const { on, brightness, hasBrightness, min, max, colorTemperature, hasColorTemperature, temperatureMin, temperatureMax, color, hasColor, colorMode } = toRefs(props);

const HUE_TRACK = 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)';
const WHITE: LightColor = { hue: 0, saturation: 0 };

const localBrightness = ref<number | undefined>(undefined);
const lastBrightness = ref(brightness.value > 0 ? brightness.value : max.value);
const localTemperature = ref<number>();
const localColor = ref<LightColor>();

const emitBrightness = useThrottleFn((value: number) => emit('update:brightness', value), 250, true);
const emitTemperature = useThrottleFn((value: number) => emit('update:colorTemperature', value), 250, true);
const emitColor = useThrottleFn((value: LightColor) => emit('update:color', value), 250, true);

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
  get: () => localBrightness.value ?? brightness.value,
  set: (value: number) => {
    if (value > 0) {
      lastBrightness.value = value;
    }

    localBrightness.value = value;
    emitBrightness(value);

    if (value === 0 && on.value) {
      emit('update:on', false);
    } else if (value > 0 && !on.value) {
      emit('update:on', true);
    }
  },
});

const temperatureValue = computed({
  get: () => localTemperature.value ?? colorTemperature.value,
  set: (value: number) => {
    localTemperature.value = value;
    emitTemperature(value);
  },
});

const shownColor = computed(() => localColor.value ?? color.value ?? WHITE);

const hueValue = computed({
  get: () => shownColor.value.hue,
  set: (hue: number) => changeColor({ ...shownColor.value, hue }),
});

const saturationValue = computed({
  get: () => shownColor.value.saturation,
  set: (saturation: number) => changeColor({ ...shownColor.value, saturation }),
});

const temperatureTrack = computed(() => `linear-gradient(to right, ${kelvinColor(temperatureMin.value)}, ${kelvinColor(temperatureMax.value)})`);
const saturationTrack = computed(
  () => `linear-gradient(to right, ${lightColorCss({ hue: shownColor.value.hue, saturation: 0 })}, ${lightColorCss({ hue: shownColor.value.hue, saturation: 100 })})`,
);

const glowColor = computed(() => {
  if (hasColor.value && (colorMode.value === LightColorMode.Color || !hasColorTemperature.value)) return lightColorCss(shownColor.value);
  if (hasColorTemperature.value) return kelvinColor(temperatureValue.value);
  return 'rgb(250, 204, 21)';
});

const iconGlowStyle = computed<Record<string, string | number>>(() => {
  const glowIntensity = hasBrightness.value ? (brightness.value - min.value) / (max.value - min.value || 1) : 1;
  const glowSize = 4 + glowIntensity * 12;
  const glowOpacity = Math.round((0.3 + glowIntensity * 0.7) * 100);

  return {
    color: glowColor.value,
    filter: `drop-shadow(0 0 ${glowSize}px color-mix(in srgb, ${glowColor.value} ${glowOpacity}%, transparent))`,
    opacity: 0.4 + glowIntensity * 0.6,
  };
});

function flushBrightness() {
  if (localBrightness.value !== undefined) emit('update:brightness', localBrightness.value);
  localBrightness.value = undefined;
}

function flushTemperature() {
  if (localTemperature.value !== undefined) emit('update:colorTemperature', localTemperature.value);
  localTemperature.value = undefined;
}

function changeColor(value: LightColor) {
  localColor.value = value;
  emitColor(value);
}

function flushColor() {
  if (localColor.value) emit('update:color', localColor.value);
  localColor.value = undefined;
}
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

.cui-light-control__setting {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
}

.cui-light-control__setting-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cui-light-control__setting-icon {
  width: 1rem;
  height: 1rem;
  color: var(--text-secondary-color);
}

.cui-light-control__setting-value {
  font-size: 0.875rem;
  color: var(--text-secondary-color);
  margin-left: auto;
}

.cui-light-control__swatch {
  width: 1rem;
  height: 1rem;
  margin-left: auto;
  border-radius: 9999px;
  border: 1px solid var(--p-content-border-color);
}

.cui-light-control__slider {
  width: 100%;
}

.cui-light-control__slider--gradient {
  --p-slider-range-background: transparent;
  --p-slider-track-size: 0.375rem;
}

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
