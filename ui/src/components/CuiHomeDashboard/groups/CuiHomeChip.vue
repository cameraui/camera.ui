<template>
  <span
    class="cui-tile home-chip"
    :class="{
      'home-chip--on': on,
      'home-chip--large': large,
      'home-chip--offline': offline,
      'home-chip--pressable': pressable && interactive,
    }"
    :style="color ? { '--tile-color': color } : undefined"
  >
    <span v-if="holding" class="home-chip__fill" :style="{ transform: `scaleX(${progress})` }" />
    <CuiHomeMemberIcon class="home-chip__lead" :sensor>
      <span class="home-chip__ring cui-wait-ring" :class="{ 'cui-wait-ring--on': waiting, 'cui-wait-ring--failed': failed }">
        <component :is="icon" class="home-chip__icon" />
      </span>
    </CuiHomeMemberIcon>
    <component
      :is="pressable ? 'button' : 'span'"
      ref="bodyRef"
      :type="pressable ? 'button' : undefined"
      class="home-chip__body"
      :aria-label="ariaLabel"
      @keydown="onKey"
    >
      <span class="home-chip__text">
        <span class="home-chip__label" :class="{ 'home-chip__label--note': note }">{{ note ?? label }}</span>
        <span v-if="detail" class="home-chip__detail">{{ detail }}</span>
      </span>
    </component>
  </span>
</template>

<script setup lang="ts">
import { useGuardedPress } from '@/components/CuiSensorTile/useGuardedPress.js';
import { useTileWait } from '@/components/CuiSensorTile/useTileWait.js';

import CuiHomeMemberIcon from './CuiHomeMemberIcon.vue';

import type { CuiHomeChipEmits, CuiHomeChipProps } from './status.js';

const props = defineProps<CuiHomeChipProps>();
const emit = defineEmits<CuiHomeChipEmits>();

const bodyRef = useTemplateRef<HTMLElement>('bodyRef');

const { waiting, failed, note } = useTileWait(() => props.sensor);

const { progress, holding, hint, onKey } = useGuardedPress(bodyRef, {
  interactive: () => props.pressable && props.interactive,
  guarded: () => props.guarded,
  onGuarded: () => emit('press'),
  onTap: () => emit('press'),
  onToggle: () => emit('press'),
});

watch([hint, holding], ([shown, held]) => emit('hint', shown || held));
</script>

<style scoped>
.home-chip {
  position: relative;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 2rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: default;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.home-chip--large {
  height: 2.25rem;
}

.home-chip:has(> .home-chip__body:focus-visible) {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-chip--on {
  background: color-mix(in srgb, var(--tile-color) 22%, transparent);
  color: var(--text-color);
}

.home-chip--offline {
  opacity: 0.55;
}

.home-chip__fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--text-color) 16%, transparent);
  transform-origin: left;
  pointer-events: none;
}

.home-chip__lead {
  position: relative;
  display: flex;
  align-items: center;
  align-self: stretch;
  flex-shrink: 0;
  padding: 0 0.5rem 0 0.75rem;
  border-radius: 9999px;
}

.home-chip .home-chip__lead:focus-visible {
  outline-offset: -2px;
}

.home-chip__icon {
  width: 1rem;
  height: 1rem;
}

.home-chip__ring {
  display: flex;
}

.home-chip__body {
  position: relative;
  display: flex;
  align-items: center;
  align-self: stretch;
  flex: 1;
  min-width: 0;
  padding-right: 0.75rem;
  text-align: left;
}

.home-chip--pressable .home-chip__body {
  cursor: pointer;
}

.home-chip__body:focus-visible {
  outline: none;
}

.home-chip--on .home-chip__icon {
  color: var(--tile-ink);
}

.home-chip__text {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  column-gap: 0.5rem;
  flex: 1;
  min-width: 0;
  height: 1.25rem;
  line-height: 1.25rem;
  overflow: hidden;
}

.home-chip__label {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-chip .home-chip__label--note {
  color: var(--p-red-500);
}

.home-chip__detail {
  flex: none;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
