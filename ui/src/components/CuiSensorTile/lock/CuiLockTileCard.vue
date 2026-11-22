<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="hint || holding ? t('components.sensor_tile.hold_to_unlock') : stateText"
    :color
    :active="jammed || wantsLocked"
    :fill="holding ? 1 - progress : undefined"
    :dragging="holding"
    :offline="!online"
    :compact="size === 'small'"
    class="lock-card"
    role="switch"
    :aria-checked="wantsLocked"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template #corner>
      <CuiTileCornerButton :label="t('components.sensor_tile.controls')" @click.stop="emit('expand', $event)">
        <TuneIcon />
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import TuneIcon from '~icons/mdi/tune-variant';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useLock, useLockPress } from './useLock.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const lock = useLock(() => props.sensor);
const { jammed, wantsLocked, color, stateText } = lock;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, hint, onKey } = useLockPress(cardEl, lock, () => interactive.value);
</script>

<style scoped>
.lock-card {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}
</style>
