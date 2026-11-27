<template>
  <CuiTileWidget
    ref="widgetRef"
    :icon
    :title="name"
    :state="stateText"
    :color
    :active="open.length > 0"
    :offline
    :hero
    :summary
    :hero-note="narrow && percent ? t('views.home_dashboard.groups.covers.open_note') : undefined"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="!narrow" #side>
      <span ref="sideRef" class="home-covers__side">
        <CuiHomeCoverWindow
          v-for="cover in sideCovers"
          :key="cover.id"
          :sensor="cover"
          :name="labelOf(cover)"
          :width="sideWidth"
          :disabled
          :style="{ width: `${sideWidth}px` }"
        />
        <span v-if="sideHidden" class="home-covers__more">+{{ sideHidden }}</span>
      </span>
    </template>

    <template #extra>
      <CuiHomePager ref="pagerRef" class="home-covers__windows" :items="members" :row-height="rowHeight" :min-width="columnWidth" :item-key="(cover) => cover.id">
        <template #default="{ item }">
          <CuiHomeCoverWindow
            :sensor="item"
            :name="labelOf(item)"
            :width="windowWidth"
            :labeled
            :disabled
            :style="{ height: `${rowHeight}px` }"
            @open="openMember(item, $event)"
          />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="!disabled" class="home-covers__controls" :class="`home-covers__controls--${layout}`">
      <CuiLevelBar
        v-if="layout !== 'keys'"
        class="home-covers__level"
        :value="level"
        :label="`${percent} %`"
        :aria-label="t('views.home_dashboard.groups.covers.position_all')"
        :color
        :disabled="!interactive"
        @input="inputLevel"
        @commit="commitLevel"
      />
      <CuiTileAction
        :class="{ 'home-covers__key--pressed': pressed === 'up' }"
        :icon="UpIcon"
        :label="t('views.home_dashboard.groups.covers.open_all')"
        :interactive
        v-on="listeners('up')"
      />
      <CuiTileAction v-if="canStop" :icon="StopIcon" :label="t('views.home_dashboard.groups.covers.stop_all')" :interactive @click="stopAll" />
      <CuiTileAction
        :class="{ 'home-covers__key--pressed': pressed === 'down' }"
        :icon="DownIcon"
        :label="t('views.home_dashboard.groups.covers.close_all')"
        :interactive
        v-on="listeners('down')"
      />
    </div>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="home-covers__list">
      <CuiHomeCoverWindow
        v-for="cover in members"
        :key="cover.id"
        :sensor="cover"
        :name="labelOf(cover)"
        :width="LIST_WIDTH"
        labeled
        :disabled
        @open="openMember(cover, $event)"
      />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { CoverProperty, SensorType } from '@camera.ui/sdk';
import DownIcon from '~icons/lucide/chevrons-down';
import UpIcon from '~icons/lucide/chevrons-up';
import StopIcon from '~icons/lucide/square';

