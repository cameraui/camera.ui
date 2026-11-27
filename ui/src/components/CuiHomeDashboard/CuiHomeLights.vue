<template>
  <CuiTileCard
    v-if="row"
    ref="cardRef"
    :icon="HOME_ICONS.lights"
    :title="name"
    :state="line"
    :value="dimmed ? `${percent} %` : undefined"
    :caption="line"
    :color
    :active="anyOn"
    :fill="level"
    :dragging
    :offline
    compact
    role="switch"
    :aria-checked="anyOn"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  />
  <CuiTileWidget
    v-else
    ref="widgetRef"
    :icon="HOME_ICONS.lights"
    :title="name"
    :state="line"
    :summary
    :color
    :active="anyOn"
    :offline
    :hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="!switchInBody && !disabled" #actions>
      <ToggleSwitch :model-value="anyOn" :disabled="!interactive" :aria-label="t('views.home_dashboard.lights_switch')" @update:model-value="toggle" />
    </template>

    <template #extra>
      <CuiHomePager class="home-lights__chips" :items="members" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(member) => member.id">
        <template #default="{ item }">
          <CuiHomeLightChip v-if="item.type === SensorType.Light" :sensor="item" :disabled />
          <CuiHomeSwitchChip v-else :sensor="item" :color typed :disabled />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="!disabled && (hasBrightness || switchInBody)" class="home-lights__controls">
      <CuiLevelBar
        v-if="hasBrightness"
        class="home-lights__level"
        :value="level"
        :label="t('components.sensor_tile.brightness')"
        :color
        :disabled="!interactive"
        @input="inputLevel"
        @commit="commitLevel"
      />
      <ToggleSwitch
        v-if="switchInBody"
        :model-value="anyOn"
        :disabled="!interactive"
        :aria-label="t('views.home_dashboard.lights_switch')"
        @update:model-value="toggle"
      />
    </div>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" v-slot="{ sheet }" shrink>
    <CuiHomeTileGrid v-if="sheet" :sensors="members" :disabled />
    <div v-else class="home-lights__list">
      <template v-for="member in members" :key="member.id">
        <CuiHomeLightChip v-if="member.type === SensorType.Light" :sensor="member" :disabled />
        <CuiHomeSwitchChip v-else :sensor="member" :color typed :disabled />
      </template>
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiLevelBar from '@/components/CuiSensorTile/frame/CuiLevelBar.vue';
import CuiTileCard from '@/components/CuiSensorTile/frame/CuiTileCard.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import { TILE_EXPAND } from '@/components/CuiSensorTile/types.js';
import { useCardLevel } from '@/components/CuiSensorTile/useCardLevel.js';

import CuiHomeLightChip from './CuiHomeLightChip.vue';
import CuiHomePager from './CuiHomePager.vue';
import CuiHomeTileGrid from './CuiHomeTileGrid.vue';
import CuiHomeSwitchChip from './groups/CuiHomeSwitchChip.vue';
import { useMemberSheet } from './groups/memberSheet.js';
import { HOME_ICONS } from './home.js';
import { useLightGroup } from './useLightGroup.js';

import type { ComponentPublicInstance } from 'vue';
import type { CuiHomeLightsProps } from './types.js';

const props = defineProps<CuiHomeLightsProps>();

const { t } = useI18n();

const KEY_STEP = 0.1;
const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 32;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const members = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery));
const { anyOn, dimmed, hasBrightness, level, percent, color, stateText, toggle, inputLevel, commitLevel } = useLightGroup(() => members.value);

const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && !offline.value);
const line = computed(() => (props.room ? `${props.room} · ${stateText.value}` : stateText.value));
const hero = computed(() => (dimmed.value ? `${percent.value} %` : t(`components.sensor_state.${anyOn.value ? 'on' : 'off'}`)));
const summary = computed(() => (props.disabled && dimmed.value ? `${stateText.value} · ${percent.value} %` : stateText.value));
const switchInBody = computed(() => widgetRef.value?.form === 'compact' && widgetRef.value.narrow);

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => hasBrightness.value,
  ratio: () => level.value,
  keyStep: () => KEY_STEP,
  onInput: inputLevel,
  onCommit: commitLevel,
  onToggle: toggle,
});

provide(TILE_EXPAND, (event) => listRef.value?.toggle(event));
</script>

<style scoped>
.home-lights__chips {
  align-self: stretch;
}

.home-lights__chips :deep(.home-chip) {
  width: 100%;
}

.home-lights__controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
}

.home-lights__level {
  flex: 1 1 auto;
  min-width: 0;
}

.home-lights__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
</style>
