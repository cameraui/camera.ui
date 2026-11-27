<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="hint || holding ? t('components.sensor_tile.hold_to_disarm') : stateText"
    :color
    :active="wantsArmed || triggered"
    :fill="holding ? 1 - progress : triggered ? 1 : 0"
    :dragging="holding"
    :offline="!online"
    :compact="size === 'small'"
    :mini="size === 'mini'"
    class="security-card"
    role="switch"
    :aria-checked="wantsArmed"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  />
</template>

<script setup lang="ts">
import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useSecurityPress, useSecuritySystem } from './useSecuritySystem.js';

import type { ComponentPublicInstance } from 'vue';
import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const system = useSecuritySystem(() => props.sensor);
const { triggered, wantsArmed, color, stateText } = system;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, hint, onKey } = useSecurityPress(cardEl, system, () => interactive.value);
</script>

<style scoped>
.security-card {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}
</style>
