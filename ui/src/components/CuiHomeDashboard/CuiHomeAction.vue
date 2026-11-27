<template>
  <CuiTileCard
    v-if="row"
    ref="cardRef"
    :icon
    :title
    :state="hinting ? holdText : wide ? lineOf(state, place) : summaryOf(state)"
    :color="look.color"
    :active="lit"
    :fill="holding ? progress : state.share"
    :offline="state.mode === 'na'"
    compact
    :role="tappable ? 'button' : undefined"
    :aria-label="tappable ? `${title}: ${summaryOf(state)}. ${press?.label}` : undefined"
    :tabindex="tappable ? 0 : undefined"
    @keydown="onKey"
  >
    <template v-if="wide && (state.pending || press)" #corner>
      <CuiTileAction v-if="state.pending" class="home-action__pill" :icon="SpinnerIcon" :label="busyText(state)" :interactive="false" />
      <CuiTileHoldAction
        v-else-if="press"
        class="home-action__pill"
        :class="{ 'home-action__tone': press.resumes }"
        show-label
        :label="press.short"
        :aria-label="press.label"
        :color="look.color"
        :guarded="press.guarded"
        interactive
        @press="press.run()"
        @hint="pillHint = $event"
      />
    </template>
  </CuiTileCard>

  <CuiTileWidget
    v-else
    ref="widgetRef"
    :icon
    :title
    :state="hinting ? holdText : lineOf(state, place)"
    :summary="hinting ? holdText : summaryOf(state)"
    :color="look.color"
    :active="lit"
    :hero
    :hero-note="heroNote"
    :hero-toned="state.mode === 'on' && !state.until"
    @open="detailsRef?.toggle($event)"
  >
    <p v-if="state.mode === 'na'" class="home-action__hint">{{ t(`views.home_dashboard.actions.na_hint.${state.reason}`) }}</p>
    <CuiTileAction v-else-if="state.pending" class="home-action__wide" show-label :icon="SpinnerIcon" :label="busyText(state)" :interactive="false" />
    <template v-else-if="state.mode === 'idle'">
      <CuiTileHoldAction
        v-if="narrow"
        class="home-action__wide"
        show-label
        :icon="look.goIcon"
        :label="`${say(action, 'go_short')} · ${durationLabel(state.minutes)}`"
        :aria-label="goLabel(action, state.minutes)"
        :guarded="look.hold"
        interactive
        @press="go(action, state.minutes)"
        @hint="pillHint = $event"
      />
      <div v-else class="home-action__durations">
        <span class="home-action__for">{{ say(action, 'go_for') }}</span>
        <div class="home-action__buttons">
          <CuiTileHoldAction
            v-for="minutes in state.durations"
            :key="minutes"
            show-label
            :label="durationLabel(minutes)"
            :aria-label="goLabel(action, minutes)"
            :guarded="look.hold"
            interactive
            @press="go(action, minutes)"
            @hint="pillHint = $event"
          />
        </div>
      </div>
    </template>
    <template v-else>
      <span v-if="state.share !== undefined && form !== 'compact'" class="home-action__progress">
        <span :style="{ width: `${state.share * 100}%` }" />
      </span>
      <div class="home-action__buttons">
        <CuiTileAction
          class="home-action__wide home-action__tone"
          show-label
          :icon="look.backIcon"
          :label="say(action, state.mode === 'partial' && !narrow ? 'back_all' : 'back')"
          :color="look.color"
          @click="back(action)"
        />
        <CuiTileAction
          v-if="state.mode === 'on' && state.until && !narrow"
          class="home-action__extend"
          show-label
          :icon="PlusIcon"
          :label="durationLabel(EXTEND_MINUTES)"
          :aria-label="t('views.home_dashboard.actions.extend')"
          @click="extend(action)"
        />
        <CuiTileHoldAction
          v-if="state.mode === 'partial' && !narrow"
          class="home-action__extend"
          show-label
          :label="say(action, 'go_all')"
          :aria-label="goLabel(action, state.minutes)"
          :guarded="look.hold"
          interactive
          @press="go(action, state.minutes)"
          @hint="pillHint = $event"
        />
      </div>
    </template>
  </CuiTileWidget>

  <CuiPopoverSheet ref="detailsRef">
    <CuiHomeActionDetails :states @go="go" @back="back" @extend="extend" />
  </CuiPopoverSheet>
</template>

