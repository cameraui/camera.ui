<template>
  <div class="home-widget" :class="{ 'home-widget--editing': editing }">
    <CuiHomeEvents v-if="entry.kind === 'loading' && entry.widget.kind === 'events'" :cameras="NO_CAMERAS" pending />
    <Skeleton v-else-if="entry.kind === 'loading'" class="home-widget__loading" width="100%" height="100%" />
    <CuiHomeCamera
      v-else-if="entry.kind === 'camera'"
      :camera="entry.camera"
      :cameras="entry.group"
      :fit="entry.widget.fit ?? 'cover'"
      :rotate="entry.widget.rotate"
      :follow="entry.widget.follow"
      :room-names="roomNames"
      :detections
      :activity
      :editing
    />
    <CuiSensorTile v-else-if="entry.kind === 'sensor'" :sensor="entry.sensor" :size="tileSizeFor(size)" :disabled />
    <CuiHomeNotes v-else-if="entry.kind === 'notes'" :tiles="entry.content.tiles" :batteries="entry.content.batteries" :room="entry.room" />
    <CuiHomeLights
      v-else-if="entry.kind === 'lights'"
      :name="t('views.home_dashboard.lights')"
      :sensors="entry.lights"
      :room="entry.room"
      :row="size.h === 1"
      :disabled
    />
    <CuiHomeScene v-else-if="entry.kind === 'automation'" :automation="entry.automation" :row="size.h === 1" />
    <CuiHomeFloorplan v-else-if="entry.kind === 'floorplan'" :level="entry.level" :hidden-rooms="entry.hiddenRooms" />
    <component :is="entry.design.component" v-else-if="entry.kind === 'group' && entry.design" :name="entry.name" :sensors="entry.sensors" :disabled />
    <CuiHomeGroup
      v-else-if="entry.kind === 'group'"
      :name="entry.name"
      :sensors="entry.sensors"
      :own="entry.own"
      :editing
      :disabled
      @update="emit('update', $event)"
      @take="emit('take', $event)"
    />
    <CuiHomeEvents v-else-if="entry.kind === 'events'" :cameras="entry.content.cameras" :room="entry.room" />
    <CuiHomeClock v-else-if="entry.kind === 'clock'" />
    <CuiHomeAction
      v-else-if="entry.kind === 'action' && entry.actions.length === 1"
      :actions="entry.actions"
      :cameras="entry.cameras"
      :place="entry.place"
      :all="entry.all"
      :minutes="entry.widget.minutes ?? HOME_ACTION_MINUTES"
      :row="size.h === 1"
    />
    <CuiHomeActionGroup
      v-else-if="entry.kind === 'action'"
      :actions="entry.actions"
      :cameras="entry.cameras"
      :place="entry.place"
      :all="entry.all"
      :minutes="entry.widget.minutes ?? HOME_ACTION_MINUTES"
    />

    <template v-if="editing">
      <div class="home-widget__shield" />
      <Button rounded severity="secondary" class="home-widget__remove cui-icon-lg" :aria-label="t('views.home_dashboard.remove_widget')" @click="emit('remove')">
        <template #icon>
          <i-mdi:minus />
        </template>
      </Button>
      <div class="home-widget__tools">
        <CuiHomeCameraOptions
          v-if="entry.kind === 'camera'"
          :widget="entry.widget"
          :camera="entry.camera"
          :cameras
          :room-names="roomNames"
          @update="emit('update', $event)"
        />
        <CuiHomeEventsFilter v-if="entry.kind === 'events'" :cameras="entry.content.cameras" />
        <CuiHomeScopeOptions
          v-if="(entry.kind === 'notes' || entry.kind === 'events' || entry.kind === 'action') && scopes.length"
          :scope="entry.scope"
          :pages="scopes"
          @update="emit('update', $event)"
        />
        <CuiHomeActionOptions
          v-if="entry.kind === 'action'"
          :actions="entry.actions"
          :minutes="entry.widget.minutes ?? HOME_ACTION_MINUTES"
          @update="emit('update', $event)"
        />
        <CuiHomeGroupMembers
          v-if="entry.kind === 'group' && entry.own && entry.design"
          :name="entry.widget.name"
          :placeholder="entry.name"
          :sensors="entry.sensors"
          @update="emit('update', $event)"
          @take="emit('take', $event)"
        />
        <Button
          v-if="entry.kind === 'group' && entry.own"
          v-tooltip.top="t('views.home_dashboard.group_dissolve')"
          rounded
          size="small"
          severity="secondary"
          class="home-widget__dissolve"
          :aria-label="t('views.home_dashboard.group_dissolve')"
          @click="emit('dissolve')"
        >
          <template #icon>
            <i-mdi:ungroup />
          </template>
        </Button>
        <Button
          v-if="sizes.length > 1"
          v-tooltip.top="t('views.home_dashboard.change_size')"
          rounded
          size="small"
          severity="secondary"
          class="home-widget__size"
          :label="`${t(`views.home_dashboard.size_${current.label}`)} ${size.w}×${size.h}`"
          @click="emit('resize', next.size)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import CuiSensorTile from '@/components/CuiSensorTile/CuiSensorTile.vue';

