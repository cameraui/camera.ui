<template>
  <div class="home-plan">
    <header class="home-plan__head">
      <span class="home-plan__heading">
        <RouterLink to="/floorplan" class="home-plan__title" :aria-label="t('views.home_dashboard.floorplan_open', { level: shownLevel.name })">
          {{ t('views.home_dashboard.floorplan') }}
        </RouterLink>
        <span class="home-plan__summary">{{ summary }}</span>
      </span>
      <div v-if="levels.length > 1" class="home-plan__levels">
        <button
          v-for="entry in levels"
          :key="entry.id"
          type="button"
          class="home-plan__level"
          :class="{ 'home-plan__level--active': entry.id === shownLevel.id }"
          :aria-pressed="entry.id === shownLevel.id"
          @click="levelId = entry.id"
        >
          {{ entry.name }}
        </button>
      </div>
    </header>

    <div ref="stageRef" class="home-plan__stage">
      <div
        v-for="tile in tiles"
        :key="tile.key"
        class="home-plan__slot"
        :style="{ left: `${tile.left}px`, top: `${tile.top}px`, width: `${tile.width}px`, height: `${tile.height}px` }"
      >
        <CuiHomePlanRoom v-if="tile.room" :room="tile.room" />
        <RouterLink v-else to="/floorplan" class="home-plan__more" :aria-label="t('views.home_dashboard.plan_more', { count: tile.more }, tile.more)">
          +{{ tile.more }}
        </RouterLink>
      </div>
      <span v-if="width && !rooms.length" class="home-plan__empty">{{ t('views.home_dashboard.floorplan_empty') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAllSensors } from '@camera.ui/browser';
import { ContactKind, ContactProperty, CoverKind, CoverProperty, sensorMeta, SensorType } from '@camera.ui/sdk';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { RoomsQuery } from '@/api/routes/rooms.js';
import { formatMeasurement, isSensorActive, sensorPropertySpec, sensorReading } from '@/common/sensorDisplay.js';
import { cameraActivity } from '@/components/CuiFloorplan/utils.js';

import CuiHomePlanRoom from './CuiHomePlanRoom.vue';
import { planMosaic } from './floorplan.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBRoom } from '@shared/types';
import type { CuiHomeFloorplanProps, HomePlanOpening, HomePlanRoom } from './types.js';

const props = defineProps<CuiHomeFloorplanProps>();

const { t } = useI18n();
const { sensors: live } = useAllSensors();

const { data: catalog } = new RoomsQuery().getRoomsQuery();
const { data: cameraList } = new CamerasQuery().getCamerasQuery({ page: 1, pageSize: -1 });

const MOTION_TYPES = new Set<string>([SensorType.Motion, SensorType.Occupancy]);

const stageRef = useTemplateRef<HTMLDivElement>('stageRef');
const { width, height } = useElementSize(stageRef);

const levelId = ref(props.level.id);

const visibleRooms = computed(() => (catalog.value?.rooms ?? []).filter((room) => room.name !== 'Default' && !props.hiddenRooms.includes(room.id)));
const levels = computed(() =>
  [...(catalog.value?.levels ?? [])].sort((a, b) => a.order - b.order).filter((level) => visibleRooms.value.some((room) => room.levelId === level.id)),
);
const shownLevel = computed(() => levels.value.find((level) => level.id === levelId.value) ?? props.level);
const activity = computed(() => cameraActivity(live.value));
const rooms = computed(() => visibleRooms.value.filter((room) => room.levelId === shownLevel.value.id).map(roomState));
const tiles = computed(() => planMosaic(rooms.value, { width: width.value, height: height.value }));

const summary = computed(() => {
  const lit = rooms.value.filter((room) => room.lit).length;
  const lines = [
    lit ? t('views.home_dashboard.plan_lit', { count: lit }, lit) : '',
    roomList(
      'views.home_dashboard.plan_motion',
      rooms.value.filter((room) => room.motion),
    ),
    roomList(
      'views.home_dashboard.plan_open',
      rooms.value.filter((room) => room.status),
    ),
  ].filter(Boolean);
  return lines.length ? lines.join(' · ') : t('views.home_dashboard.plan_quiet');
});

function roomState(room: DBRoom): HomePlanRoom {
  const sensors = live.value.filter((sensor) => sensor.roomId.value === room.id);
  const cameras = (cameraList.value?.result ?? []).filter((camera) => camera.roomId === room.id);
  const openings = sensors.flatMap((sensor) => opening(sensor) ?? []);

  return {
    id: room.id,
    name: room.name,
    temperature: temperatureOf(sensors),
    status:
      openings.length === 1
        ? t(`views.home_dashboard.plan_open_${openings[0]}`)
        : openings.length
          ? t('views.home_dashboard.plan_open_count', { count: openings.length })
          : undefined,
    lit: sensors.some((sensor) => sensor.type === SensorType.Light && isSensorActive(sensor)),
    motion: sensors.some((sensor) => MOTION_TYPES.has(sensor.type) && isSensorActive(sensor)),
    camera: cameras[0],
    devices: cameras.length + sensors.filter((sensor) => !sensor.boundCameraId && sensor.type !== SensorType.Battery).length,
    alert: cameras.some((camera) => activity.value.get(camera._id)?.level === 'detection'),
  };
}

function temperatureOf(sensors: ReactiveSensor[]): string | undefined {
  const measured = sensors.find((sensor) => sensor.type === SensorType.Temperature && sensorReading(sensor));
  if (measured) return sensorReading(measured);

  for (const sensor of sensors.filter((entry) => entry.type === SensorType.Thermostat)) {
    const property = sensorMeta(sensor.type)?.semantics?.climate?.current;
    const value = property ? sensor.getProperty(property) : undefined;
    if (property && typeof value === 'number') return formatMeasurement(value, sensorPropertySpec(sensor, property));
  }
  return undefined;
}

function opening(sensor: ReactiveSensor): HomePlanOpening | undefined {
  if (!isSensorActive(sensor)) return undefined;
  if (sensor.type === SensorType.Garage) return 'gate';
  if (sensor.type === SensorType.Contact) {
    const kind = sensor.getProperty(ContactProperty.Kind);
    return kind === ContactKind.GarageDoor ? 'gate' : kind === ContactKind.Window ? 'window' : 'door';
  }
  if (sensor.type === SensorType.Cover) {
    const kind = sensor.getProperty(CoverProperty.Kind);
    return kind === CoverKind.Door ? 'door' : kind === CoverKind.Window ? 'window' : undefined;
  }
  return undefined;
}

function roomList(key: string, rooms: HomePlanRoom[]): string {
  if (!rooms.length) return '';
  const names = rooms.length > 2 ? t('views.home_dashboard.plan_room_count', { count: rooms.length }, rooms.length) : rooms.map((room) => room.name).join(', ');
  return t(key, { rooms: names });
}

watch(
  () => props.level.id,
  (id) => (levelId.value = id),
);
</script>

<style scoped>
.home-plan {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  padding: 1.25rem;
  overflow: hidden;
  border-radius: 1.5rem;
  background: var(--p-content-background);
  box-shadow: inset 0 0 0 1px var(--border-color);
  container: home-plan / inline-size;
}

.home-plan__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  min-width: 0;
}

