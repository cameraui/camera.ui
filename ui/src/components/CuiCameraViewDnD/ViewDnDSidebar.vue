<template>
  <div class="sidebar-view-background flex flex-col p-2 border-[1px] border-color gap-2 rounded-xl" :style="{ width: `${SIDEBAR_WIDTH}px` }">
    <span class="text-lg font-semibold text-white">{{ title }}</span>

    <div class="flex flex-col gap-3 w-full h-full overflow-y-auto">
      <Button fluid label="Change grid size" class="cui-button-small dark-mode shrink-0 my-4" @click="emit('changeViewSize')" />

      <label class="cui-label">{{ $t('components.view_box.available_streams') }}</label>
      <div v-for="(camera, index) in cameras" :key="index">
        <ViewDnDDrag :camera="camera" :is-dropped="isDropped(camera)" :can-drag="!isDropped(camera)" />
      </div>
      <span v-if="!cameras.length" class="text-muted text-sm">{{ $t('components.view_box.no_cameras') }}</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { SIDEBAR_WIDTH } from './types.js';

import type { DBCamera } from '@shared/types';
import type { ViewDnDSidebarEmits, ViewDnDSidebarProps } from './types.js';

const props = defineProps<ViewDnDSidebarProps>();

const emit = defineEmits<ViewDnDSidebarEmits>();

const { droppedCameras } = toRefs(props);

function isDropped(camera: DBCamera): boolean {
  return droppedCameras.value.some((c) => c.name === camera.name);
}
</script>
