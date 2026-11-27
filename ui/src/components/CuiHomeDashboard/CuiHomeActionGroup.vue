<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-actions"
    :icon="HOME_ICONS.action"
    :title="t('views.home_dashboard.actions.group')"
    :state="calm ? `${place} · ${t('views.home_dashboard.actions.all_running')}` : summary"
    :summary
    :color="tone"
    :active="active.length > 0"
    @open="detailsRef?.toggle($event)"
  >
    <template v-if="active.length && !narrow" #actions>
      <CuiTileAction
        class="home-actions__resume"
        show-label
        :icon="PlayIcon"
        :label="t(width < SHORT_RESUME_BELOW ? 'views.home_dashboard.actions.resume' : 'views.home_dashboard.actions.resume_all')"
        :aria-label="t('views.home_dashboard.actions.resume_all')"
        :color="tone"
        @click="resumeAll"
      />
    </template>

    <div v-if="form === 'tall'" class="home-actions__tall" :class="{ 'home-actions__tall--split': split }">
      <div class="home-actions__rows">
        <CuiHomeStatusRow
          v-for="{ state, press, look, lit } in members"
          :key="state.action"
          :icon="lit ? look.onIcon : look.icon"
          :name="say(state.action, 'title')"
          :state="summaryOf(state)"
          :on="lit"
          :color="look.color"
          :offline="state.mode === 'na'"
        >
          <CuiTileAction v-if="state.pending" :icon="SpinnerIcon" :label="busyText(state)" :interactive="false" />
          <CuiTileHoldAction
            v-else-if="press"
            :class="{ 'home-actions__tone': press.resumes }"
            show-label
            :label="press.short"
            :aria-label="`${say(state.action, 'title')}: ${press.label}`"
            :color="look.color"
            :guarded="press.guarded"
            interactive
            @press="press.run()"
            @hint="hint = $event"
          />
        </CuiHomeStatusRow>
      </div>
      <div v-if="split" class="home-actions__cameras">
        <span class="home-actions__place">{{ place }}</span>
        <CuiHomePager :items="cameras" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(camera) => camera._id">
          <template #default="{ item }">
            <CuiHomeChip v-bind="chipOf(item)" />
          </template>
        </CuiHomePager>
      </div>
    </div>
    <div v-else ref="tilesRef" class="home-actions__tiles" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
      <CuiHomeActionTile
        v-for="{ state, press } in members"
        :key="state.action"
        :state
        :press
        :horizontal
        :labeled="horizontal || rowHeight >= LABEL_FROM"
        :detailed="rowHeight >= (horizontal ? ROW_STATE_FROM : STATE_FROM)"
        @hint="hint = $event"
      />
    </div>
  </CuiTileWidget>

  <CuiPopoverSheet ref="detailsRef">
    <CuiHomeActionDetails :states @go="go" @back="back" @extend="extend" />
  </CuiPopoverSheet>
</template>

<script setup lang="ts">
import PlayIcon from '~icons/mdi/play';
import SpinnerIcon from '~icons/svg-spinners/ring-resize';

import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import { HOME_ACTION_LOOKS, isActionOn, useActionText, useHomeActions } from './actions.js';
import CuiHomeActionDetails from './CuiHomeActionDetails.vue';
import CuiHomeActionTile from './CuiHomeActionTile.vue';
import CuiHomePager from './CuiHomePager.vue';
import CuiHomeChip from './groups/CuiHomeChip.vue';
import CuiHomeStatusRow from './groups/CuiHomeStatusRow.vue';
import { HOME_ICONS } from './home.js';

import type { DBCamera } from '@shared/types';
import type { CuiHomeChipProps } from './groups/status.js';
import type { CuiHomeActionProps } from './types.js';

const props = defineProps<CuiHomeActionProps>();

const { t } = useI18n();
const { say, leftText, countText, busyText, summaryOf } = useActionText();
const { states, active, go, back, extend, resumeAll, pressOf } = useHomeActions(() => props);

