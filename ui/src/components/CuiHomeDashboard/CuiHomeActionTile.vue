<template>
  <button
    ref="buttonRef"
    type="button"
    class="cui-tile home-action-tile"
    :class="{
      'home-action-tile--row': horizontal,
      'home-action-tile--on': lit,
      'home-action-tile--static': !press,
      'home-action-tile--na': state.mode === 'na',
    }"
    :style="{ '--tile-color': look.color }"
    :aria-label="press ? `${title}: ${shortOf(state)}. ${press.label}` : `${title}: ${shortOf(state)}`"
    :aria-disabled="!press"
    @keydown="onKey"
  >
    <span v-if="holding" class="home-action-tile__fill" :style="{ transform: `scaleX(${progress})` }" />
    <span class="home-action-tile__icon">
      <SpinnerIcon v-if="state.pending" />
      <component :is="lit ? look.onIcon : look.icon" v-else />
    </span>
    <span v-if="labeled" class="home-action-tile__text">
      <span class="home-action-tile__label">{{ title }}</span>
      <span v-if="detailed" class="home-action-tile__state">{{ shortOf(state) }}</span>
    </span>
  </button>
</template>

<script setup lang="ts">
import SpinnerIcon from '~icons/svg-spinners/ring-resize';

import { useGuardedPress } from '@/components/CuiSensorTile/useGuardedPress.js';

import { HOME_ACTION_LOOKS, isActionOn, useActionText } from './actions.js';

import type { CuiHomeActionTileEmits, CuiHomeActionTileProps } from './types.js';

const props = defineProps<CuiHomeActionTileProps>();
const emit = defineEmits<CuiHomeActionTileEmits>();

const { say, shortOf } = useActionText();

const buttonRef = useTemplateRef<HTMLButtonElement>('buttonRef');

const look = computed(() => HOME_ACTION_LOOKS[props.state.action]);
const lit = computed(() => isActionOn(props.state));
const title = computed(() => say(props.state.action, 'title'));

const { progress, holding, hint, onKey } = useGuardedPress(buttonRef, {
  interactive: () => !!props.press,
  guarded: () => !!props.press?.guarded,
  onGuarded: () => props.press?.run(),
  onTap: () => props.press?.run(),
  onToggle: () => props.press?.run(),
});

watch([hint, holding], ([shown, held]) => emit('hint', shown || held));
</script>

<style scoped>
.home-action-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-width: 0;
  min-height: 0;
  padding: 0.5rem;
  overflow: hidden;
  border-radius: 1rem;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  text-align: center;
  cursor: pointer;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background 0.2s ease,
    transform 0.15s ease;
}

.home-action-tile:active:not(.home-action-tile--static) {
  transform: scale(0.97);
}

.home-action-tile:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-action-tile--row {
  flex-direction: row;
  justify-content: flex-start;
  gap: 0.625rem;
  padding: 0 0.75rem 0 0.5rem;
  text-align: left;
}

.home-action-tile--on {
  background: color-mix(in srgb, var(--tile-color) 20%, var(--p-content-background));
}

.home-action-tile--static {
  cursor: default;
}

.home-action-tile--na {
  opacity: 0.55;
}

.home-action-tile__fill {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--tile-ink) 35%, transparent);
  transform-origin: left;
  pointer-events: none;
}

.home-action-tile__icon {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-secondary-color);
}

.home-action-tile__icon svg {
  width: 1.375rem;
  height: 1.375rem;
}

.home-action-tile--row .home-action-tile__icon {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: color-mix(in srgb, var(--text-color) 6%, var(--p-content-hover-background));
}

.home-action-tile--row .home-action-tile__icon svg {
  width: 1.125rem;
  height: 1.125rem;
}

.home-action-tile--on .home-action-tile__icon {
  color: var(--tile-ink);
}

.home-action-tile--row.home-action-tile--on .home-action-tile__icon {
  background: color-mix(in srgb, var(--tile-ink) 22%, var(--p-content-hover-background));
}

.home-action-tile__text {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
}

.home-action-tile__label,
.home-action-tile__state {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-action-tile__label {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.0625rem;
}

.home-action-tile__state {
  font-size: 0.75rem;
  line-height: 0.9375rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary-color);
}

.home-action-tile--on .home-action-tile__state {
  color: var(--tile-ink);
}
</style>
