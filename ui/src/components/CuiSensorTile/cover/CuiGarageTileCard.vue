<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="hint || holding ? t('components.sensor_tile.hold_to_open') : stateText"
    :color
    :active="wantsOpen || obstructed"
    :fill="holding ? progress : undefined"
    :dragging="holding"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="garage-card"
    role="switch"
    :aria-checked="wantsOpen"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useCover, useGaragePress } from './useCover.js';

import type { SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const cover = useCover(() => props.sensor);
const { wantsOpen, obstructed, color, stateText } = cover;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, hint, onKey } = useGaragePress(cardEl, cover, () => interactive.value);
</script>

<style scoped>
.garage-card {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}
</style>