<script setup lang="ts">
import PlusIcon from '~icons/mdi/plus';
import SpinnerIcon from '~icons/svg-spinners/ring-resize';

import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileCard from '@/components/CuiSensorTile/frame/CuiTileCard.vue';
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import { TILE_EXPAND } from '@/components/CuiSensorTile/types.js';
import { useGuardedPress } from '@/components/CuiSensorTile/useGuardedPress.js';

import { EXTEND_MINUTES, HOME_ACTION_LOOKS, isActionOn, useActionText, useHomeActions } from './actions.js';
import CuiHomeActionDetails from './CuiHomeActionDetails.vue';

import type { ComponentPublicInstance } from 'vue';
import type { CuiHomeActionCardProps } from './types.js';

const props = defineProps<CuiHomeActionCardProps>();

const { t } = useI18n();
const { say, goLabel, durationLabel, heroLeft, clock, countText, busyText, camerasText, lineOf, summaryOf } = useActionText();
const { states, go, back, extend, pressOf } = useHomeActions(() => props);

const WIDE_ROW = 300;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const detailsRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('detailsRef');
const pillHint = ref(false);

const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const { width } = useElementSize(cardEl);

const action = computed(() => props.actions[0]!);
const state = computed(() => states.value[0]!);
const look = computed(() => HOME_ACTION_LOOKS[action.value]);
const lit = computed(() => isActionOn(state.value));
const icon = computed(() => (lit.value ? look.value.onIcon : look.value.icon));
const title = computed(() => say(action.value, 'title'));
const holdText = computed(() => t('views.home_dashboard.actions.recording.hold'));
const press = computed(() => pressOf(state.value));
const wide = computed(() => width.value >= WIDE_ROW);
const tappable = computed(() => props.row && !wide.value && !!press.value);
const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const hero = computed(() => {
  const { mode, until } = state.value;
  if (mode === 'na') return undefined;
  if (mode === 'idle') return say(action.value, 'idle_title');
  if (mode === 'partial') return countText(state.value);
  return until ? heroLeft(state.value) : say(action.value, 'on_title');
});
const heroNote = computed(() => {
  const { mode, since, until, cameras } = state.value;
  if (mode === 'idle') return cameras.length ? camerasText(state.value) : undefined;
  if (mode === 'partial') return say(action.value, 'on');
  if (mode !== 'on') return undefined;
  if (until) return t('views.home_dashboard.actions.until', { time: clock(until) });
  return since ? t('views.home_dashboard.actions.since', { time: clock(since) }) : undefined;
});

const {
  progress,
  holding,
  hint: cardHint,
  onKey,
} = useGuardedPress(cardEl, {
  interactive: () => tappable.value,
  guarded: () => !!press.value?.guarded,
  onGuarded: () => press.value?.run(),
  onTap: () => press.value?.run(),
  onToggle: () => press.value?.run(),
});

const hinting = computed(() => pillHint.value || cardHint.value || holding.value);

provide(TILE_EXPAND, (event) => detailsRef.value?.toggle(event));
</script>

<style scoped>
.home-action__hint {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: var(--text-secondary-color);
}

.home-action__buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.home-action__buttons :deep(.tile-action--labeled) {
  flex: 1 1 0;
  border-radius: 1rem;
}

.home-action__wide.tile-action {
  flex: 1 1 auto;
  width: 100%;
  border-radius: 1rem;
}

.home-action__buttons .home-action__extend.tile-action {
  flex: 0 1 auto;
  border-radius: 9999px;
}

.home-action__tone.tile-action {
  background: color-mix(in srgb, var(--tile-ink) 16%, var(--p-content-background));
  color: var(--tile-ink);
}

.home-action__pill.tile-action {
  flex: none;
  height: 2.5rem;
}

.home-action__durations {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.home-action__durations .home-action__buttons {
  flex: 1 1 auto;
}

.home-action__for {
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1rem;
  white-space: nowrap;
  color: var(--text-secondary-color);
}

.home-action__progress {
  display: block;
  height: 3px;
  border-radius: 9999px;
  overflow: hidden;
  background: color-mix(in srgb, var(--text-color) 15%, transparent);
}

.home-action__progress > span {
  display: block;
  height: 100%;
  background: var(--tile-color);
  transition: width 0.3s ease;
}

@container tile-widget (width >= 360px) {
  .home-action__durations {
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
  }
}
</style>
