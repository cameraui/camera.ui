<template>
  <CuiTileWidget
    ref="widgetRef"
    class="home-safety"
    :icon
    :title="name"
    :state="line"
    :summary
    :color
    :active="!!first"
    :offline="!!detectors.length && offline === detectors.length"
    :hero
    :hero-note="heroNote"
    hero-word
    :hero-toned="!!first"
    @open="listRef?.toggle($event)"
  >
    <template v-if="!first && !narrow && form !== 'tall'" #side>
      <span ref="sideRef" class="home-safety__side" :style="{ '--count': ordered.length }">
        <CuiHomeIconMatrix class="home-safety__matrix" :items="matrixItems" :rows="sideRows" :label="matrixLabel" />
      </span>
    </template>

    <template #extra>
      <CuiHomePager class="home-safety__chips" :items="members" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(sensor) => sensor.id">
        <template #default="{ item }">
          <CuiHomeChip v-bind="chipOf(item)" />
        </template>
      </CuiHomePager>
    </template>

    <div v-if="live || canSilence" class="home-safety__acts">
      <button v-if="live" type="button" class="home-safety__live" :class="{ 'home-safety__live--compact': form === 'compact' }" @click="watchLive">
        <span class="home-safety__dot" />
        <span class="home-safety__live-label">{{ t('views.home_dashboard.show_live') }}</span>
      </button>
      <CuiTileAction
        v-if="canSilence"
        class="home-safety__silence"
        :class="{ 'home-safety__silence--beside': live, 'home-safety__silence--key': live && narrow }"
        :show-label="!(live && narrow)"
        :icon="SirenOffIcon"
        :label="t('components.sensor_tile.silence')"
        :aria-label="t('views.home_dashboard.groups.safety.silence', sounding.length)"
        @click="silence"
      />
    </div>
    <template v-else-if="form === 'compact'">
      <CuiHomeIconMatrix v-if="narrow" :items="matrixItems" :rows="matrixRows(compactSpace)" :label="matrixLabel" />
      <CuiHomePager v-else :items="members" :row-height="CHIP_HEIGHT" :min-width="CHIP_WIDTH" :item-key="(sensor) => sensor.id">
        <template #default="{ item }">
          <CuiHomeChip v-bind="chipOf(item)" />
        </template>
      </CuiHomePager>
    </template>
    <CuiHomeIconMatrix v-else-if="form === 'short' && narrow" :items="matrixItems" :rows="1" :label="matrixLabel" />
  </CuiTileWidget>

  <CuiPopoverSheet ref="listRef" v-slot="{ sheet }">
    <CuiHomeTileGrid v-if="sheet" :sensors="members" :disabled />
    <div v-else class="home-safety__list">
      <CuiHomeChip v-for="sensor in members" :key="sensor.id" v-bind="chipOf(sensor)" />
    </div>
  </CuiPopoverSheet>

  <CuiSensorTileSheet v-if="sheetSensor" ref="sheetRef" :sensor="sheetSensor" :disabled />
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import SirenOffIcon from '~icons/mdi/alarm-light-off-outline';
import ShieldIcon from '~icons/mdi/shield-outline';

import { sensorIcon, sensorStatus, toneColor } from '@/common/sensorDisplay.js';
import CuiPopoverSheet from '@/components/CuiPopoverSheet/CuiPopoverSheet.vue';
import CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';

import CuiHomePager from '../CuiHomePager.vue';
import CuiHomeTileGrid from '../CuiHomeTileGrid.vue';
import CuiHomeChip from './CuiHomeChip.vue';
import CuiHomeIconMatrix from './CuiHomeIconMatrix.vue';
import { useMemberSheet } from './memberSheet.js';
import { detectorColor, names, useSafetyGroup } from './safety.js';
import { matrixRows, useCompactSpace } from './status.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { CuiHomeGroupDesignProps } from '../types.js';
import type { CuiHomeChipProps, HomeMatrixItem } from './status.js';

const props = defineProps<CuiHomeGroupDesignProps>();

const { t } = useI18n();
const router = useRouter();

const { detectors, hits, alarms, offline, ordered, sirens, sounding, color, camera, alarmText, alarmWord, silence } = useSafetyGroup(() => props.sensors);

const CHIP_WIDTH = 120;
const CHIP_HEIGHT = 36;
const SIDE_ROWS = 2;
const SIDE_PAD = 6;

