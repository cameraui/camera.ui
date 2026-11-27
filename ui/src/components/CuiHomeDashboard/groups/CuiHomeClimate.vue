<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-climate"
    :icon="FireIcon"
    :title="name"
    :state="stateText"
    :summary
    :color
    :active="heatingCount > 0"
    :offline
    :hero="narrow ? range : undefined"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template v-if="!narrow && !disabled" #actions>
      <CuiHomeClimateModes :options :selected="mode" :icons="compact || inner < LABELS_IN_HEAD_FROM" :disabled="!interactive" @select="setMode" />
    </template>

    <template #extra>
      <CuiHomePager class="home-climate__rooms" :items="rooms" :row-height="BIG_ROOM.height" :min-width="BIG_ROOM.width" :item-key="(room) => room.key">
        <template #default="{ item }">
          <CuiHomeClimateRoom :room="item" big @click="openMember(item.sensor, $event)" />
        </template>
      </CuiHomePager>
    </template>

    <template #default="{ form }">
      <CuiHomeClimateModes v-if="narrow && !disabled" class="home-climate__modes" :options :selected="mode" icons :disabled="!interactive" @select="setMode" />
      <CuiHomePager
        v-else-if="!narrow && form !== 'tall'"
        class="home-climate__rooms"
        :items="rooms"
        :row-height="ROOM.height"
        :min-width="ROOM.width"
        :item-key="(room) => room.key"
      >
        <template #default="{ item }">
          <CuiHomeClimateRoom :room="item" @click="openMember(item.sensor, $event)" />
        </template>
      </CuiHomePager>
    </template>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="cui-tile home-climate__list" :style="{ '--tile-color': color }">
      <CuiHomeClimateRoom v-for="room in rooms" :key="room.key" :room big @click="openMember(room.sensor, $event)" />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import FireIcon from '~icons/mdi/fire';

import { toneColor } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import { useClimateGroup } from './climate.js';
import CuiHomeClimateModes from './CuiHomeClimateModes.vue';
import CuiHomeClimateRoom from './CuiHomeClimateRoom.vue';
import { useMemberSheet } from './memberSheet.js';

import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { options, mode, rooms, heatingCount, range, offline, stateText, summary, setMode } = useClimateGroup(
  () => props.sensors,
  () => props.name,
);

const ROOM = { width: 90, height: 78 };
const BIG_ROOM = { width: 150, height: 92 };
const LABELS_IN_HEAD_FROM = 380;
const CARD_PADDING = 32;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor, openMember } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const { width } = useElementSize(widgetEl, undefined, { box: 'border-box' });

const color = toneColor('warn');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const compact = computed(() => widgetRef.value?.form === 'compact');
const inner = computed(() => width.value - CARD_PADDING);
const interactive = computed(() => !props.disabled && !offline.value);
</script>

<style scoped>
.home-climate :deep(.tile-widget__body:empty) {
  display: none;
}

.home-climate.tile-widget--compact :deep(.tile-widget__body) {
  flex: 1 1 auto;
  justify-content: flex-end;
  min-height: 0;
}

.home-climate__rooms {
  flex: 1 1 auto;
  align-self: stretch;
  justify-content: flex-end;
  min-height: 0;
}

.tile-widget__extra .home-climate__rooms {
  justify-content: center;
}

.home-climate__modes {
  --home-climate-modes-height: 2.75rem;
}

.home-climate.tile-widget--compact .home-climate__modes {
  --home-climate-modes-height: 2.5rem;
}

.home-climate__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
}
</style>
