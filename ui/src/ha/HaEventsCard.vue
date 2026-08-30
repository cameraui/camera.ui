<template>
  <div class="p-2">
    <CuiCameraEvents :cameras="selected" />
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';
import CuiCameraEvents from '@/components/CuiCameraEvents/CuiCameraEvents.vue';
import { cameraAttributes } from './types.js';

import type { HaEventsCardConfig, HomeAssistant } from './types.js';

const props = defineProps<{
  hass: HomeAssistant;
  config: HaEventsCardConfig;
  entryId: string;
}>();

const camerasQuery = new CamerasQuery();
const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const selected = computed(() => {
  const all = cameras.value?.result ?? [];
  const names = (props.config.entities ?? []).map((entity) => cameraAttributes(props.hass, entity).camera_name).filter((name): name is string => !!name);
  if (!names.length) return all;
  return all.filter((camera) => names.includes(camera.name));
});
</script>