import { sensorIcon, sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import { useMovePress } from '@/components/CuiSensorTile/cover/useMovePress.js';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiLevelBar from '@/components/CuiSensorTile/frame/CuiLevelBar.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import { useCoverGroup } from './covers.js';
import CuiHomeCoverWindow from './CuiHomeCoverWindow.vue';
import { useMemberSheet } from './memberSheet.js';
import { shortNames } from './names.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { ComponentPublicInstance } from 'vue';
import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const SCENE_RATIO = 200 / 220;
const SIDE_WIDTH = 32;
const SIDE_GAP = 8;
const DOTS_HEIGHT = 14;
const PAGER_GAP = 6;
const COLUMN_WIDTH = 64;
const LABELS_HEIGHT = 40;
const PANE_MIN = 28;
const PANE_MAX = 120;
const LIST_WIDTH = 56;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const sideRef = useTemplateRef<HTMLSpanElement>('sideRef');
const pagerRef = useTemplateRef<ComponentPublicInstance>('pagerRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const members = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery));
const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && !offline.value);

const { positioned, open, canStop, color, held, level, percent, stateText, moveAll, stopAll, inputLevel, commitLevel } = useCoverGroup(() => members.value);
const { pressed, listeners } = useMovePress({
  interactive: () => interactive.value,
  level: () => (positioned.value.length ? percent.value : undefined),
  onMove: moveAll,
  onCount: (value) => (held.value = value),
  onSet: (value) => commitLevel(value / 100),
});

const { sheetSensor, openMember } = useMemberSheet(sheetRef);

const pagerEl = computed(() => pagerRef.value?.$el as HTMLElement | undefined);
const { width: sideSpace, height: sideHeight } = useElementSize(sideRef);
const { width: pagerWidth, height: pagerHeight } = useElementSize(pagerEl);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const labels = computed(() => {
  const names = shortNames(members.value.map((member) => member.displayName.value));
  return new Map(members.value.map((member, index) => [member.id, names[index]]));
});
const icon = computed(() => {
  const kinds = new Set(members.value.map((member) => member.getProperty(CoverProperty.Kind)));
  const lead = open.value[0] ?? members.value[0];
  return kinds.size === 1 && lead ? sensorIcon(SensorType.Cover, lead) : sensorTypeIcon(SensorType.Cover, open.value.length > 0);
});
const hero = computed(() => (percent.value ? `${percent.value} %` : t('views.home_dashboard.groups.covers.closed')));
const summary = computed(() => {
  if (held.value !== undefined) return hero.value;
  return props.disabled && positioned.value.length && percent.value ? `${stateText.value} · ${percent.value} %` : undefined;
});
const layout = computed(() => {
  if (!positioned.value.length) return 'keys';
  if (form.value === 'tall') return 'stacked';
  return form.value === 'compact' && !narrow.value ? 'round' : 'keys';
});
const sideWidth = computed(() => Math.min(SIDE_WIDTH, Math.floor(sideHeight.value * SCENE_RATIO)));
const sideFits = computed(() => Math.max(1, Math.floor((sideSpace.value + SIDE_GAP) / (sideWidth.value + SIDE_GAP))));
const sideCovers = computed(() => (members.value.length > sideFits.value ? members.value.slice(0, sideFits.value - 1) : members.value));
const sideHidden = computed(() => members.value.length - sideCovers.value.length);
const rowHeight = computed(() => Math.max(0, pagerHeight.value - DOTS_HEIGHT));
const labeled = computed(() => rowHeight.value >= LABELS_HEIGHT + PANE_MIN);
const windowWidth = computed(() => Math.floor(Math.min(PANE_MAX, labeled.value ? rowHeight.value - LABELS_HEIGHT : rowHeight.value) * SCENE_RATIO));
const columnWidth = computed(() => Math.max(COLUMN_WIDTH, Math.floor((pagerWidth.value + PAGER_GAP) / Math.max(1, members.value.length)) - PAGER_GAP));

function labelOf(cover: ReactiveSensor): string {
  return labels.value.get(cover.id) ?? cover.displayName.value;
}
</script>

<style scoped>
.home-covers__side {
  display: flex;
  flex: 1 1 0;
  align-self: stretch;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 0.5rem;
  min-width: 0;
  padding-bottom: 0.25rem;
}

.home-covers__more {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  min-width: 1.5rem;
  height: 1.5rem;
  padding: 0 0.375rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  color: var(--text-secondary-color);
  font-size: 0.6875rem;
  font-weight: 600;
}

.home-covers__windows {
  align-self: stretch;
  justify-content: center;
}

.home-covers__controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  -webkit-touch-callout: none;
}

.home-covers__controls--stacked {
  flex-wrap: wrap;
  row-gap: 0.75rem;
}

.home-covers__controls--stacked .home-covers__level {
  flex: 1 0 100%;
}

.home-covers__controls--round .home-covers__level {
  flex: 1 1 auto;
  min-width: 0;
}

.home-covers__controls--round .tile-action {
  flex: none;
  width: 2.5rem;
}

.home-covers__controls .home-covers__key--pressed {
  background: color-mix(in srgb, var(--text-color) 12%, var(--p-content-hover-background));
}

.home-covers__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(4rem, 1fr));
  gap: 0.75rem 0.375rem;
}
</style>
