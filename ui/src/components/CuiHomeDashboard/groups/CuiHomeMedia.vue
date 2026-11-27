<template>
  <CuiTileWidget
    ref="widgetRef"
    :icon
    :title="name"
    :state="stateText"
    :summary="main ? hero : stateText"
    :color
    :active="playing.length > 0"
    :offline
    :hero
    hero-word
    :hero-note="narrow ? undefined : heroNote"
    extra-shows-hero
    @open="listRef?.toggle($event)"
  >
    <template #extra>
      <CuiHomePager class="home-media__players" :items="players" :row-height="ROW_HEIGHT" :min-width="ROW_WIDTH" :item-key="(player) => player.id">
        <template #default="{ item }">
          <CuiHomeMediaRow :sensor="item" :disabled />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="!disabled && (hasTransport || hasVolume)" class="home-media__controls" :class="{ 'home-media__controls--round': !narrow }">
      <template v-if="hasTransport">
        <CuiTileAction
          v-if="hasSkip"
          :icon="PreviousIcon"
          :label="t('components.automation_nodes.mediaPlayer_state_previous')"
          :interactive="interactive && canSkip"
          @click="skip(MediaPlayerCommand.Previous)"
        />
        <CuiTileAction
          :icon="playing.length ? PauseIcon : PlayIcon"
          :label="playing.length ? t('views.home_dashboard.groups.media.pause_all') : t('components.automation_nodes.mediaPlayer_state_play')"
          :interactive="interactive && canPlayPause"
          @click="playPause"
        />
        <CuiTileAction
          v-if="hasSkip"
          :icon="NextIcon"
          :label="t('components.automation_nodes.mediaPlayer_state_next')"
          :interactive="interactive && canSkip"
          @click="skip(MediaPlayerCommand.Next)"
        />
      </template>
      <CuiLevelBar
        v-if="hasVolume && (!narrow || !hasTransport)"
        class="home-media__volume"
        :value="volume"
        :label="muted ? t('components.sensor_tile.muted') : `${percent} %`"
        :aria-label="t('components.automation_nodes.sensor_property_volume')"
        :color
        :disabled="!interactive || !canSetVolume"
        @input="inputVolume"
        @commit="commitVolume"
      />
    </div>
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef">
    <div class="home-media__list">
      <CuiHomeMediaRow v-for="player in players" :key="player.id" :sensor="player" :disabled />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { MediaPlayerCommand, SensorType } from '@camera.ui/sdk';
import MusicIcon from '~icons/mdi/music';
import PauseIcon from '~icons/mdi/pause';
import PlayIcon from '~icons/mdi/play';
import NextIcon from '~icons/mdi/skip-next';
import PreviousIcon from '~icons/mdi/skip-previous';

import { sensorTypeIcon } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiLevelBar from '@/components/CuiSensorTile/frame/CuiLevelBar.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeMediaRow from './CuiHomeMediaRow.vue';
import { isScreen, playerRank } from './media.js';
import { useMemberSheet } from './memberSheet.js';
import { useMediaGroup } from './useMediaGroup.js';

import type { CuiHomeGroupDesignProps } from '../types.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();

const ROW_WIDTH = 260;
const ROW_HEIGHT = 48;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const members = computed(() => props.sensors.filter((sensor) => sensor.type !== SensorType.Battery));
const {
  playing,
  main,
  color,
  hasTransport,
  hasSkip,
  canSkip,
  canPlayPause,
  hasVolume,
  canSetVolume,
  volume,
  percent,
  muted,
  stateText,
  hero,
  heroNote,
  playPause,
  skip,
  inputVolume,
  commitVolume,
} = useMediaGroup(() => members.value);

const offline = computed(() => members.value.every((member) => !member.online.value));
const interactive = computed(() => !props.disabled && !offline.value);
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const players = computed(() => [...members.value].sort((a, b) => playerRank(a) - playerRank(b)));
const icon = computed(() => (members.value.every(isScreen) ? sensorTypeIcon(SensorType.MediaPlayer, playing.value.length > 0) : MusicIcon));
</script>

<style scoped>
.home-media__players {
  align-self: stretch;
}

.home-media__controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.home-media__controls--round .tile-action {
  flex: none;
  width: 3rem;
}

.tile-widget--compact .home-media__controls--round .tile-action {
  width: 2.5rem;
}

.home-media__controls .home-media__volume {
  flex: 1 1 auto;
  min-width: 0;
  height: 3rem;
}

.tile-widget--compact .home-media__controls .home-media__volume {
  height: 2.5rem;
}

.home-media__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
</style>
