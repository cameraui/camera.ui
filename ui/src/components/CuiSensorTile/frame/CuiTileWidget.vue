<template>
  <div
    ref="rootRef"
    class="cui-tile tile-widget"
    :class="[`tile-widget--${form}`, { 'tile-widget--fit': fits, 'tile-widget--active': active, 'tile-widget--offline': offline, 'tile-widget--opens': opens }]"
    :style="color ? { '--tile-color': color } : undefined"
    @click="onClick"
  >
    <div class="tile-widget__head">
      <button type="button" class="tile-widget__name" aria-haspopup="dialog" @click="emit('open', $event)">
        <CuiTileIcon :icon :active :badge :badge-label="badgeLabel" />
        <span class="tile-widget__text">
          <span class="tile-widget__title">{{ title }}</span>
          <span v-if="line" class="tile-widget__state" :class="{ 'tile-widget__state--note': note }">{{ line }}</span>
        </span>
      </button>
      <div v-if="$slots.actions" class="tile-widget__actions">
        <slot name="actions" :form />
      </div>
    </div>

    <div v-if="$slots.extra && form === 'tall'" class="tile-widget__extra">
      <slot name="extra" />
    </div>

    <div class="tile-widget__body">
      <div v-if="showsHero" class="tile-widget__reading" :class="{ 'tile-widget__reading--side': $slots.side }">
        <span class="tile-widget__hero" :class="{ 'tile-widget__hero--word': wordy, 'tile-widget__hero--toned': heroToned }">{{ hero }}</span>
        <span v-if="heroNote" class="tile-widget__note">{{ heroNote }}</span>
        <slot name="side" />
      </div>
      <slot :form />
    </div>
  </div>
</template>

<script setup lang="ts">
import { TILE_WAIT } from '../types.js';
import CuiTileIcon from './CuiTileIcon.vue';

import type { CuiTileWidgetEmits, CuiTileWidgetProps, TileWidgetForm } from './types.js';

const props = defineProps<CuiTileWidgetProps>();
const emit = defineEmits<CuiTileWidgetEmits>();
const slots = defineSlots<{
  default?(props: { form: TileWidgetForm }): unknown;
  actions?(props: { form: TileWidgetForm }): unknown;
  extra?(): unknown;
  side?(): unknown;
}>();

const { t } = useI18n();

const wait = inject(TILE_WAIT, undefined);

// card heights in px: below the first the hero goes, from the second the tall extras show
const COMPACT_BELOW = 176;
const TALL_FROM = 280;
// card width in px: below it a design moves its controls out of the head so the title keeps its room
const NARROW_BELOW = 300;

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');

const { width, height } = useElementSize(rootRef, undefined, { box: 'border-box' });

const form = computed<TileWidgetForm>(() => {
  if (height.value < COMPACT_BELOW) return 'compact';
  return height.value >= TALL_FROM ? 'tall' : 'short';
});
const narrow = computed(() => width.value < NARROW_BELOW);
const note = computed(() => (props.offline ? undefined : (props.note ?? wait?.note.value)));
const line = computed(() => {
  if (props.offline) return t('connection.offline');
  if (note.value) return note.value;
  const state = form.value === 'compact' ? (props.summary ?? props.state) : props.state;
  if (form.value === 'compact' || !wait?.waiting.value) return state;
  return [state, t('components.sensor_tile.waiting')].filter(Boolean).join(' · ');
});
const showsHero = computed(() => {
  if (!props.hero || props.offline || form.value === 'compact') return false;
  return !(props.extraShowsHero && form.value === 'tall');
});
const wordy = computed(() => props.heroWord || (!!props.hero && !/^[-−]?\d/.test(props.hero)));
const fits = computed(() => form.value !== 'compact' && !(slots.extra && form.value === 'tall'));

function onClick(event: MouseEvent) {
  if (!props.opens || (event.target as Element).closest('button, a, input, [role="slider"]')) return;
  emit('open', event);
}

defineExpose({ form, narrow });
</script>

<style scoped>
.tile-widget {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
  min-width: 0;
  padding: 1rem;
  border-radius: 1.5rem;
  overflow: hidden;
  background: var(--p-content-background);
  box-shadow: inset 0 0 0 1px var(--border-color);
  container: tile-widget / inline-size;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tile-widget::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(130% 100% at 0% 0%, color-mix(in srgb, var(--tile-color) 20%, transparent), transparent 62%);
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}

.tile-widget--active::before {
  opacity: 1;
}

.tile-widget--offline {
  opacity: 0.55;
}

.tile-widget--opens {
  cursor: pointer;
}

.tile-widget--compact {
  gap: 0.5rem;
  padding: 0.875rem;
}

.tile-widget__head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.tile-widget__name {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
  border-radius: 1rem;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.tile-widget__name:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.tile-widget__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile-widget__title,
.tile-widget__state {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-widget__title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-color);
}

.tile-widget__state {
  font-size: 0.8125rem;
  color: var(--text-secondary-color);
}

.tile-widget .tile-widget__state--note {
  color: var(--p-red-500);
}

.tile-widget__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.tile-widget__extra {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
}

.tile-widget__body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: auto;
  min-width: 0;
}

.tile-widget--compact .tile-widget__body {
  gap: 0.5rem;
}

.tile-widget__reading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.tile-widget__hero {
  --hero-size: 2.5rem;
  font-size: var(--hero-size);
  font-weight: 300;
  line-height: 1.2;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-widget--tall .tile-widget__hero {
  --hero-size: clamp(2.5rem, 16cqi, 4rem);
}

.tile-widget .tile-widget__hero--word {
  --hero-size: clamp(1.375rem, 9cqi, 2.125rem);
  font-weight: 400;
  letter-spacing: -0.01em;
}

.tile-widget .tile-widget__hero--toned {
  color: var(--tile-ink);
}

.tile-widget--fit .tile-widget__body {
  flex: 1 1 auto;
  justify-content: flex-end;
  min-height: 0;
}

.tile-widget--fit .tile-widget__reading {
  flex: 1 1 0;
  align-items: last baseline;
  min-height: 0;
  container-type: size;
}

.tile-widget--fit .tile-widget__reading--side {
  align-items: flex-end;
}

.tile-widget--fit .tile-widget__hero {
  font-size: min(var(--hero-size), 83cqb);
}

.tile-widget__note {
  flex-shrink: 0;
  max-width: 50%;
  font-size: 0.9375rem;
  color: var(--text-secondary-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-widget--compact :deep(.tile-action),
.tile-widget--compact :deep(.level-bar) {
  height: 2.5rem;
}

.tile-widget--compact :deep(.tile-button) {
  width: 2.5rem;
  height: 2.5rem;
}
</style>
