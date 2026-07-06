<template>
  <Card
    class="cui-card flex-none !w-[175px] !overflow-hidden"
    :style="{ height: typeof height === 'number' ? `${height}px` : height }"
    :pt="{
      body: {
        class: 'h-full flex flex-col p-3',
      },
      content: {
        class: 'flex-1 min-h-0 overflow-hidden',
      },
    }"
  >
    <template #content>
      <div class="h-full overflow-y-auto overflow-x-hidden hide-scrollbar">
        <div class="flex flex-col gap-4">
          <div
            v-for="camera in cameras?.result"
            :key="camera._id"
            class="flex flex-col items-center cursor-pointer p-0.5"
            @click="$router.push(`/cameras/${camera.name}`)"
          >
            <div class="relative w-full rounded-md overflow-hidden" :class="{ 'ring-2 ring-primary-500': camera.name === activeCamera }">
              <CuiCameraSnapshot :camera />
              <span
                class="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/50"
                :class="{
                  'bg-green-500': getCameraStatus(camera._id) === 'connected',
                  'bg-yellow-500': getCameraStatus(camera._id) === 'connecting',
                  'bg-red-500': getCameraStatus(camera._id) === 'error',
                  'bg-gray-400': getCameraStatus(camera._id) === 'idle',
                }"
              ></span>
            </div>
            <span
              class="text-[11px] text-center mt-1 px-1 py-0.5 rounded truncate max-w-full"
              :class="camera.name === activeCamera ? 'bg-primary-500 text-white font-bold' : ''"
            >
              {{ camera.name }}
            </span>
          </div>
        </div>
      </div>
    </template>
  </Card>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type { CuiCameraSidebarProps } from './types.js';

const camerasQuery = new CamerasQuery();

const props = withDefaults(defineProps<CuiCameraSidebarProps>(), {
  height: 'auto',
});

const { getCameraStatus, connect: connectStreamStatus } = useStreamStatus();

const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const { activeCamera, height } = toRefs(props);

connectStreamStatus();
</script>
