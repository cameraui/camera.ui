<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="hint || holding ? t('components.sensor_tile.hold_to_sound') : stateText"
    :color
    :active
    :fill="holding ? progress : active ? 1 : 0"
    :dragging="holding"
    :offline="!online"
    :compact="size === 'small'"
    class="siren-card"
    role="switch"
    :aria-checked="active"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template #corner>
      <CuiTileCornerButton :label="hasVolume ? propertyLabel(SirenProperty.Volume) : t('components.sensor_tile.controls')" @click="emit('expand', $event)">
        <VolumeIcon v-if="hasVolume" />
        <TuneIcon v-else />
      </CuiTileCornerButton>
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { SirenProperty } from '@camera.ui/sdk';
import TuneIcon from '~icons/mdi/tune-variant';
import VolumeIcon from '~icons/mdi/volume-high';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useTileSensor } from '../useTileSensor.js';
import { useSiren, useSirenPress } from './useSiren.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const siren = useSiren(() => props.sensor);
const { active, color, hasVolume, stateText, propertyLabel } = siren;

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { progress, holding, hint, onKey } = useSirenPress(cardEl, siren, () => interactive.value);
</script>

<style scoped>
.siren-card {
  touch-action: pan-y;
  -webkit-touch-callout: none;
}
</style>
