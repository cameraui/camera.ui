<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="stateText"
    :value="lit ? speedText : undefined"
    :caption
    :badge="childLock ? LockIcon : undefined"
    :badge-label="propertyLabel(AirPurifierProperty.ChildLock)"
    :color
    :active="lit"
    :fill="lit ? ratio : 0"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    class="fan-card"
    role="switch"
    :aria-checked="on"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template v-if="hasMore" #corner>
      <CuiTileCornerButton
        :style="{ color: filterLife !== undefined ? filterColor : 'var(--text-secondary-color)' }"
        :label="t('components.sensor_tile.fan_settings')"
        :disabled="!interactive"
        @click="emit('expand', $event)"
      >
        <component :is="filterLife !== undefined ? AirFilterIcon : TuneIcon" />
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { AirPurifierProperty } from '@camera.ui/sdk';
import AirFilterIcon from '~icons/mdi/air-filter';
import LockIcon from '~icons/mdi/lock';
import TuneIcon from '~icons/mdi/tune-variant';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import { useFan } from './useFan.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const KEY_STEP = 0.1;

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  on,
  lit,
  color,
  hasSpeed,
  ratio,
  steps,
  speedText,
  hasMore,
  childLock,
  filterLife,
  filterColor,
  caption,
  stateText,
  toggle,
  inputLevel,
  commitLevel,
  propertyLabel,
} = useFan(() => props.sensor);

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => hasSpeed.value,
  ratio: () => (lit.value ? ratio.value : 0),
  keyStep: () => (steps.value > 0 ? 1 / steps.value : KEY_STEP),
  onInput: inputLevel,
  onCommit: commitLevel,
  onToggle: toggle,
});
</script>

<style scoped>
.fan-card {
  touch-action: pan-y;
}
</style>
