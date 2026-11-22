<template>
  <div
    class="cui-tile tile-card"
    :class="{
      'tile-card--compact': compact,
      'tile-card--active': active,
      'tile-card--dragging': dragging,
      'tile-card--offline': offline,
      'tile-card--bottom': $slots.bottom,
    }"
    :style="color ? { '--tile-color': color } : undefined"
  >
    <div class="tile-card__fill" :style="fillStyle(shownFill, fillColor)" />
    <div v-if="fillEnd !== undefined" class="tile-card__fill tile-card__fill--end" :style="fillStyle(fillEnd, fillEndColor)" />

    <CuiTileIcon :icon :active :badge :badge-label class="tile-card__icon" />

    <div ref="textRef" v-tooltip.top="truncated ? fullText : null" class="tile-card__text">
      <span class="tile-card__title">{{ title }}</span>
      <span v-if="value && !compact" class="tile-card__value">{{ value }}</span>
      <span v-if="line" class="tile-card__state">{{ line }}</span>
    </div>

    <div v-if="$slots.corner" class="tile-card__corner">
      <slot name="corner" />
    </div>

    <div v-if="$slots.bottom" class="tile-card__bottom">
      <slot name="bottom" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTruncation } from '../useTruncation.js';
import CuiTileIcon from './CuiTileIcon.vue';

import type { CuiTileCardProps } from './types.js';

const props = defineProps<CuiTileCardProps>();

const shownFill = computed(() => props.fill ?? (props.active ? 1 : 0));
// a small card has one line for value and caption, a medium one shows the caption under the value
const line = computed(() => {
  if (props.compact) return [props.value, props.caption].filter(Boolean).join(' · ') || props.state;
  return props.value ? props.caption : props.state;
});
const fullText = computed(() => [props.title, props.compact ? undefined : props.value, line.value].filter(Boolean).join(' · '));

const textRef = useTemplateRef<HTMLElement>('textRef');
const truncated = useTruncation(textRef, () => fullText.value);

function fillStyle(ratio: number, color: string | undefined) {
  return { width: `${Math.round(ratio * 100)}%`, ...(color ? { '--tile-color': color } : {}) };
}
</script>

<style scoped>
.tile-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'icon corner'
    'text text';
  gap: 0.75rem;
  aspect-ratio: 1;
  min-width: 9rem;
  padding: 0.875rem;
  border-radius: 1rem;
  overflow: hidden;
  background: var(--p-content-background);
  /* an inset line instead of a border, so the fill paints over it */
  box-shadow: inset 0 0 0 1px var(--border-color);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* a card takes focus only while a tap does something */
.tile-card[tabindex='0'] {
  cursor: pointer;
}

.tile-card:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tile-card--compact {
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-rows: auto;
  grid-template-areas: 'icon text corner';
  align-items: center;
  gap: 0.625rem;
  aspect-ratio: auto;
  min-width: 0;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  border-radius: 0.875rem;
}

.tile-card--bottom {
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'icon corner'
    'text text'
    'bottom bottom';
}

.tile-card--compact.tile-card--bottom {
  grid-template-rows: auto;
  grid-template-areas: 'icon text corner';
}

.tile-card--offline {
  opacity: 0.55;
}

.tile-card__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tile-color) 22%, var(--p-content-background)),
    color-mix(in srgb, var(--tile-color) 48%, var(--p-content-background))
  );
  transition: width 0.3s ease;
  pointer-events: none;
}

.tile-card__fill--end {
  inset: 0 0 0 auto;
  background: linear-gradient(
    270deg,
    color-mix(in srgb, var(--tile-color) 22%, var(--p-content-background)),
    color-mix(in srgb, var(--tile-color) 48%, var(--p-content-background))
  );
}

.tile-card--dragging .tile-card__fill {
  transition: none;
}

.tile-card__icon {
  position: relative;
  grid-area: icon;
}

.tile-card__corner {
  position: relative;
  grid-area: corner;
  display: flex;
  align-items: center;
}

.tile-card__text {
  position: relative;
  grid-area: text;
  align-self: end;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
}

.tile-card--compact .tile-card__text {
  align-self: center;
  gap: 0;
}

.tile-card__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-color);
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tile-card--compact .tile-card__title {
  line-clamp: 1;
  -webkit-line-clamp: 1;
}

.tile-card__state {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary-color);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-card--active .tile-card__state {
  color: var(--text-color);
}

.tile-card__value {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-card__bottom {
  position: relative;
  grid-area: bottom;
}

.tile-card--compact .tile-card__bottom {
  position: absolute;
  left: 3.625rem;
  right: 0.75rem;
  bottom: 0.1875rem;
}
</style>
