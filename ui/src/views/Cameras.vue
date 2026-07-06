<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t(`views.${String($route.name).toLowerCase()}.title`) }}
    </h1>

    <div v-if="isLoading" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
      <ProgressSpinner stroke-width="5" class="w-[30px] h-[30px]" />
    </div>

    <div v-if="!isLoading && !sortedDevices.length" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-16">
      <div class="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center">
        <i-bxs:cctv class="w-8 h-8 text-primary-500" />
      </div>
      <div class="flex flex-col items-center gap-1 max-w-[400px] text-center">
        <span class="text-color font-semibold text-base">{{ isScanning ? $t('views.devices.scanning') : $t('views.devices.no_devices') }}</span>
        <span class="text-muted text-sm">{{ isScanning ? $t('views.devices.scanning_hint') : $t('views.devices.no_devices_hint') }}</span>
      </div>
      <Button class="cui-button-medium mt-2" severity="secondary" :label="$t('views.devices.rescan')" :loading="isScanning" @click="handleRescan" />
    </div>

    <div v-if="!isLoading && addedDevices.length" class="flex min-h-0 flex-col">
      <span class="card-title">{{ $t('views.devices.status_adopted_cameras') }}</span>
      <Card class="cui-card">
        <template #content>
          <CuiDataTable :value="addedDevices" striped-rows :pt="tablePtOptions" class="w-full" @row-click="(e: DataTableRowClickEvent) => handleRowClick(e.data)">
            <Column header="" header-class="p-2 pl-4 w-5 max-w-5" class="p-2 pl-4 w-5 max-w-5">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <Badge v-tooltip="{ value: getStatusTooltip(data.status) }" :style="{ background: getStatusColor(data.status) }" />
                </div>
              </template>
            </Column>
            <Column field="name" :header="$t('views.devices.name')" header-class="p-2" class="p-2 w-full min-w-[200px] max-w-0">
              <template #body="{ data }">
                <div class="font-bold text-color truncate">{{ data.name }}</div>
                <div class="text-xs text-muted truncate">{{ data.manufacturer || $t('views.devices.unknown') }} · {{ data.model || $t('views.devices.unknown') }}</div>
                <div v-if="data.errorMessage" class="text-xs text-red-500 truncate">{{ data.errorMessage }}</div>
              </template>
            </Column>
            <Column field="room" :header="$t('components.form.label.room')" header-class="p-2 whitespace-nowrap" class="p-2 whitespace-nowrap">
              <template #body="{ data }">
                <Chip v-if="data.room" :label="data.room === 'Default' ? $t('components.form.label.room_default') : data.room" class="text-xs whitespace-nowrap" />
              </template>
            </Column>
            <Column field="provider" :header="$t('views.devices.provider')" header-class="p-2 pr-4 whitespace-nowrap" class="p-2 pr-4 whitespace-nowrap">
              <template #body="{ data }">
                <Chip :label="data.provider" class="text-xs whitespace-nowrap" />
              </template>
            </Column>
          </CuiDataTable>
        </template>
      </Card>
    </div>

    <div
      v-if="!isLoading && sortedDevices.length"
      class="flex min-h-0 flex-col"
      :class="{
        'mt-6': addedDevices.length,
      }"
    >
      <span class="card-title">{{ $t('views.devices.status_discovered') }}</span>
      <Card class="cui-card">
        <template #content>
          <template v-if="discoveredDevices.length">
            <div class="flex flex-col gap-6">
              <CuiDataTable
                :value="discoveredDevices"
                striped-rows
                :pt="tablePtOptions"
                class="w-full"
                @row-click="(e: DataTableRowClickEvent) => handleRowClick(e.data)"
              >
                <Column header="" header-class="p-2 pl-4 w-5 max-w-5" class="p-2 pl-4 w-5 max-w-5">
                  <template #body="{ data }">
                    <div class="flex items-center justify-center">
                      <Badge v-tooltip="{ value: getStatusTooltip(data.status) }" :style="{ background: getStatusColor(data.status) }" />
                    </div>
                  </template>
                </Column>
                <Column field="name" :header="$t('views.devices.name')" header-class="p-2" class="p-2 w-full min-w-[200px] max-w-0">
                  <template #body="{ data }">
                    <div :class="['font-bold text-color truncate', getRowClass(data)]">{{ data.name }}</div>
                    <div :class="['text-xs text-muted truncate', getRowClass(data)]">
                      {{ data.manufacturer || $t('views.devices.unknown') }} · {{ data.model || $t('views.devices.unknown') }}
                    </div>
                  </template>
                </Column>
                <Column field="provider" :header="$t('views.devices.provider')" header-class="p-2 whitespace-nowrap" class="p-2 whitespace-nowrap">
                  <template #body="{ data }">
                    <Chip :label="data.provider" :class="['text-xs whitespace-nowrap', getRowClass(data)]" />
                  </template>
                </Column>
                <Column header="" header-class="p-2 pr-4 w-12" class="p-2 pr-4 w-12">
                  <template #body="{ data }">
                    <div class="flex items-center justify-center">
                      <Button
                        v-if="!isDeviceHidden(data)"
                        v-tooltip.left="{ value: $t('views.devices.hide') }"
                        severity="secondary"
                        text
                        rounded
                        class="cui-icon-md"
                        @click="(e) => handleHideDevice(e, data)"
                      >
                        <template #icon>
                          <EyeOffIcon width="100%" height="100%" class="text-muted" />
                        </template>
                      </Button>
                      <Button v-else v-tooltip.left="{ value: $t('views.devices.unhide') }" text rounded class="cui-icon-md" @click="(e) => handleUnhideDevice(e, data)">
                        <template #icon>
                          <EyeIcon width="100%" height="100%" class="text-muted" />
                        </template>
                      </Button>
                    </div>
                  </template>
                </Column>
              </CuiDataTable>
            </div>
          </template>
          <div v-else class="flex flex-col items-center justify-center py-6 gap-2">
            <i-svg-spinners:ring-resize v-if="isScanning" width="24px" height="24px" class="text-muted" />
            <i-mdi:radar v-else width="32px" height="32px" class="text-muted" />
            <span class="text-muted text-sm">{{ isScanning ? $t('views.devices.scanning') : $t('views.devices.no_discovered') }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-4">
            <div class="ml-auto"></div>
            <Button
              v-if="hiddenCount > 0 && discoveredDevices.length"
              severity="secondary"
              class="cui-button-medium"
              :label="showHidden ? $t('views.devices.hide_hidden') : `${$t('views.devices.show_hidden')} (${hiddenCount})`"
              @click="handleToggleShowHidden"
            />
            <Button severity="secondary" class="cui-button-medium" :label="$t('views.devices.rescan')" :loading="isScanning" @click="handleRescan" />
          </div>
        </template>
      </Card>
    </div>

    <CuiFloatingButton
      v-if="hasPermission(undefined, 'admin')"
      :tooltip-props="{ value: $t('views.cameras.add_camera') }"
      :button-props="{ class: 'text-white' }"
      :icon="PlusIcon"
      :icon-props="{ width: '30px', height: '30px' }"
      @click="openAddCameraDialog"
    />
  </div>
</template>

<script setup lang="ts">
import EyeIcon from '~icons/mdi/eye';
import EyeOffIcon from '~icons/mdi/eye-off';
import PlusIcon from '~icons/typcn/plus';

import AddCameraDialog from '@/components/CuiDialog/templates/AddCamera/AddCamera.vue';
import ConfirmCameraDialog from '@/components/CuiDialog/templates/ConfirmCamera/ConfirmCamera.vue';
import ConnectionSchemaDialog from '@/components/CuiDialog/templates/ConnectionSchema/ConnectionSchema.vue';

import type { ConfirmCameraProps } from '@/components/CuiDialog/templates/ConfirmCamera/types.js';
import type { ConnectionSchemaProps } from '@/components/CuiDialog/templates/ConnectionSchema/types.js';
import type { PassThrough } from '@primevue/core';
import type { DBCamera, DeviceListItem, DeviceStatus } from '@shared/types';
import type { DataTablePassThroughOptions, DataTableRowClickEvent } from 'primevue';

const { t } = useI18n();
const toast = useCuiToast();
const dialog = useCuiDialog();
const drawer = useCuiCameraDrawer();
const { smBreakpoint } = useSharedCuiBreakpoint();

const camerasSocket = useCamerasSocket();

const tablePtOptions: PassThrough<DataTablePassThroughOptions> = {
  bodyRow: {
    class: 'text-sm text-secondary',
  },
  column: {
    columnTitle: {
      class: 'text-sm',
    },
  },
  datatable: {
    class: 'z-0',
  },
};

const sortedDevices = computed(() => camerasSocket.sortedDevices.value);
const addedDevices = computed(() => sortedDevices.value.filter((d) => d.type === 'camera'));
const discoveredDevices = computed(() => sortedDevices.value.filter((d) => d.type === 'discovered'));
const isLoading = computed(() => camerasSocket.isLoading.value);
const isScanning = computed(() => camerasSocket.isScanning.value);
const hiddenDevices = computed(() => camerasSocket.hiddenDevices.value);
const showHidden = computed(() => camerasSocket.showHidden.value);
const hiddenCount = computed(() => hiddenDevices.value.length);

function getStatusColor(status: DeviceStatus): string {
  switch (status) {
    case 'added':
      return 'green';
    case 'discovered':
      return 'orange';
    case 'adopting':
      return 'orange';
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

function getStatusTooltip(status: DeviceStatus): string {
  switch (status) {
    case 'added':
      return t('views.devices.status_added');
    case 'discovered':
      return t('views.devices.status_discovered');
    case 'adopting':
      return t('views.devices.status_adopting');
    case 'error':
      return t('views.devices.status_error');
    default:
      return t('views.devices.status_unknown');
  }
}

function isDeviceHidden(device: DeviceListItem): boolean {
  return camerasSocket.isHidden(device);
}

async function handleRowClick(device: DeviceListItem) {
  if (isDeviceHidden(device)) return;

  if (device.type === 'camera') {
    drawer.open({ cameraName: device.name });
    return;
  }

  if (device.type === 'discovered' && device.discoveredId) {
    if (device.status === 'adopting') {
      return;
    }

    try {
      const result = await camerasSocket.getConnectionSchema(device.discoveredId);

      if (!result.success) {
        toast.add({
          severity: 'error',
          summary: t('views.devices.connect'),
          detail: result.error,
          life: 3000,
        });
        return;
      }

      dialog.openComponentDialog<ConnectionSchemaProps>(ConnectionSchemaDialog, {
        data: {
          title: `${t('views.devices.connect')}: ${device.name}`,
          confirmText: t('views.devices.connect'),
          contentProps: {
            camera: {
              id: device.discoveredId,
              name: device.name,
              model: device.model,
              provider: device.provider,
              connectionStatus: 'idle',
            },
            schema: result.schema ?? [],
            onConnect: async (credentials: Record<string, unknown>) => {
              const draft = await camerasSocket.prepareDevice(device.discoveredId!, credentials);
              openConfirmCameraDialog(draft, device.discoveredId!);
            },
          },
        },
      });
    } catch (error: unknown) {
      toast.add({
        severity: 'error',
        summary: t('views.devices.connect'),
        detail: error,
        life: 3000,
      });
    }
  }
}

function openConfirmCameraDialog(draft: DBCamera, discoveredId: string) {
  dialog.openComponentDialog<ConfirmCameraProps>(ConfirmCameraDialog, {
    data: {
      title: t('views.devices.confirm_title'),
      confirmText: t('views.devices.confirm'),
      fullscreen: true,
      contentProps: {
        draft,
        onConfirm: async (editedDraft: DBCamera) => {
          await camerasSocket.confirmDevice(editedDraft, discoveredId);
          toast.add({
            severity: 'success',
            summary: t('views.devices.connect'),
            detail: t('components.toast.camera_added'),
            life: 3000,
          });
        },
      },
    },
  });
}

async function handleRescan() {
  try {
    const result = await camerasSocket.forceRescan();
    if (result.success) {
      toast.add({
        severity: 'success',
        summary: t('views.devices.rescan'),
        detail: t('views.devices.rescan_success'),
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: t('views.devices.rescan'),
        detail: result.error,
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('views.devices.rescan'),
      detail: error,
      life: 3000,
    });
  }
}

function openAddCameraDialog() {
  dialog.openComponentDialog(AddCameraDialog, {
    data: {
      title: t('components.dialog.components.new_camera.add_camera'),
      fullscreen: true,
      contentProps: {},
    },
  });
}

async function handleHideDevice(event: Event, device: DeviceListItem) {
  event.stopPropagation();
  try {
    const result = await camerasSocket.hideDevice(device);
    if (result.success) {
      toast.add({
        severity: 'success',
        summary: t('views.devices.hide'),
        detail: t('views.devices.device_hidden'),
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: t('views.devices.hide'),
        detail: result.error,
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('views.devices.hide'),
      detail: error,
      life: 3000,
    });
  }
}

async function handleUnhideDevice(event: Event, device: DeviceListItem) {
  event.stopPropagation();
  try {
    const result = await camerasSocket.unhideDevice(device.discoveredId!);
    if (result.success) {
      toast.add({
        severity: 'success',
        summary: t('views.devices.unhide'),
        detail: t('views.devices.device_unhidden'),
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'error',
        summary: t('views.devices.unhide'),
        detail: result.error,
        life: 3000,
      });
    }
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('views.devices.unhide'),
      detail: error,
      life: 3000,
    });
  }
}

function handleToggleShowHidden() {
  camerasSocket.toggleShowHidden();
}

function getRowClass(device: DeviceListItem): string {
  if (isDeviceHidden(device)) {
    return 'opacity-50 cursor-not-allowed';
  }
  return '';
}

onMounted(() => {
  camerasSocket.connect();
});

onUnmounted(() => {
  camerasSocket.unsubscribe();
});
</script>

<style scoped>
:deep(tr) {
  cursor: pointer !important;
}
</style>
