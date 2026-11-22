<template>
  <CuiTilePanel :icon :title="name" :state="headline" :color :active="lit" :offline="!online">
    <template v-if="hasPower" #actions>
      <CuiTileButton :icon="PowerIcon" :label="t('components.sensor_tile.power')" :color :active="on" :interactive @click="toggle" />
    </template>

    <div class="flex flex-col items-center gap-4">
      <CuiScreenScene v-if="kind === MediaPlayerKind.Tv || kind === MediaPlayerKind.Projector" :lit :playing :projector="kind === MediaPlayerKind.Projector" />
      <CuiSoundScene v-else :lit :playing />

      <CuiTileReading :state="title ?? stateWord" :detail="title ? artist : undefined" />

      <CuiMediaTransport v-if="commands.length > 0" :commands :playing :interactive @command="command" />

      <div v-if="hasVolume || hasMute" class="media-large__volume">
        <CuiLevelBar
          v-if="hasVolume"
          class="flex-1"
          :value="ratio"
          :label="muted ? t('components.sensor_tile.muted') : `${percent} %`"
          :aria-label="propertyLabel(MediaPlayerProperty.Volume)"
          :color
          :disabled="!interactive"
          @input="inputVolume"
          @commit="commitVolume"
        />
        <CuiTileButton
          v-if="hasMute"
          :icon="muted ? MuteIcon : VolumeIcon"
          :label="propertyLabel(MediaPlayerProperty.Muted)"
          :color
          :active="muted"
          :interactive
          @click="setMuted(!muted)"
        />
      </div>

      <div v-if="sources.length > 0" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(MediaPlayerProperty.Source) }}</span>
        <SelectButton
          v-if="sources.length <= MAX_SOURCE_BUTTONS"
          :model-value="source"
          :options="sources"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :disabled="!interactive"
          size="small"
          fluid
          @update:model-value="setSource"
        />
        <Select v-else :model-value="source" :options="sources" option-label="label" option-value="value" size="small" fluid :disabled="!interactive" @update:model-value="setSource" />
      </div>

      <CuiTileHistoryTimeline :sensor :property="MediaPlayerProperty.State" :color-of="timelineColor" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { MediaPlayerKind, MediaPlayerProperty } from '@camera.ui/sdk';
import PowerIcon from '~icons/lucide/power';
import VolumeIcon from '~icons/mdi/volume-high';
import MuteIcon from '~icons/mdi/volume-off';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiLevelBar from '../frame/CuiLevelBar.vue';
import CuiTileButton from '../frame/CuiTileButton.vue';
import CuiTileHistoryTimeline from '../frame/CuiTileHistoryTimeline.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileReading from '../frame/CuiTileReading.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiMediaTransport from './CuiMediaTransport.vue';
import CuiScreenScene from './CuiScreenScene.vue';
import CuiSoundScene from './CuiSoundScene.vue';
import { useMediaPlayer } from './useMediaPlayer.js';

import type { SensorTileProps } from '../types.js';

const MAX_SOURCE_BUTTONS = 4;

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const {
  kind,
  hasPower,
  on,
  lit,
  playing,
  color,
  hasVolume,
  ratio,
  percent,
  hasMute,
  muted,
  commands,
  sources,
  source,
  sourceLabel,
  title,
  artist,
  stateWord,
  toggle,
  command,
  inputVolume,
  commitVolume,
  setMuted,
  setSource,
  propertyLabel,
  timelineColor,
} = useMediaPlayer(() => props.sensor);

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const headline = computed(() => {
  if (!online.value) return t('connection.offline');
  return lit.value && sourceLabel.value ? `${stateWord.value} · ${sourceLabel.value}` : stateWord.value;
});
</script>

<style scoped>
.media-large__volume {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
}
</style>
