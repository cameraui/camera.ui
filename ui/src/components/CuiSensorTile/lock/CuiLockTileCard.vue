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
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useLock, useLockPress } from './useLock.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

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
