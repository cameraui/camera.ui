<template>
  <div class="flex flex-col gap-3">
    <div
      ref="stripRef"
      class="kelvin-strip"
      :class="{ 'kelvin-strip--disabled': disabled }"
      :style="{ background: track }"
      role="slider"
      :aria-label="t('components.sensor_tile.temperature')"
      :aria-valuemin="range.min"
      :aria-valuemax="range.max"
      :aria-valuenow="kelvin"
      :aria-valuetext="`${kelvin} K`"
      :aria-disabled="disabled"
      :tabindex="disabled ? -1 : 0"
      @keydown="onKey"
    >
      <span class="kelvin-strip__handle" :class="{ 'kelvin-strip__handle--dragging': dragging }" :style="{ left: `${ratio * 100}%`, background: kelvinColor(kelvin) }" />
    </div>

    <div class="flex items-center gap-2 min-w-0">
      <button
        v-for="preset in presets"
        :key="preset.name"
        type="button"
        class="kelvin-preset"
        :class="{ 'kelvin-preset--active': Math.abs(preset.kelvin - kelvin) < 100 }"
        :disabled
        @click="emit('commit', preset.kelvin)"
      >
        <span class="kelvin-preset__dot" :style="{ background: kelvinColor(preset.kelvin) }" />
        {{ t(`components.sensor_tile.${preset.name}`) }}
      </button>
      <span class="ml-auto text-xs text-muted tabular-nums shrink-0">{{ kelvin }} K</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { kelvinColor, WARM_WHITE_KELVIN } from '@/common/lightColor.js';

import { fromRatio, toRatio } from '../range.js';
import { useTrackDrag } from '../usePointerDrag.js';

import type { CuiLightTemperatureEmits, CuiLightTemperatureProps } from './types.js';

const PRESETS = [
  { name: 'warm', kelvin: WARM_WHITE_KELVIN },
  { name: 'neutral', kelvin: 4000 },
  { name: 'cool', kelvin: 6500 },
];

const props = defineProps<CuiLightTemperatureProps>();
const emit = defineEmits<CuiLightTemperatureEmits>();

const { t } = useI18n();

const stripRef = useTemplateRef<HTMLElement>('stripRef');

const ratio = computed(() => toRatio(props.kelvin, props.range));
const track = computed(() => `linear-gradient(90deg, ${kelvinColor(props.range.min)}, ${kelvinColor(props.range.max)})`);
const presets = computed(() => PRESETS.filter((preset) => preset.kelvin >= props.range.min && preset.kelvin <= props.range.max));

const { dragging, onKey } = useTrackDrag(stripRef, {
  disabled: () => props.disabled,
  value: () => ratio.value,
  keyStep: 0.05,
  onInput: (next) => emit('input', fromRatio(next, props.range)),
  onCommit: (next) => emit('commit', fromRatio(next, props.range)),
});
</script>

<style scoped>
.kelvin-strip {
  position: relative;
  height: 2.75rem;
  border-radius: 999px;
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.kelvin-strip:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.kelvin-strip--disabled {
  cursor: default;
  opacity: 0.6;
}

.kelvin-strip__handle {
  position: absolute;
  top: 50%;
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  transition:
    left 0.25s ease,
    transform 0.15s ease;
  pointer-events: none;
}

.kelvin-strip__handle--dragging {
  transform: translate(-50%, -50%) scale(1.12);
  transition: transform 0.15s ease;
}

.kelvin-preset {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border-radius: 999px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary-color);
  background: var(--p-content-hover-background);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    color 0.2s ease,
    border-color 0.2s ease;
}

.kelvin-preset:disabled {
  opacity: 0.6;
  cursor: default;
}

.kelvin-preset--active {
  color: var(--text-color);
  border-color: var(--border-color);
}

.kelvin-preset__dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
}
</style>
