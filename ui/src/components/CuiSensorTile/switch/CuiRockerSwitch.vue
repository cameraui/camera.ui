<template>
  <div
    ref="trackRef"
    class="cui-tile rocker"
    :class="{ 'rocker--on': on, 'rocker--dragging': dragTop !== undefined, 'rocker--disabled': disabled }"
    :style="color ? { '--tile-color': color } : undefined"
    role="switch"
    :aria-checked="on"
    :aria-label="label"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @keydown="onKey"
  >
    <span ref="knobRef" class="rocker__knob" :style="dragTop !== undefined ? { top: `${dragTop}px` } : undefined">
      <PowerIcon class="rocker__icon" />
    </span>
  </div>
</template>

<script setup lang="ts">
import PowerIcon from '~icons/lucide/power';

import { onToggleKey } from '../keys.js';
import { usePointerDrag } from '../usePointerDrag.js';

import type { CuiRockerSwitchEmits, CuiRockerSwitchProps } from './types.js';

const props = defineProps<CuiRockerSwitchProps>();
const emit = defineEmits<CuiRockerSwitchEmits>();

const trackRef = useTemplateRef<HTMLElement>('trackRef');
const knobRef = useTemplateRef<HTMLElement>('knobRef');

const dragTop = ref<number>();

let startTop = 0;
let minTop = 0;
let maxTop = 0;

usePointerDrag(trackRef, {
  axis: 'y',
  draggable: () => !props.disabled,
  onStart: () => {
    const track = trackRef.value!;
    const knob = knobRef.value!;
    const inset = (track.clientWidth - knob.offsetWidth) / 2;
    minTop = inset;
    maxTop = track.clientHeight - knob.offsetHeight - inset;
    startTop = knob.offsetTop;
  },
  onMove: (_event, delta) => {
    dragTop.value = Math.min(Math.max(startTop + delta.y, minTop), maxTop);
  },
  onEnd: () => {
    const wantsOn = dragTop.value! < (minTop + maxTop) / 2;
    dragTop.value = undefined;
    if (wantsOn !== props.on) emit('change', wantsOn);
  },
  onTap: () => {
    if (!props.disabled) emit('change', !props.on);
  },
});

function onKey(event: KeyboardEvent) {
  if (props.disabled || onToggleKey(event, () => emit('change', !props.on))) return;
  const next = { ArrowUp: true, ArrowDown: false }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  if (next !== props.on) emit('change', next);
}
</script>

<style scoped>
.rocker {
  position: relative;
  flex-shrink: 0;
  width: 5.5rem;
  height: 10rem;
  border-radius: 999px;
  background: var(--p-content-hover-background);
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.3s ease,
    box-shadow 0.3s ease;
}

.rocker:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 3px;
}

.rocker--on {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--tile-color) 70%, var(--p-content-background)),
    color-mix(in srgb, var(--tile-color) 30%, var(--p-content-background))
  );
  box-shadow:
    inset 0 1px 3px rgba(0, 0, 0, 0.12),
    0 0 24px color-mix(in srgb, var(--tile-color) 35%, transparent);
}

.rocker--disabled {
  cursor: default;
  opacity: 0.6;
}

.rocker__knob {
  position: absolute;
  left: 0.5rem;
  top: calc(100% - 5rem);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 50%;
  background: var(--p-content-background);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  transition: top 0.35s cubic-bezier(0.34, 1.4, 0.64, 1);
  pointer-events: none;
}

.rocker--on .rocker__knob {
  top: 0.5rem;
}

.rocker--dragging .rocker__knob {
  transition: none;
}

.rocker__icon {
  width: 1.75rem;
  height: 1.75rem;
  color: var(--text-secondary-color);
  transition: color 0.3s ease;
}

.rocker--on .rocker__icon {
  color: var(--tile-ink);
}
</style>