// card widths in px
const SPLIT_FROM = 600;
const SHORT_RESUME_BELOW = 400;
// tiles share one row when each gets this width and the row this height, else they take two columns
const TILE_WIDTH = 90;
const ONE_ROW_FROM = 96;
const ROW_TILE_WIDTH = 130;
const TILE_GAP = 8;
// tile heights in px from which name and state show
const LABEL_FROM = 52;
const STATE_FROM = 76;
const ROW_STATE_FROM = 40;
const CHIP_WIDTH = 140;
// 2.25rem, the large chip's height
const CHIP_HEIGHT = 36;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const tilesRef = useTemplateRef<HTMLDivElement>('tilesRef');
const detailsRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('detailsRef');
const hint = ref(false);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const { width } = useElementSize(widgetEl);
const { width: tilesWidth, height: tilesHeight } = useElementSize(tilesRef);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const split = computed(() => width.value >= SPLIT_FROM);
const members = computed(() => states.value.map((state) => ({ state, press: pressOf(state), look: HOME_ACTION_LOOKS[state.action], lit: isActionOn(state) })));
const tone = computed(() => active.value[0] && HOME_ACTION_LOOKS[active.value[0].action].color);
const busy = computed(() => states.value.find((state) => state.pending));
const calm = computed(() => !active.value.length && !busy.value && !hint.value);
const summary = computed(() => {
  if (hint.value) return t('views.home_dashboard.actions.recording.hold');
  if (busy.value) return busyText(busy.value);
  const [only, ...more] = active.value;
  if (!only) return t('views.home_dashboard.actions.all_running_title');
  if (more.length) {
    const names = active.value.map((state) => say(state.action, 'title')).join(', ');
    return t('views.home_dashboard.actions.off_names', { count: active.value.length, names });
  }
  const title = say(only.action, 'title');
  const state = say(only.action, 'on');
  if (only.mode === 'partial') return t('views.home_dashboard.actions.member_count', { title, state: `${countText(only)} ${state}` });
  if (!only.until) return t('views.home_dashboard.actions.member_state', { title, state });
  return t('views.home_dashboard.actions.member_left', { title, state, left: t('views.home_dashboard.actions.left', { time: leftText(only) }) });
});
const columns = computed(() => {
  const count = states.value.length;
  return tilesWidth.value / count >= TILE_WIDTH && tilesHeight.value >= ONE_ROW_FROM ? count : 2;
});
const horizontal = computed(() => columns.value < states.value.length && (tilesWidth.value - TILE_GAP) / 2 >= ROW_TILE_WIDTH);
const rowHeight = computed(() => {
  const rows = Math.ceil(states.value.length / columns.value);
  return (tilesHeight.value - TILE_GAP * (rows - 1)) / rows;
});

function chipOf(camera: DBCamera): CuiHomeChipProps {
  const marks = states.value.filter((state) => state.cameras.some((row) => row.on && row.camera._id === camera._id));
  const lead = marks[0] && HOME_ACTION_LOOKS[marks[0].action];
  const state = marks.length
    ? marks.map((mark) => t('views.home_dashboard.actions.member_state', { title: say(mark.action, 'title'), state: say(mark.action, 'on') })).join(', ')
    : t('views.home_dashboard.actions.all_running');
  return {
    label: camera.name,
    icon: lead?.onIcon ?? HOME_ICONS.camera,
    on: !!lead,
    color: lead?.color,
    ariaLabel: t('views.home_dashboard.actions.camera_state', { name: camera.name, state }),
    large: true,
  };
}
</script>

<style scoped>
.home-actions :deep(.tile-widget__body) {
  flex: 1 1 auto;
  min-height: 0;
}

.home-actions .home-actions__resume.tile-action,
.home-actions .home-actions__tone.tile-action {
  background: color-mix(in srgb, var(--tile-ink) 16%, var(--p-content-background));
  color: var(--tile-ink);
}

.home-actions__resume.tile-action {
  flex: none;
  height: 2.5rem;
}

.home-actions__tiles {
  display: grid;
  grid-auto-rows: minmax(0, 1fr);
  gap: 0.5rem;
  flex: 1 1 auto;
  min-height: 0;
}

.home-actions__tall {
  display: grid;
  gap: 1rem;
  flex: 1 1 auto;
  min-height: 0;
}

.home-actions__tall--split {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
}

.home-actions__rows {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.5rem;
  min-width: 0;
}

.home-actions__cameras {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 0.5rem;
  min-width: 0;
  min-height: 0;
}

.home-actions__cameras :deep(.home-pager) {
  flex: 1 1 auto;
  min-height: 0;
}

.home-actions__place {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary-color);
}
</style>
