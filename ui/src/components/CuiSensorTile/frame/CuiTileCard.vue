<template>
  <div
    class="cui-tile tile-card"
    :class="{
      'tile-card--compact': compact,
      'tile-card--mini': mini,
      'tile-card--active': active,
      'tile-card--dragging': dragging,
      'tile-card--offline': offline,
      'tile-card--bottom': $slots.bottom,
    }"
    :style="color ? { '--tile-color': color } : undefined"
  >
    <div class="tile-card__fill" :style="fillStyle(shownFill, fillColor)" />
    <div v-if="fillEnd !== undefined" class="tile-card__fill tile-card__fill--end" :style="fillStyle(fillEnd, fillEndColor)" />

    <button v-if="expand" type="button" class="tile-card__icon tile-card__menu" :aria-label="t('components.sensor_tile.controls')" @click.stop="expand">
      <CuiTileIcon :icon :active :badge :badge-label class="tile-card__glyph" />
    </button>
    <CuiTileIcon v-else :icon :active :badge :badge-label class="tile-card__icon tile-card__glyph" />

    <div ref="textRef" v-tooltip.top="truncated ? fullText : null" class="tile-card__text">
      <template v-if="mini">
        <span class="tile-card__value" :class="{ 'tile-card__value--word': wordy }">{{ reading }}</span>
        <span class="tile-card__title">{{ title }}</span>
      </template>
      <template v-else>
        <span class="tile-card__title">{{ title }}</span>
        <span v-if="shownValue && !compact" class="tile-card__value">{{ shownValue }}</span>
        <span v-if="line" class="tile-card__state" :class="{ 'tile-card__state--note': note }">{{ line }}</span>
      </template>
    </div>

    <div v-if="$slots.corner && !mini" class="tile-card__corner">
      <slot name="corner" />
    </div>

    <div v-if="$slots.bottom" class="tile-card__bottom">
      <slot name="bottom" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { TILE_EXPAND, TILE_WAIT } from '../types.js';
import { useTruncation } from '../useTruncation.js';
import CuiTileIcon from './CuiTileIcon.vue';

import type { CuiTileCardProps } from './types.js';

const props = defineProps<CuiTileCardProps>();

const { t } = useI18n();

const expand = inject(TILE_EXPAND, undefined);
const wait = inject(TILE_WAIT, undefined);

const textRef = useTemplateRef<HTMLElement>('textRef');

const shownFill = computed(() => props.fill ?? (props.active ? 1 : 0));
const shownValue = computed(() => (props.offline ? undefined : props.value));
const note = computed(() => (props.offline ? undefined : wait?.note.value));

const line = computed(() => {
  if (props.offline) return props.state ?? props.caption;
  if (note.value) return note.value;
  if (props.compact) return [props.value, props.caption].filter(Boolean).join(' · ') || props.state;
  return props.value ? props.caption : props.state;
});
const fullText = computed(() => [props.title, props.compact ? undefined : shownValue.value, line.value].filter(Boolean).join(' · '));
const reading = computed(() => shownValue.value || props.state || props.caption);
const wordy = computed(() => !!reading.value && !/^[-−]?\d/.test(reading.value));

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

.tile-card--mini {
  container-type: inline-size;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'icon'
    'text';
  gap: 0.25rem;
  min-width: 0;
  padding: 0.625rem;
  border-radius: 1.125rem;
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

.tile-card--mini.tile-card--bottom {
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'icon'
    'text';
}

.tile-card--mini .tile-card__bottom {
  display: none;
}

.tile-card--mini .tile-card__glyph {
  width: clamp(1.75rem, 28cqi, 2.25rem);
  height: clamp(1.75rem, 28cqi, 2.25rem);
}

.tile-card--mini .tile-card__glyph :deep(.tile-icon__svg) {
  width: 58%;
  height: 58%;
}

.tile-card__menu {
  justify-self: start;
  padding: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.tile-card__menu::before {
  content: '';
  position: absolute;
  inset: -0.375rem;
}

.tile-card__menu:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tile-card--mini .tile-card__text {
  gap: 0;
}

.tile-card--mini .tile-card__value {
  font-size: clamp(1rem, 19cqi, 1.5rem);
  line-height: 1.2;
}

.tile-card--mini .tile-card__value--word {
  font-size: clamp(0.8125rem, 13cqi, 1.0625rem);
}

.tile-card--mini .tile-card__title {
  font-size: clamp(0.6875rem, 10cqi, 0.75rem);
  font-weight: 500;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.tile-card--offline {
  opacity: 0.55;
}

.tile-card__fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--tile-color) 8%, var(--p-content-background)),
    color-mix(in srgb, var(--tile-color) 22%, var(--p-content-background))
  );
  transition: width 0.3s ease;
  pointer-events: none;
}

.tile-card__fill--end {
  inset: 0 0 0 auto;
  background: linear-gradient(
    270deg,
    color-mix(in srgb, var(--tile-color) 8%, var(--p-content-background)),
    color-mix(in srgb, var(--tile-color) 22%, var(--p-content-background))
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

.tile-card .tile-card__state--note {
  color: var(--p-red-500);
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
