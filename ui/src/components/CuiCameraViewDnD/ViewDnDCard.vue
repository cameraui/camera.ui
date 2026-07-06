<template>
  <div ref="boxRef" class="view-dnd-card">
    <template v-if="mode === 'normal' || mode === 'rearrange'">
      <CuiCameraPipCard
        v-if="camera"
        ref="playerRef"
        v-bind="cameraCardProps"
        :activity-mode="cameraCardModels?.activityMode"
        :source-role="cameraCardModels?.sourceRole"
        :streaming-mode="cameraCardModels?.streamingMode"
        :camera-info="camera"
        class="w-full h-full"
        @expand="emit('expand', camera!, $event)"
      />
      <div v-else-if="mode === 'rearrange'" class="w-full h-full bg-[#1a1a1a] flex items-center justify-center">
        <i-mdi:plus class="w-6 h-6 text-white/20" />
      </div>
      <div v-else class="w-full h-full bg-[#111]" />
    </template>

    <template v-else-if="mode === 'edit'">
      <div :ref="editDrop" :style="{ backgroundColor: editBgColor }" class="w-full h-full">
        <div v-if="camera" ref="containerRef" class="w-full h-full flex items-center justify-center relative min-w-0">
          <Button
            class="z-1"
            :class="{
              'cui-icon-lg': showOnlyRemoveIcon,
              'cui-button-small': !showOnlyRemoveIcon,
            }"
            :label="!showOnlyRemoveIcon ? camera.name : undefined"
            @click.prevent="emit('remove', camera!)"
          >
            <template #icon>
              <i-mdi:close />
            </template>
          </Button>
          <CuiCameraSnapshot :camera="camera" class="absolute w-full h-full top-0 left-0 bg-black/50 opacity-20" />
        </div>

        <div v-else-if="!lgBreakpoint" class="w-full h-full flex items-center justify-center">
          <div v-if="!cameras.length" v-tooltip.top="{ value: $t('views.camview.no_cameras') }">
            <Button text rounded disabled class="cui-icon-md">
              <template #icon>
                <i-mdi:plus width="100%" height="100%" />
              </template>
            </Button>
          </div>
          <Button v-else text rounded class="cui-icon-md" @click="menuRef?.toggleMenu">
            <template #icon>
              <i-mdi:plus width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </div>

      <CuiMenu ref="menuRef" :items="menuItems" :popover="{ pt: { content: { class: 'p-0! rounded-xl! overflow-hidden!' } } }" />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { useDrop } from 'vue3-dnd';

import type CuiCameraPipCard from '@/components/CuiCameraPipCard/CuiCameraPipCard.vue';
import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { StreamingRole } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { DropTargetMonitor } from 'vue3-dnd';
import type { ViewDnDCardEmits, ViewDnDCardProps } from './types.js';

const props = defineProps<ViewDnDCardProps>();

const emit = defineEmits<ViewDnDCardEmits>();

const { lgBreakpoint } = useSharedCuiBreakpoint();

const { camera, mode, cameras, droppedCameras } = toRefs(props);

const boxRef = useTemplateRef('boxRef');
const containerRef = useTemplateRef('containerRef');
const playerRef = useTemplateRef<InstanceType<typeof CuiCameraPipCard>>('playerRef');
const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

const { width: containerWidth } = useElementSize(containerRef);

const [editCollect, editDrop] = useDrop({
  accept: 'camera-sidebar',
  drop: props.onDrop,
  collect: (monitor: DropTargetMonitor<DBCamera, void>) => ({
    isOver: monitor.isOver(),
    canDrop: monitor.canDrop() && !camera.value,
  }),
  canDrop: () => mode.value === 'edit' && !camera.value,
});

const isEditActive = computed(() => editCollect.value.canDrop && editCollect.value.isOver);
const editBgColor = computed(() => (mode.value !== 'edit' ? '#000' : isEditActive.value ? '#171717' : '#202020'));
const showOnlyRemoveIcon = computed(() => containerWidth.value <= 200);

const availableCameras = computed<DBCamera[]>(() => cameras.value.filter((c) => !droppedCameras.value.some((d) => d.name === c.name)));
const menuItems = computed<MenuItem[]>(() => availableCameras.value.map((c) => ({ label: c.name, onClick: () => emit('drop', c) })));

function togglePlayerMute(state?: boolean): void {
  playerRef.value?.toggleMute(state);
}

async function toggleMicrophone(state?: boolean, enableSpeaker?: boolean): Promise<void> {
  await playerRef.value?.toggleMicrophone(state, enableSpeaker);
}

function togglePlayerActivityMode(state?: CameraActivityMode): void {
  playerRef.value?.toggleActivityMode(state);
}

async function togglePlayerSourceRole(state?: StreamingRole): Promise<void> {
  await playerRef.value?.toggleSourceRole(state);
}

async function togglePlayerStreamingMode(state?: VideoStreamingMode): Promise<void> {
  await playerRef.value?.toggleStreamingMode(state);
}

function togglePlayerBbox(state?: boolean): void {
  playerRef.value?.toggleBbox(state);
}

function togglePip(state?: boolean): void {
  playerRef.value?.togglePip(state);
}

defineExpose({
  togglePlayerMute,
  toggleMicrophone,
  togglePlayerActivityMode,
  togglePlayerSourceRole,
  togglePlayerStreamingMode,
  togglePlayerBbox,
  togglePip,
});
</script>

<style scoped>
.view-dnd-card {
  width: 100%;
  height: 100%;
  background: #000;
  position: relative;
  overflow: hidden;
}
</style>
