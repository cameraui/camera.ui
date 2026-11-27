<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-robots"
    :icon
    :title="name"
    :state="stateText"
    :summary
    :color
    :active="!!lead"
    :offline="!online.length"
    :hero="narrow ? hero : undefined"
    hero-word
    :hero-toned="!!failed"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="!narrow && form !== 'tall' && actions.length" #actions>
      <CuiTileAction v-for="action in actions" :key="action.key" class="home-robots__round" :icon="action.icon" :label="action.label" @click="run(action)" />
    </template>

    <template #extra>
      <CuiHomePager class="home-robots__rows" :items="robots" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(robot) => robot.id">
        <template #default="{ item }">
          <CuiHomeRobotItem :sensor="item" :battery="batteries.get(item.id)" variant="row" :disabled />
        </template>
      </CuiHomePager>
    </template>

    <template v-if="form === 'tall'">
      <div v-if="actions.length" class="home-robots__acts">
        <CuiTileAction
          v-for="action in actions"
          :key="action.key"
          class="home-robots__act"
          :icon="action.icon"
          :label="action.label"
          :show-label="!narrow"
          @click="run(action)"
        />
      </div>
    </template>
    <div v-else-if="narrow" class="home-robots__stack">
      <CuiHomeIconMatrix v-if="form === 'compact' || !actions.length" :items="matrixItems" :rows="1" :label="stateText" />
      <div v-if="actions.length" class="home-robots__acts">
        <CuiTileAction v-for="action in actions" :key="action.key" :icon="action.icon" :label="action.label" @click="run(action)" />
      </div>
    </div>
    <CuiHomePager
      v-else
      class="home-robots__cells"
      :class="{ 'home-robots__cells--fill': form !== 'compact' }"
      :style="form === 'compact' ? { height: `${compactSpace}px` } : undefined"
      :items="robots"
      :row-height="form === 'compact' ? CHIP_HEIGHT : CELL_HEIGHT"
      :min-width="form === 'compact' ? CHIP_WIDTH : CELL_WIDTH"
      :item-key="(robot) => robot.id"
    >
      <template #default="{ item }">
        <CuiHomeRobotItem :sensor="item" :battery="batteries.get(item.id)" :variant="form === 'compact' ? 'chip' : 'cell'" :disabled />
      </template>
    </CuiHomePager>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" width="18rem">
    <div class="home-robots__list">
      <CuiHomeRobotItem v-for="robot in robots" :key="robot.id" :sensor="robot" :battery="batteries.get(robot.id)" variant="row" :disabled />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import CuiHomeRobotItem from './CuiHomeRobotItem.vue';
import { useMemberSheet } from './memberSheet.js';
import { robotColor, robotLit, useRobotBatteries, useRobotGroup } from './robots.js';
import { useCompactSpace } from './status.js';

import type { CuiHomeGroupDesignProps } from '../types.js';
import type { HomeMatrixItem } from './status.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { robots, online, failed, lead, icon, color, actions: groupActions, stateText, summary, hero, run } = useRobotGroup(() => props.sensors);
const batteries = useRobotBatteries(() => robots.value);

const ROW_WIDTH = 260;
const ROW_HEIGHT = 48;
const CELL_WIDTH = 120;
const CELL_HEIGHT = 80;
const CHIP_WIDTH = 140;
const CHIP_HEIGHT = 36;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const actions = computed(() => (props.disabled ? [] : groupActions.value));
const matrixItems = computed<HomeMatrixItem[]>(() =>
  robots.value.map((robot) => ({ key: robot.id, icon: sensorIcon(robot.type, robot), on: robotLit(robot), color: robotColor(robot) })),
);
</script>

<style scoped>
.home-robots__rows {
  align-self: stretch;
}

.home-robots .home-robots__round {
  flex: none;
  width: 2.5rem;
  height: 2.5rem;
}

.home-robots__stack {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.home-robots__acts {
  display: flex;
  gap: 0.5rem;
}

.home-robots .home-robots__act {
  flex: 1 1 0;
  border-radius: 1rem;
}

.home-robots__cells {
  justify-content: flex-end;
}

.home-robots__cells--fill {
  flex: 1 1 0;
  min-height: 0;
}

.home-robots__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
