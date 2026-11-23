<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="stateText"
    :value="lit && hasBrightness ? `${percent} %` : undefined"
    :color="lightColor"
    :active="lit"
    :fill="lit ? level : 0"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    class="light-card"
    role="switch"
    :aria-checked="on"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template #corner>
      <CuiTileCornerButton
        v-if="hasTemperature || hasColor"
        :class="{ 'light-card__swatch--off': !on }"
        :style="{ background: lightColor }"
        :label="t('components.sensor_tile.light_color')"
        @click="emit('expand', $event)"
      />
      <CuiTileCornerButton v-else :label="t('components.sensor_tile.controls')" @click="emit('expand', $event)">
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
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import { useLight } from './useLight.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const KEY_STEP = 0.1;

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { on, lit, hasBrightness, hasTemperature, hasColor, level, percent, lightColor, stateText, toggle, inputLevel, commitLevel } = useLight(() => props.sensor);

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => hasBrightness.value,
  ratio: () => (on.value ? level.value : 0),
  keyStep: () => KEY_STEP,
  onInput: inputLevel,
  onCommit: commitLevel,
  onToggle: toggle,
});
</script>

<style scoped>
.light-card {
  touch-action: pan-y;
}

.light-card__swatch--off {
  opacity: 0.5;
}
</style>
