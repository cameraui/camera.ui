<template>
  <CuiTileCard
    ref="cardRef"
    :icon
    :title="name"
    :state="stateText"
    :value="lit && hasVolume ? `${percent} %` : undefined"
    :badge="muted ? MuteIcon : undefined"
    :badge-label="propertyLabel(MediaPlayerProperty.Muted)"
    :color
    :active="lit"
    :fill="lit && hasVolume ? ratio : 0"
    :dragging
    :offline="!online"
    :compact="size === 'small'"
    class="media-card"
    role="switch"
    :aria-checked="hasPower ? on : playing"
    :aria-label="name"
    :tabindex="interactive ? 0 : -1"
    @keydown="onKey"
  >
    <template #corner>
      <CuiTileCornerButton :label="t('components.sensor_tile.controls')" :disabled="!interactive" @click="emit('expand', $event)">
        <RemoteIcon />
      </CuiTileCornerButton>
    </template>
    <template v-if="size === 'medium' && lit" #bottom>
      <CuiMediaTransport compact :commands :playing :interactive @command="command" />
    </template>
  </CuiTileCard>
</template>

<script setup lang="ts">
import { MediaPlayerProperty } from '@camera.ui/sdk';
import RemoteIcon from '~icons/mdi/remote';
import MuteIcon from '~icons/mdi/volume-off';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileCard from '../frame/CuiTileCard.vue';
import CuiTileCornerButton from '../frame/CuiTileCornerButton.vue';
import { useCardLevel } from '../useCardLevel.js';
import { useTileSensor } from '../useTileSensor.js';
import CuiMediaTransport from './CuiMediaTransport.vue';
import { useMediaPlayer } from './useMediaPlayer.js';

import type { SensorTileEmits, SensorTileProps } from '../types.js';
import type { ComponentPublicInstance } from 'vue';

const KEY_STEP = 0.05;

const props = defineProps<SensorTileProps>();
const emit = defineEmits<SensorTileEmits>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { hasPower, on, lit, playing, color, hasVolume, ratio, percent, muted, commands, stateText, toggle, command, inputVolume, commitVolume, propertyLabel } = useMediaPlayer(
  () => props.sensor,
);

const cardRef = useTemplateRef<ComponentPublicInstance>('cardRef');
const cardEl = computed(() => cardRef.value?.$el as HTMLElement | undefined);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));

const { dragging, onKey } = useCardLevel(cardEl, {
  interactive: () => interactive.value,
  draggable: () => lit.value && hasVolume.value,
  ratio: () => ratio.value,
  keyStep: () => KEY_STEP,
  onInput: inputVolume,
  onCommit: commitVolume,
  onToggle: toggle,
});
</script>

<style scoped>
.media-card {
  touch-action: pan-y;
}
</style>
