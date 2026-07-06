<template>
  <div class="w-full h-full">
    <CuiDataTable :loading="isLoading" :value="cameras?.result.filter((camera) => !skipCameras?.includes(camera.name))" striped-rows :show-headers="false">
      <template #loading><ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" /></template>

      <Column v-if="activeCamera" header-class="p-2" class="px-4">
        <template #body="{ data: camera }">
          <Badge
            v-if="camera.name === activeCamera"
            :style="{
              background: 'var(--primary-500)',
            }"
          ></Badge>
        </template>
      </Column>

      <Column class="w-[50px] p-0">
        <template #body="{ data: camera }">
          <CuiCameraSnapshot :camera class="rounded-md overflow-hidden" width="50px" />
        </template>
      </Column>

      <Column field="name" :header="$t('components.camera_table.name')" class="w-full p-0 pl-4">
        <template #body="{ data: camera }">
          <div class="w-full h-full cursor-pointer pr-4 py-3" @click="$router.push(`/cameras/${camera.name}`)">{{ camera.name }}</div>
        </template>
      </Column>

      <Column class="p-0 pr-4">
        <template #body="{ data: camera }">
          <div v-tooltip.left="getPartialTooltip(camera._id)" class="flex items-center justify-end">
            <Tag :severity="getStatusSeverity(getCameraStatus(camera._id))" :value="getStatusLabel(getCameraStatus(camera._id))" />
          </div>
        </template>
      </Column>
    </CuiDataTable>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type { PaginationQuery } from '@shared/types';
import type { CuiCameraTableProps } from './types.js';

const cameraQuery = new CamerasQuery();

const props = defineProps<CuiCameraTableProps>();

const { t } = useI18n();
const { getCameraStatus, getCameraSources, connect: connectStreamStatus } = useStreamStatus();

const { skipCameras, activeCamera } = toRefs(props);
const pagination = ref<PaginationQuery>({ page: 1, pageSize: -1 });

const { data: cameras, isBusy: camerasLoading } = cameraQuery.getCamerasQuery(pagination);

const isLoading = computed(() => camerasLoading.value);

function getStatusSeverity(status: StreamStatus): 'success' | 'warn' | 'danger' | 'secondary' | 'contrast' {
  switch (status) {
    case 'connected':
      return 'success';
    case 'connecting':
      return 'warn';
    case 'error':
      return 'danger';
    case 'partial':
      return 'contrast';
    default:
      return 'secondary';
  }
}

function getStatusLabel(status: StreamStatus): string {
  switch (status) {
    case 'connected':
      return t('components.camera_table.online');
    case 'connecting':
      return t('components.camera_table.connecting');
    case 'error':
      return t('components.camera_table.error');
    case 'partial':
      return t('components.camera_table.partial');
    default:
      return t('components.camera_table.idle');
  }
}

function getPartialTooltip(cameraId: string): string | undefined {
  if (getCameraStatus(cameraId) !== 'partial') return undefined;

  const sources = getCameraSources(cameraId);
  if (!sources) return undefined;

  return Object.entries(sources)
    .map(([name, s]) => `${name}: ${getStatusLabel(s)}`)
    .join('\n');
}

connectStreamStatus();
</script>

<style scoped></style>