const widgetRef = useTemplateRef<InstanceType<typeof CuiTileWidget>>('widgetRef');
const sideRef = useTemplateRef<HTMLSpanElement>('sideRef');
const listRef = useTemplateRef<InstanceType<typeof CuiPopoverSheet>>('listRef');
const sheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sheetRef');

const { sheetSensor } = useMemberSheet(sheetRef);

const widgetEl = computed(() => widgetRef.value?.$el as HTMLElement | undefined);
const compactSpace = useCompactSpace(widgetEl);
const { height: sideHeight } = useElementSize(sideRef);

const form = computed(() => widgetRef.value?.form ?? 'short');
const narrow = computed(() => widgetRef.value?.narrow ?? false);
const first = computed<ReactiveSensor | undefined>(() => hits.value[0]);
const live = computed(() => !!first.value && !!camera.value);
const canSilence = computed(() => !props.disabled && sounding.value.length > 0);
// a detector's own siren shows as a chip next to the detectors
const members = computed(() => [...ordered.value, ...sirens.value]);
const icon = computed(() => (first.value ? sensorIcon(first.value.type, first.value) : ShieldIcon));
const offlineText = computed(() => (offline.value ? t('views.home_dashboard.groups.safety.offline', { count: offline.value }) : undefined));
const line = computed(() => {
  if (alarms.value.length) return alarmText.value;
  const count = t('views.home_dashboard.groups.safety.count', { count: detectors.value.length }, detectors.value.length);
  return offlineText.value ? `${count} · ${offlineText.value}` : count;
});
const summary = computed(() => (first.value ? line.value : (offlineText.value ?? t('views.home_dashboard.groups.safety.calm'))));
const hero = computed(() => (first.value ? alarmWord(first.value.type) : t('views.home_dashboard.groups.safety.calm')));
const heroNote = computed(() => (alarms.value.length && !narrow.value ? names(alarms.value[0].sensors) : undefined));
const sideRows = computed(() => Math.min(SIDE_ROWS, matrixRows(sideHeight.value - SIDE_PAD)));
const matrixItems = computed<HomeMatrixItem[]>(() =>
  ordered.value.map((sensor) => ({ key: sensor.id, icon: sensorIcon(sensor.type, sensor), on: hits.value.includes(sensor), color: detectorColor(sensor) })),
);
const matrixLabel = computed(() =>
  first.value ? line.value : t('views.home_dashboard.groups.safety.calm_count', { count: detectors.value.length }, detectors.value.length),
);

function chipOf(sensor: ReactiveSensor): CuiHomeChipProps {
  const name = sensor.displayName.value;
  const look = { sensor, label: name, icon: sensorIcon(sensor.type, sensor), large: true, offline: !sensor.online.value };
  if (sensor.type === SensorType.Siren) {
    return { ...look, on: sounding.value.includes(sensor), color: toneColor('alarm'), ariaLabel: `${name}: ${sensorStatus(sensor.type, sensor, t)}` };
  }
  const hit = hits.value.includes(sensor);
  const ariaLabel = hit ? `${name}: ${alarmWord(sensor.type)}` : t('views.home_dashboard.groups.safety.member_calm', { name });
  return { ...look, on: hit, color: detectorColor(sensor), ariaLabel };
}

function watchLive() {
  if (camera.value) router.push(`/cameras/${encodeURIComponent(camera.value.name)}`);
}
</script>

<style scoped>
.home-safety__chips {
  align-self: stretch;
}

.home-safety__side {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-self: stretch;
  flex: none;
  width: min(50%, calc(var(--count) * 1.875rem - 0.375rem));
  min-height: 0;
  padding-bottom: 0.375rem;
  overflow: hidden;
}

.home-safety__matrix {
  justify-content: flex-end;
}

.home-safety__acts {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.home-safety__live {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  height: 3rem;
  padding: 0 1rem;
  border-radius: 1rem;
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}

.home-safety__live:active {
  transform: scale(0.96);
}

.home-safety__live:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-safety__live--compact {
  height: 2.5rem;
}

.home-safety .home-safety__silence {
  flex: 1 1 auto;
  border-radius: 1rem;
}

.home-safety .home-safety__silence--beside {
  flex: none;
}

.home-safety .home-safety__silence--key {
  aspect-ratio: 1;
}

.home-safety__dot {
  flex-shrink: 0;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgb(255 255 255 / 0.3);
}

.home-safety__live-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-safety__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem;
}
</style>