import { HOME_ACTION_MINUTES } from './actions.js';
import CuiHomeAction from './CuiHomeAction.vue';
import CuiHomeActionGroup from './CuiHomeActionGroup.vue';
import CuiHomeActionOptions from './CuiHomeActionOptions.vue';
import CuiHomeCamera from './CuiHomeCamera.vue';
import CuiHomeCameraOptions from './CuiHomeCameraOptions.vue';
import CuiHomeClock from './CuiHomeClock.vue';
import CuiHomeEvents from './CuiHomeEvents.vue';
import CuiHomeEventsFilter from './CuiHomeEventsFilter.vue';
import CuiHomeFloorplan from './CuiHomeFloorplan.vue';
import CuiHomeGroup from './CuiHomeGroup.vue';
import CuiHomeGroupMembers from './CuiHomeGroupMembers.vue';
import CuiHomeLights from './CuiHomeLights.vue';
import CuiHomeNotes from './CuiHomeNotes.vue';
import CuiHomeScene from './CuiHomeScene.vue';
import CuiHomeScopeOptions from './CuiHomeScopeOptions.vue';
import { nearestSize, tileSizeFor } from './layout.js';

import type { DBCamera } from '@shared/types';
import type { CuiHomeWidgetEmits, CuiHomeWidgetProps } from './types.js';

const props = defineProps<CuiHomeWidgetProps>();
const emit = defineEmits<CuiHomeWidgetEmits>();

const { t } = useI18n();

const NO_CAMERAS: DBCamera[] = [];

const disabled = !canControlSensors();

const current = computed(() => nearestSize(props.sizes, props.size));
const next = computed(() => props.sizes[(props.sizes.indexOf(current.value) + 1) % props.sizes.length]);
</script>

<style scoped>
.home-widget {
  position: relative;
  height: 100%;
  container: home-widget / size;
}

.home-widget > :deep(.sensor-tile) {
  height: 100%;
}

.home-widget__loading {
  border-radius: 1.5rem;
}

.home-widget :deep(.tile-card) {
  height: 100%;
  min-width: 0;
  aspect-ratio: auto;
}

.home-widget :deep(.tile-panel) {
  height: 100%;
  overflow-y: auto;
}

.home-widget :deep(.tile-card),
.home-widget :deep(.tile-panel),
.home-widget__shield {
  border-radius: 1.5rem;
}

.home-widget__shield {
  position: absolute;
  inset: 0;
  z-index: 2;
  cursor: grab;
}

.home-widget__remove,
.home-widget__tools {
  position: absolute;
  top: 0.5rem;
  z-index: 4;
}

.home-widget__remove {
  left: 0.5rem;
}

.home-widget__tools {
  right: 0.5rem;
  display: flex;
  gap: 0.375rem;
}

.home-widget__remove,
.home-widget__tools :deep(.p-button) {
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
}

.home-widget__size {
  white-space: nowrap;
}
</style>