.home-plan__heading {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex: 1 1 12rem;
  min-width: 0;
  white-space: nowrap;
}

.home-plan__title {
  flex-shrink: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-color);
  cursor: pointer;
}

.home-plan__title:hover {
  text-decoration: underline;
}

.home-plan__summary {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 1rem;
  color: var(--text-secondary-color);
}

.home-plan__summary::before {
  content: '· ';
}

@container home-plan (width < 26rem) {
  .home-plan__heading {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .home-plan__summary {
    max-width: 100%;
    font-size: 0.8125rem;
  }

  .home-plan__summary::before {
    content: none;
  }
}

.home-plan__levels {
  display: flex;
  gap: 0.375rem;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.home-plan__level {
  flex: none;
  height: 2.25rem;
  padding: 0 0.875rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  font-size: 0.875rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s ease;
}

.home-plan__level--active {
  background: var(--text-color);
  color: var(--p-content-background);
}

.home-plan__level:focus-visible,
.home-plan__title:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-plan__stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.home-plan__slot {
  position: absolute;
  transition:
    left 0.3s ease,
    top 0.3s ease,
    width 0.3s ease,
    height 0.3s ease;
}

.home-plan__more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: 2px solid var(--border-color);
  border-radius: 0.875rem;
  background: color-mix(in srgb, var(--text-color) 4%, transparent);
  color: var(--text-secondary-color);
  font-size: 1.25rem;
  font-weight: 600;
  transition: background 0.2s ease;
}

.home-plan__more:hover {
  background: color-mix(in srgb, var(--text-color) 8%, transparent);
}

.home-plan__more:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.home-plan__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 0.875rem;
  color: var(--text-secondary-color);
}
</style>
