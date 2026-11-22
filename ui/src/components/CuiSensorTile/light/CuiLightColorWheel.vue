<template>
  <div class="flex flex-col items-center gap-4">
    <div
      ref="wheelRef"
      class="color-wheel"
      :class="{ 'color-wheel--disabled': disabled }"
      role="slider"
      :aria-label="t('components.sensor_tile.color')"
      aria-valuemin="0"
      aria-valuemax="360"
      :aria-valuenow="color.hue"
      :aria-valuetext="`${color.hue}°, ${color.saturation} %`"
      :aria-disabled="disabled"
      :tabindex="disabled ? -1 : 0"
      @keydown="onKey"
    >
      <span class="color-wheel__handle" :class="{ 'color-wheel__handle--dragging': dragging }" :style="handleStyle" />
    </div>

    <div class="flex flex-wrap justify-center gap-2">
      <button
        v-for="swatch in SWATCHES"
        :key="`${swatch.hue}-${swatch.saturation}`"
        type="button"
        class="color-swatch"
        :class="{ 'color-swatch--active': isCurrent(swatch) }"
        :style="{ background: lightColorCss(swatch) }"
        :aria-label="`${t('components.sensor_tile.color')} ${swatch.hue}°, ${swatch.saturation} %`"
        :disabled
        @click="emit('commit', swatch)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { lightColorCss } from '@/common/lightColor.js';

import { usePointerDrag } from '../usePointerDrag.js';

import type { LightColor } from '@camera.ui/sdk';
import type { CuiLightColorWheelEmits, CuiLightColorWheelProps } from './types.js';

const SWATCHES: LightColor[] = [
  { hue: 0, saturation: 0 },
  { hue: 30, saturation: 100 },
  { hue: 50, saturation: 100 },
  { hue: 120, saturation: 100 },
  { hue: 180, saturation: 100 },
  { hue: 220, saturation: 100 },
  { hue: 270, saturation: 100 },
  { hue: 320, saturation: 100 },
  { hue: 0, saturation: 100 },
];
const KEY_STEP = 10;

const props = defineProps<CuiLightColorWheelProps>();
const emit = defineEmits<CuiLightColorWheelEmits>();

const { t } = useI18n();

const wheelRef = useTemplateRef<HTMLElement>('wheelRef');

const handleStyle = computed(() => {
  const angle = (props.color.hue * Math.PI) / 180;
  const radius = props.color.saturation / 2;
  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`,
    background: lightColorCss(props.color),
  };
});

let last = props.color;

const { dragging } = usePointerDrag(wheelRef, {
  draggable: () => !props.disabled,
  onMove: (event) => {
    last = colorAt(event);
    emit('input', last);
  },
  onEnd: () => emit('commit', last),
  onTap: (event) => {
    if (!props.disabled) emit('commit', colorAt(event));
  },
});

function colorAt(event: PointerEvent): LightColor {
  const rect = wheelRef.value!.getBoundingClientRect();
  const x = event.clientX - rect.left - rect.width / 2;
  const y = event.clientY - rect.top - rect.height / 2;
  const hue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  const saturation = Math.round(Math.min(Math.hypot(x, y) / (rect.width / 2), 1) * 100);
  return { hue, saturation };
}

function isCurrent(swatch: LightColor): boolean {
  if (swatch.saturation === 0) return props.color.saturation < 8;
  const hueGap = Math.abs(((props.color.hue - swatch.hue + 540) % 360) - 180);
  return hueGap < 8 && Math.abs(props.color.saturation - swatch.saturation) < 8;
}

function onKey(event: KeyboardEvent) {
  if (props.disabled) return;
  const { hue, saturation } = props.color;
  const next = {
    ArrowLeft: { hue: (hue + 360 - KEY_STEP) % 360, saturation },
    ArrowRight: { hue: (hue + KEY_STEP) % 360, saturation },
    ArrowUp: { hue, saturation: Math.min(saturation + KEY_STEP, 100) },
    ArrowDown: { hue, saturation: Math.max(saturation - KEY_STEP, 0) },
  }[event.key];
  if (!next) return;
  event.preventDefault();
  emit('commit', next);
}
</script>

<style scoped>
.color-wheel {
  position: relative;
  width: min(100%, 14rem);
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle closest-side, #fff, transparent),
    conic-gradient(from 90deg, hsl(0 100% 55%), hsl(60 100% 55%), hsl(120 100% 55%), hsl(180 100% 55%), hsl(240 100% 55%), hsl(300 100% 55%), hsl(360 100% 55%));
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.color-wheel:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 3px;
}

.color-wheel--disabled {
  cursor: default;
  opacity: 0.6;
}

.color-wheel__handle {
  position: absolute;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%);
  transition: transform 0.15s ease;
  pointer-events: none;
}

.color-wheel__handle--dragging {
  transform: translate(-50%, -50%) scale(1.15);
}

.color-swatch {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.color-swatch:disabled {
  opacity: 0.6;
  cursor: default;
}

.color-swatch--active {
  outline: 2px solid var(--text-color);
  outline-offset: 2px;
}

.color-swatch:active:not(:disabled) {
  transform: scale(0.9);
}
</style>
