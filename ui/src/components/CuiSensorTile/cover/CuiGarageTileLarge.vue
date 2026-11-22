<template>
  <CuiTilePanel :icon :title="name" :state="stateText" :color :active="wantsOpen || obstructed" :offline="!online">
    <div class="flex flex-col items-center gap-3">
      <CuiGarageScene :open-ratio="doorRatio" :moving :obstructed />

      <CuiHoldDial
        ref="dialRef"
        class="garage-dial"
        :label="name"
        :checked="wantsOpen"
        :active="wantsOpen || obstructed"
        :holding
        :progress
        :spinning="moving"
        :interactive
        @keydown="onKey"
      >
        <component :is="wantsOpen ? CloseIcon : OpenIcon" class="garage-dial__icon" :class="{ 'garage-dial__icon--active': wantsOpen || obstructed }" />
      </CuiHoldDial>

      <span v-if="interactive" class="text-xs" :class="hint ? 'text-color font-medium' : 'text-muted'">{{ caption }}</span>
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { CoverState } from '@camera.ui/sdk';
import CloseIcon from '~icons/lucide/chevrons-down';
import OpenIcon from '~icons/lucide/chevrons-up';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiHoldDial from '../frame/CuiHoldDial.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiGarageScene from './CuiGarageScene.vue';
import { useCover, useGaragePress } from './useCover.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const cover = useCover(() => props.sensor);
const { current, wantsOpen, moving, obstructed, color, stateText } = cover;

const dialRef = useTemplateRef<ComponentPublicInstance>('dialRef');
const dialEl = computed(() => dialRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, hint, onKey } = useGaragePress(dialEl, cover, () => interactive.value);

const doorRatio = computed(() => (current.value === CoverState.Stopped ? 0.5 : wantsOpen.value ? 1 : 0));
const caption = computed(() => t(`components.sensor_tile.${wantsOpen.value ? 'tap_to_close' : 'hold_to_open'}`));
</script>

<style scoped>
.garage-dial {
  width: 5.5rem;
  height: 5.5rem;
}

.garage-dial__icon {
  width: 2rem;
  height: 2rem;
  color: var(--text-secondary-color);
  transition: color 0.3s ease;
}

.garage-dial__icon--active {
  color: var(--tile-ink);
}
</style>
