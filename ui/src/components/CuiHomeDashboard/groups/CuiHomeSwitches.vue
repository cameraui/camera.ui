<template>
  <CuiTileWidget ref="widgetRef" :icon :title="name" :state="stateText" :color :active="anyOn" :offline :hero :hero-note="heroNote" @open="listRef?.toggle($event)">
    <template v-if="!switchInBody && !disabled" #actions>
      <ToggleSwitch :model-value="anyOn" :disabled="!interactive" :aria-label="t('views.home_dashboard.groups.switches.switch')" @update:model-value="toggle" />
    </template>

    <template #extra>
      <CuiHomePager class="home-switches__chips" :items="members" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(member) => member.id">
        <template #default="{ item }">
          <CuiHomeSwitchChip :sensor="item" :color :typed="!SWITCH_TYPES.has(item.type)" :disabled />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="switchInBody" class="home-switches__row">
      <CuiHomeIconMatrix class="home-switches__matrix" :items="matrixItems" :rows="SYMBOL_ROWS" :label="stateText" />
      <ToggleSwitch
        v-if="!disabled"
        :model-value="anyOn"
        :disabled="!interactive"
        :aria-label="t('views.home_dashboard.groups.switches.switch')"
        @update:model-value="toggle"
      />
    </div>
    <CuiHomePager
      v-else-if="form !== 'tall'"
      class="home-switches__chips"
      :items="members"
      :row-height="CHIP_HEIGHT"
      :min-width="CHIP_WIDTH"
      :item-key="(member) => member.id"
    >
      <template #default="{ item }">
        <CuiHomeSwitchChip :sensor="item" :color :typed="!SWITCH_TYPES.has(item.type)" :disabled />
      </template>
    </CuiHomePager>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" v-slot="{ sheet }" shrink>
    <CuiHomeTileGrid v-if="sheet" :sensors="members" :disabled />
    <div v-else class="home-switches__list">
      <CuiHomeSwitchChip v-for="member in members" :key="member.id" :sensor="member" :color :typed="!SWITCH_TYPES.has(member.type)" :disabled />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { sensorIcon, sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeTileGrid from '../CuiHomeTileGrid.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import CuiHomeSwitchChip from './CuiHomeSwitchChip.vue';
import { useMemberSheet } from './memberSheet.js';
import { useSwitchGroup } from './useSwitchGroup.js';

import type { CuiHomeGroupDesignProps } from '../types.js';
import type { HomeMatrixItem } from './status.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const SWITCH_TYPES = new Set<string>([SensorType.Switch, SensorType.Outlet]);
const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 32;
const SYMBOL_ROWS = 2;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const members = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery));
const { on, inUse, anyOn, color, stateText, toggle } = useSwitchGroup(() => members.value);

const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && !offline.value);
const form = computed(() => widgetRef.value?.form);
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const switchInBody = computed(() => narrow.value && form.value !== 'tall');
const icon = computed(() => {
  const [type, ...others] = new Set(members.value.map((member) => member.type));
  return sensorTypeIcon(type && !others.length ? type : SensorType.Switch, anyOn.value);
});
const hero = computed(() => (anyOn.value ? t('views.home_dashboard.groups.switches.count_on', { count: on.value.length }) : t('components.sensor_state.off')));
const heroNote = computed(() => (inUse.value && !narrow.value ? t('views.home_dashboard.groups.switches.in_use', { count: inUse.value }) : undefined));
const matrixItems = computed<HomeMatrixItem[]>(() =>
  members.value.map((member) => ({ key: member.id, icon: sensorIcon(member.type, member), on: on.value.includes(member), color })),
);
</script>

<style scoped>
.home-switches__chips {
  align-self: stretch;
}

.home-switches__chips :deep(.home-chip) {
  width: 100%;
}

.home-switches__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.home-switches__matrix {
  flex: 1;
}

.home-switches__list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
</style>
