<template>
  <div
    ref="barRef"
    class="cui-tile level-bar"
    :class="{ 'level-bar--dragging': dragging, 'level-bar--disabled': disabled }"
    :style="color ? { '--tile-color': color } : undefined"
    role="slider"
    :aria-valuenow="Math.round(value * 100)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-disabled="disabled"
    :tabindex="disabled ? -1 : 0"
    @keydown="onKey"
  >
    <div class="level-bar__fill" :style="{ width: `${value * 100}%` }">
      <span class="level-bar__grip" />
    </div>
    <span class="level-bar__label">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { useTrackDrag } from '../usePointerDrag.js';

import type { CuiLevelBarEmits, CuiLevelBarProps } from './types.js';

const props = defineProps<CuiLevelBarProps>();
const emit = defineEmits<CuiLevelBarEmits>();

const barRef = useTemplateRef<HTMLElement>('barRef');

const { dragging, onKey } = useTrackDrag(barRef, {
  disabled: () => props.disabled,
  value: () => props.value,
  keyStep: 0.05,
  onInput: (ratio) => emit('input', ratio),
  onCommit: (ratio) => emit('commit', ratio),
});
</script>

<style scoped>
.level-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 3.5rem;
  border-radius: 1rem;
  overflow: hidden;
  background: var(--p-content-hover-background);
  cursor: pointer;
  touch-action: pan-y;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.level-bar:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.level-bar--disabled {
  cursor: default;
  opacity: 0.6;
}

.level-bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  background: linear-gradient(90deg, color-mix(in srgb, var(--tile-color) 40%, transparent), color-mix(in srgb, var(--tile-color) 85%, transparent));
  transition: width 0.3s ease;
}

.level-bar--dragging .level-bar__fill {
  transition: none;
}

.level-bar__grip {
  width: 0.25rem;
  height: 45%;
  margin-right: 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15);
}

.level-bar__label {
  position: relative;
  padding-left: 1rem;
  font-size: 1.25rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
}
</style>
