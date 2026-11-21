<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ t('views.sensors.title') }}
    </h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="goBack('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex gap-2 mb-4">
      <IconField class="flex-1">
        <InputIcon>
          <i-carbon:search class="w-4 h-4" />
        </InputIcon>
        <InputText v-model="searchQuery" :placeholder="t('views.sensors.search')" class="w-full" />
      </IconField>

      <Button v-tooltip.left="{ value: t('views.sensors.settings') }" severity="secondary" outlined class="cui-button shrink-0" @click="menuRef?.toggleMenu($event)">
        <template #icon>
          <i-carbon:settings class="w-4.5 h-4.5" />
        </template>
      </Button>

      <CuiMenu
        ref="menuRef"
        :items="menuItems"
        :auto-hide="false"
        :popover="{
          pt: {
            root: { class: 'w-[22rem]' },
            content: {
              class: 'p-0! rounded-xl! overflow-hidden!',
            },
          },
        }"
      />
    </div>

    <div v-if="isLoading" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-16">
      <ProgressSpinner stroke-width="5" class="w-[30px] h-[30px]" />
    </div>

    <div v-else-if="!rows.length && !discoveredRows.length && !isScanning" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-20">
      <i-material-symbols:home-iot-device-outline class="w-12 h-12 text-muted" />
      <span class="text-muted text-sm">{{ sensors.length ? t('views.sensors.no_matches') : t('views.sensors.no_sensors') }}</span>
    </div>

    <div v-else-if="rows.length" class="flex min-h-0 flex-col">
      <span class="card-title">{{ t('views.sensors.adopted_title') }}</span>
      <Card class="cui-card">
        <template #content>
          <CuiDataTable
            v-model:expanded-rows="expandedRows"
            :value="rows"
            data-key="key"
            striped-rows
            :pt="tablePtOptions"
            class="w-full"
            @row-click="(e: DataTableRowClickEvent) => handleRowClick(e.data)"
          >
            <Column v-if="selectionMode" header="" header-class="p-2 pl-4 w-8 max-w-8" class="p-2 pl-4 w-8 max-w-8">
              <template #body="{ data }">
                <Checkbox :model-value="selectedIds.has(data.key)" binary size="small" @click.stop @update:model-value="toggleSelection(data.key)" />
              </template>
            </Column>
            <Column header="" header-class="p-2 pl-4 w-5 max-w-5" class="p-2 pl-4 w-5 max-w-5">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <Badge v-tooltip="{ value: data.stateLabel }" :style="{ background: data.stateColor }" />
                </div>
              </template>
            </Column>
            <Column field="label" :header="t('views.sensors.name')" sortable header-class="p-2" class="p-2 w-[40%] min-w-[180px] max-w-0">
              <template #body="{ data }">
                <div class="flex items-center gap-2 min-w-0">
                  <component
                    :is="sensorTypeIcon(data.sensor.type)"
                    class="w-5 h-5 shrink-0 transition-colors"
                    :class="{ 'text-muted': !isSensorActive(data.sensor) }"
                    :style="isSensorActive(data.sensor) ? ACTIVE_ICON_STYLE : undefined"
                  />
                  <div class="flex items-center gap-2 min-w-0">
                    <span v-tooltip="data.label" class="font-bold text-color truncate">{{ data.label }}</span>
                    <i-mdi:eye-off-outline v-if="!data.exposed" v-tooltip="t('views.sensors.not_exposed')" class="w-4 h-4 shrink-0 text-muted" />
                  </div>
                  <Button
                    v-if="data.device"
                    v-tooltip="expandedRows[data.key] ? t('views.sensors.hide_sensors') : t('views.sensors.show_sensors')"
                    text
                    rounded
                    severity="secondary"
                    class="cui-icon-sm shrink-0"
                    @click.stop="expandedRows = toggleKey(expandedRows, data.key)"
                  >
                    <template #icon>
                      <i-mdi:chevron-down width="100%" height="100%" class="transition-transform" :class="{ 'rotate-180': expandedRows[data.key] }" />
                    </template>
                  </Button>
                </div>
              </template>
            </Column>
            <Column
              field="nativeLabel"
              :header="t('views.sensors.native_id')"
              sortable
              header-class="p-2 whitespace-nowrap cui-col-center"
              class="p-2 w-[28%] min-w-[160px] max-w-0 text-center"
            >
              <template #body="{ data }">
                <span v-if="data.nativeLabel" v-tooltip="data.nativeLabel" class="text-xs text-muted truncate font-mono block">
                  {{ data.nativeLabel }}
                </span>
                <span v-else class="text-xs text-muted">—</span>
              </template>
            </Column>
            <Column
              field="typeLabel"
              :header="t('views.sensors.type')"
              sortable
              header-class="p-2 whitespace-nowrap cui-col-center"
              class="p-2 whitespace-nowrap text-center"
            >
              <template #body="{ data }">
                <span class="text-xs text-muted whitespace-nowrap">{{ data.typeLabel }}</span>
              </template>
            </Column>
            <Column
              field="pluginLabel"
              :header="t('views.sensors.plugin')"
              sortable
              header-class="p-2 whitespace-nowrap cui-col-center"
              class="p-2 whitespace-nowrap text-center"
            >
              <template #body="{ data }">
                <Chip :label="data.pluginLabel" class="text-xs whitespace-nowrap" />
              </template>
            </Column>
            <Column
              field="assignedLabel"
              :header="t('views.sensors.assigned_cameras')"
              sortable
              header-class="p-2 whitespace-nowrap cui-col-center"
              class="p-2 min-w-[140px] text-center"
            >
              <template #body="{ data }">
                <div class="flex items-center justify-center gap-1 min-w-0">
                  <i-mdi:lock-outline
                    v-if="data.sensor.assignmentLocked"
                    v-tooltip="t('views.sensors.assigned_cameras_locked_hint')"
                    class="w-3.5 h-3.5 shrink-0 text-muted"
                  />
                  <span class="text-xs truncate" :class="data.assignedLabel ? 'text-muted' : 'text-muted italic'">
                    {{ data.assignedLabel || t('views.sensors.unassigned') }}
                  </span>
                </div>
              </template>
            </Column>
            <Column header="" header-class="p-2 pr-4 w-28" class="p-2 pr-4 w-28">
              <template #body="{ data }">
                <div class="flex items-center justify-end gap-1">
                  <Button
                    v-if="!data.device"
                    v-tooltip.left="t('views.sensors.history')"
                    text
                    rounded
                    severity="secondary"
                    class="cui-icon-sm shrink-0"
                    @click.stop="openHistoryDialog(data.sensor)"
                  >
                    <template #icon>
                      <i-mdi:history width="100%" height="100%" />
                    </template>
                  </Button>

                  <span v-if="isAdmin" v-tooltip.left="deleteTooltip(data)" class="shrink-0">
                    <Button text rounded severity="danger" class="cui-icon-sm" :disabled="!canDeleteRow(data)" @click.stop="confirmDeleteRow(data)">
                      <template #icon>
                        <i-mdi:trash-can-outline width="100%" height="100%" />
                      </template>
                    </Button>
                  </span>
                </div>
              </template>
            </Column>
            <template #expansion="{ data }">
              <div class="flex flex-col py-1 pl-6">
                <div
                  v-for="member in data.members"
                  :key="member.id"
                  class="flex items-center gap-2 min-w-0 py-1.5 pr-2 cursor-pointer text-sm"
                  @click="handleMemberClick(member)"
                >
                  <Badge v-tooltip="{ value: stateLabel(sensorState(member), member) }" :style="{ background: STATE_COLORS[sensorState(member)] }" />
                  <component
                    :is="sensorTypeIcon(member.type)"
                    class="w-4.5 h-4.5 shrink-0 transition-colors"
                    :class="{ 'text-muted': !isSensorActive(member) }"
                    :style="isSensorActive(member) ? ACTIVE_ICON_STYLE : undefined"
                  />
                  <span v-tooltip="member.displayName" class="font-bold text-color truncate">{{ member.shortName }}</span>
                  <i-mdi:star v-if="member.primary" v-tooltip="t('views.sensors.main_sensor')" class="w-3.5 h-3.5 shrink-0 text-muted" />
                  <i-mdi:eye-off-outline v-if="!member.exposed" v-tooltip="t('views.sensors.not_exposed')" class="w-4 h-4 shrink-0 text-muted" />
                  <span class="ml-auto text-xs text-muted whitespace-nowrap">{{ sensorTypeLabel(member.type) }}</span>
                  <Button
                    v-tooltip.left="t('views.sensors.history')"
                    text
                    rounded
                    severity="secondary"
                    class="cui-icon-sm shrink-0"
                    @click.stop="openHistoryDialog(member)"
                  >
                    <template #icon>
                      <i-mdi:history width="100%" height="100%" />
                    </template>
                  </Button>
                  <Button
                    v-if="isAdmin"
                    v-tooltip.left="t('views.sensors.delete')"
                    text
                    rounded
                    severity="danger"
                    class="cui-icon-sm shrink-0"
                    @click.stop="confirmDelete(member)"
                  >
                    <template #icon>
                      <i-mdi:trash-can-outline width="100%" height="100%" />
                    </template>
                  </Button>
                </div>
              </div>
            </template>
          </CuiDataTable>
        </template>
      </Card>
    </div>

    <div
      v-if="isAdmin && !isLoading"
      class="flex min-h-0 flex-col"
      :class="{
        'mt-6': rows.length,
      }"
    >
      <span class="card-title">{{ t('views.sensors.discovered_title') }}</span>
      <Card class="cui-card">
        <template #content>
          <CuiDataTable
            v-if="discoveredRows.length"
            v-model:expanded-rows="discoveredExpandedRows"
            :value="discoveredRows"
            data-key="key"
            striped-rows
            :pt="tablePtOptions"
            class="w-full"
            :class="{ 'opacity-60 pointer-events-none': isAdopting || discoveredBulkBusy }"
            :row-class="discoveredRowClass"
            @row-click="(e: DataTableRowClickEvent) => handleDiscoveredRowClick(e.data)"
          >
            <Column v-if="discoveredSelectionMode" header="" header-class="p-2 pl-4 w-8 max-w-8" class="p-2 pl-4 w-8 max-w-8">
              <template #body="{ data }">
                <Checkbox :model-value="isDiscoveredRowSelected(data)" binary size="small" @click.stop @update:model-value="toggleDiscoveredRow(data)" />
              </template>
            </Column>
            <Column header="" header-class="p-2 pl-4 w-5 max-w-5" class="p-2 pl-4 w-5 max-w-5">
              <template #body>
                <div class="flex items-center justify-center">
                  <Badge v-tooltip="{ value: t('views.sensors.status_discovered') }" :style="{ background: 'orange' }" />
                </div>
              </template>
            </Column>
            <Column field="name" :header="t('views.sensors.name')" sortable header-class="p-2" class="p-2 w-full min-w-[200px] max-w-0">
              <template #body="{ data }">
                <div class="flex items-center gap-2 min-w-0">
                  <component :is="sensorTypeIcon(data.item.type)" class="w-5 h-5 shrink-0 text-muted" />
                  <div class="flex flex-col min-w-0">
                    <span v-tooltip="data.name" class="font-bold text-color truncate">{{ data.name }}</span>
                    <span v-tooltip="data.detail" class="text-xs text-muted truncate font-mono">{{ data.detail }}</span>
                  </div>
                  <Button
                    v-if="data.items.length > 1"
                    v-tooltip="discoveredExpandedRows[data.key] ? t('views.sensors.hide_sensors') : t('views.sensors.show_sensors')"
                    text
                    rounded
                    severity="secondary"
                    class="cui-icon-sm shrink-0"
                    @click.stop="discoveredExpandedRows = toggleKey(discoveredExpandedRows, data.key)"
                  >
                    <template #icon>
                      <i-mdi:chevron-down width="100%" height="100%" class="transition-transform" :class="{ 'rotate-180': discoveredExpandedRows[data.key] }" />
                    </template>
                  </Button>
                </div>
              </template>
            </Column>
            <Column field="typeLabel" :header="t('views.sensors.type')" sortable header-class="p-2 whitespace-nowrap" class="p-2 whitespace-nowrap">
              <template #body="{ data }">
                <span class="text-xs text-muted whitespace-nowrap">{{ data.typeLabel }}</span>
              </template>
            </Column>
            <Column field="room" :header="t('components.form.label.room')" sortable header-class="p-2 whitespace-nowrap" class="p-2 whitespace-nowrap">
              <template #body="{ data }">
                <Chip v-if="data.room" :label="data.room" class="text-xs whitespace-nowrap" />
              </template>
            </Column>
            <Column field="pluginName" :header="t('views.sensors.plugin')" sortable header-class="p-2 whitespace-nowrap" class="p-2 whitespace-nowrap">
              <template #body="{ data }">
                <Chip :label="data.pluginName" class="text-xs whitespace-nowrap" />
              </template>
            </Column>
            <Column header="" header-class="p-2 pr-4 w-12" class="p-2 pr-4 w-12">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <Button
                    v-tooltip.left="{ value: data.hidden ? t('views.sensors.unhide') : t('views.sensors.hide') }"
                    severity="secondary"
                    text
                    rounded
                    class="cui-icon-md"
                    @click="(e) => toggleHidden(e, data.items, data.hidden)"
                  >
                    <template #icon>
                      <EyeIcon v-if="data.hidden" width="100%" height="100%" class="text-muted" />
                      <EyeOffIcon v-else width="100%" height="100%" class="text-muted" />
                    </template>
                  </Button>
                </div>
              </template>
            </Column>
            <template #expansion="{ data }">
              <div class="flex flex-col py-1 pl-6">
                <div
                  v-for="item in data.items"
                  :key="discoveredKey(item)"
                  class="flex items-center gap-2 min-w-0 py-1.5 pr-2 cursor-pointer text-sm"
                  :class="{ 'opacity-50': sensorsSocket.isHidden(item) }"
                  @click="handleDiscoveredItemClick(item)"
                >
                  <Checkbox
                    v-if="discoveredSelectionMode"
                    :model-value="discoveredSelectedIds.has(discoveredKey(item))"
                    binary
                    size="small"
                    @click.stop
                    @update:model-value="toggleDiscoveredSelection(discoveredKey(item))"
                  />
                  <component :is="sensorTypeIcon(item.type)" class="w-4.5 h-4.5 shrink-0 text-muted" />
                  <span v-tooltip="item.name" class="font-bold text-color truncate">{{ item.name }}</span>
                  <span class="ml-auto text-xs text-muted whitespace-nowrap">{{ sensorTypeLabel(item.type) }}</span>
                </div>
              </div>
            </template>
          </CuiDataTable>
          <div v-else class="flex flex-col items-center justify-center py-6 gap-2">
            <i-svg-spinners:ring-resize v-if="isScanning" width="24px" height="24px" class="text-muted" />
            <i-mdi:radar v-else width="32px" height="32px" class="text-muted" />
            <span class="text-muted text-sm">{{ isScanning ? t('views.sensors.scanning') : t('views.sensors.no_discovered') }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-4">
            <div class="ml-auto"></div>
            <Button
              v-if="hiddenCount > 0"
              severity="secondary"
              class="cui-button-medium"
              :label="showHidden ? t('views.sensors.hide_hidden') : `${t('views.sensors.show_hidden')} (${hiddenCount})`"
              @click="sensorsSocket.toggleShowHidden()"
            />
            <Button severity="secondary" class="cui-button-medium" :label="t('views.sensors.rescan')" :loading="isScanning" @click="handleRescan" />
          </div>
        </template>
      </Card>
    </div>

    <CuiFloatingButtonGroup v-if="isAdmin" :force-visible="selectionMode || discoveredSelectionMode">
      <template v-if="!selectionMode && !discoveredSelectionMode">
        <CuiFloatingButton
          v-if="rows.length"
          :tooltip-props="{ value: t('views.sensors.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="startAdoptedSelection"
        />
        <CuiFloatingButton
          v-if="discoveredRows.length"
          :tooltip-props="{ value: t('views.sensors.select_discovered') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectDiscoveredIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="startDiscoveredSelection"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.sensors.create_virtual') }"
          :button-props="{ class: 'text-white' }"
          :icon="PlusIcon"
          :icon-props="{ width: '30px', height: '30px' }"
          @click="openCreateDialog"
        />
      </template>

      <template v-else-if="selectionMode">
        <CuiFloatingButton
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.sensors.delete_selected') }"
          :button-props="{ severity: 'danger', disabled: !deletableSelected.length || bulkBusy }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkDelete"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitDiscoveredSelectionMode"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: discoveredAllSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleDiscoveredSelectAll"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.sensors.hide_selected') }"
          :button-props="{ severity: 'secondary', disabled: !discoveredSelectedItems.length || discoveredBulkBusy }"
          :icon="EyeOffIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="hideSelected"
        />
        <CuiFloatingButton
          :tooltip-props="{ value: t('views.sensors.adopt_selected') }"
          :button-props="{ class: 'text-white', disabled: !discoveredSelectedItems.length || discoveredBulkBusy }"
          :icon="AdoptIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkAdopt"
        />
      </template>
    </CuiFloatingButtonGroup>
  </div>
</template>

<script lang="ts" setup>
import { useAllSensors } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import CloseIcon from '~icons/mdi/close';
import EyeIcon from '~icons/mdi/eye';
import EyeOffIcon from '~icons/mdi/eye-off';
import SelectDiscoveredIcon from '~icons/mdi/playlist-check';
import AdoptIcon from '~icons/mdi/playlist-plus';
import TrashIcon from '~icons/mdi/trash-can-outline';
import SelectIcon from '~icons/tabler/dots-filled';
import PlusIcon from '~icons/typcn/plus';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { SensorsQuery } from '@/api/routes/sensors.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { sensorTypeIcon } from '@/common/sensorIcons.js';
import { keepUnchangedItems } from '@/common/utils.js';
import { useCardSelection } from '@/composables/useCardSelection.js';
import { sensorProvidedForCamera } from '@/utils/sensorSlots.js';

import type { SensorDeviceEditResult } from '@/components/CuiDialog/templates/SensorDeviceEdit/types.js';
import type { SensorEditResult } from '@/components/CuiDialog/templates/SensorEdit/types.js';
import type { VirtualSensorCreateResult } from '@/components/CuiDialog/templates/VirtualSensorCreate/types.js';
import type { PassThrough } from '@openvue/core';
import type { DiscoveredSensorListItem, SensorsNamespaceEvents, TransformedSensor, TransformedSensorDevice } from '@shared/types';
import type { DataTablePassThroughOptions, DataTableRowClickEvent } from 'openvue';

type SensorState = 'connected' | 'disconnected' | 'unavailable' | 'removed';

interface SensorRow {
  key: string;
  sensor: TransformedSensor;
  device?: TransformedSensorDevice;
  members: TransformedSensor[];
  label: string;
  exposed: boolean;
  typeLabel: string;
  nativeLabel: string;
  pluginLabel: string;
  assignedLabel: string;
  searchText: string;
  state: SensorState;
  stateLabel: string;
  stateColor: string;
}

interface DiscoveredRow {
  key: string;
  item: DiscoveredSensorListItem;
  items: DiscoveredSensorListItem[];
  name: string;
  detail: string;
  typeLabel: string;
  room: string;
  pluginName: string;
  hidden: boolean;
  searchText: string;
}

const SensorEditDialog = asyncComponent(() => import('@/components/CuiDialog/templates/SensorEdit/SensorEdit.vue'));
const SensorDeviceEditDialog = asyncComponent(() => import('@/components/CuiDialog/templates/SensorDeviceEdit/SensorDeviceEdit.vue'));
const SensorHistoryDialog = asyncComponent(() => import('@/components/CuiDialog/templates/SensorHistory/SensorHistory.vue'));
const VirtualSensorCreateDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VirtualSensorCreate/VirtualSensorCreate.vue'));

const STATE_COLORS: Record<SensorState, string> = {
  connected: 'green',
  disconnected: 'gray',
  unavailable: 'orange',
  removed: 'red',
};

const STATE_SEVERITY: SensorState[] = ['removed', 'unavailable', 'disconnected'];

const ACTIVE_ICON_STYLE: Record<string, string> = {
  color: 'rgb(251, 146, 60)',
  filter: 'drop-shadow(0 0 6px rgba(251, 146, 60, 0.6))',
};

const DETECTED_ACTIVE_TYPES: ReadonlySet<string> = new Set([
  SensorType.Motion,
  SensorType.Object,
  SensorType.Audio,
  SensorType.Face,
  SensorType.LicensePlate,
  SensorType.Classifier,
  SensorType.Contact,
  SensorType.Occupancy,
  SensorType.Smoke,
  SensorType.Leak,
  SensorType.Gas,
  SensorType.CarbonMonoxide,
  SensorType.Heat,
  SensorType.Cold,
  SensorType.Vibration,
  SensorType.Tamper,
  SensorType.Problem,
  SensorType.Power,
]);

const sensorsQuery = new SensorsQuery();
const camerasQuery = new CamerasQuery();

const { goBack } = useBackNavigation();
const dialog = useCuiDialog();
const sensorsSocket = useSensorsSocket();
const queryClient = useQueryClient();
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { sensors: liveSensors } = useAllSensors();

const { data: sensorsData, isBusy: isFetchingSensors } = sensorsQuery.getSensorsQuery();
const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { mutateAsync: createVirtualSensor, isPending: isCreating } = sensorsQuery.createVirtualSensorQuery();
const { mutateAsync: patchSensor } = sensorsQuery.patchSensorQuery();
const { mutateAsync: deleteSensor, isPending: isDeleting } = sensorsQuery.deleteSensorQuery();
const { mutateAsync: bulkDeleteSensors } = sensorsQuery.bulkDeleteSensorsQuery();
const { mutateAsync: patchSensorDevice } = sensorsQuery.patchSensorDeviceQuery();
const { mutateAsync: deleteSensorDevice, isPending: isDeletingDevice } = sensorsQuery.deleteSensorDeviceQuery();

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

const menuRef = useTemplateRef('menuRef');

const searchQuery = ref('');
const isAdopting = ref(false);
const expandedRows = ref<Record<string, boolean>>({});
const discoveredExpandedRows = ref<Record<string, boolean>>({});

let stopSourceChanged: (() => void) | undefined;

const isLoading = computed(() => sensorsData.value === undefined && isFetchingSensors.value);

const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const sensors = computed(() => sensorsData.value ?? []);

const cameraBoundCount = computed(() => sensors.value.filter((sensor) => sensor.assignmentLocked).length);

const inactiveCameraBoundCount = computed(() => sensors.value.filter((sensor) => !isEnabledForItsCamera(sensor)).length);

const menuItems = computed(() => [
  {
    key: 'hideAllCameraBound',
    label: t('views.sensors.hide_all_camera_bound'),
    description: t('views.sensors.hide_all_camera_bound_hint'),
    badge: cameraBoundCount.value ? String(cameraBoundCount.value) : undefined,
    toggle: true,
    toggleState: uiSettings.value.sensors.hideAllCameraBound,
    onClick: () => (uiSettings.value.sensors.hideAllCameraBound = !uiSettings.value.sensors.hideAllCameraBound),
  },
  {
    key: 'onlyEnabledCameraBound',
    label: t('views.sensors.only_enabled_camera_bound'),
    description: t('views.sensors.only_enabled_camera_bound_hint'),
    badge: inactiveCameraBoundCount.value ? String(inactiveCameraBoundCount.value) : undefined,
    toggle: true,
    toggleState: uiSettings.value.sensors.onlyEnabledCameraBound,
    onClick: () => (uiSettings.value.sensors.onlyEnabledCameraBound = !uiSettings.value.sensors.onlyEnabledCameraBound),
  },
]);

const cameraOptions = computed(() => (camerasData.value?.result ?? []).map((camera) => ({ label: camera.name, value: camera._id })));

const cameraById = computed(() => new Map((camerasData.value?.result ?? []).map((camera) => [camera._id, camera])));

const liveSensorById = computed(() => new Map(liveSensors.value.map((sensor) => [sensor.id, sensor])));

const allRows = computed<SensorRow[]>((previous) => {
  const next = [...groupBy(sensors.value, (sensor) => (sensor.device ? `device:${sensor.device.id}` : sensor.id))]
    .map(([key, members]) => (members.length > 1 ? deviceRow(key, members) : sensorRow(members[0])))
    .sort((a, b) => a.label.localeCompare(b.label));

  return keepUnchangedItems(previous, next, rowKey);
});

const rows = computed<SensorRow[]>((previous) => {
  const query = searchQuery.value.toLowerCase().trim();

  const next = allRows.value
    .filter((row) => !uiSettings.value.sensors.hideAllCameraBound || !row.sensor.assignmentLocked)
    .filter((row) => !uiSettings.value.sensors.onlyEnabledCameraBound || isEnabledForItsCamera(row.sensor))
    .filter((row) => !query || row.searchText.includes(query));

  return keepUnchangedItems(previous, next, rowKey);
});

const isScanning = computed(() => sensorsSocket.isScanning.value);
const showHidden = computed(() => sensorsSocket.showHidden.value);
const hiddenCount = computed(() => sensorsSocket.hiddenCount.value);

const discoveredRows = computed<DiscoveredRow[]>((previous) => {
  const query = searchQuery.value.toLowerCase().trim();
  const next = [...groupBy(sensorsSocket.sortedSensors.value, (item) => (item.device ? `${item.pluginId}:device:${item.device.id}` : discoveredKey(item)))]
    .map(([key, items]) => discoveredRow(key, items))
    .filter((row) => !query || row.searchText.includes(query));
  return keepUnchangedItems(previous, next, (row) => row.key);
});

const { selectionMode, selectedIds, selectedItems, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  () => rows.value,
  rowKey,
);

const {
  selectionMode: discoveredSelectionMode,
  selectedIds: discoveredSelectedIds,
  selectedItems: discoveredSelectedItems,
  allSelected: discoveredAllSelected,
  bulkBusy: discoveredBulkBusy,
  enterSelectionMode: enterDiscoveredSelectionMode,
  exitSelectionMode: exitDiscoveredSelectionMode,
  toggleSelectAll: toggleDiscoveredSelectAll,
  toggleSelection: toggleDiscoveredSelection,
} = useCardSelection(() => discoveredRows.value.flatMap((row) => row.items), discoveredKey);

const deletableSelected = computed(() => selectedItems.value.flatMap(rowSensors).filter(canDelete));

function rowKey(row: SensorRow): string {
  return row.key;
}

function rowSensors(row: SensorRow): TransformedSensor[] {
  return row.device ? row.members : [row.sensor];
}

function groupBy<T>(list: T[], key: (entry: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const entry of list) {
    const group = groups.get(key(entry));
    if (group) group.push(entry);
    else groups.set(key(entry), [entry]);
  }
  return groups;
}

function sensorTypeLabel(type: string): string {
  return t(`components.camera_options.sensor_type_${type}`);
}

function cameraNames(cameraIds: string[]): string {
  return cameraIds
    .map((id) => cameraById.value.get(id)?.name)
    .filter(Boolean)
    .join(', ');
}

function searchText(values: string[]): string {
  return values.join('\n').toLowerCase();
}

function sensorRow(sensor: TransformedSensor): SensorRow {
  const state = sensorState(sensor);
  const label = sensor.displayName || sensor.name;
  const typeLabel = sensorTypeLabel(sensor.type);
  const nativeLabel = sensor.address ?? sensor.nativeId ?? '';
  const pluginLabel = sensor.virtual ? t('views.sensors.owner_virtual') : sensor.pluginName;
  const assignedLabel = cameraNames(sensor.assignedCameraIds);
  return {
    key: sensor.id,
    sensor,
    members: [],
    label,
    exposed: sensor.exposed,
    typeLabel,
    nativeLabel,
    pluginLabel,
    assignedLabel,
    searchText: searchText([label, typeLabel, nativeLabel, pluginLabel, assignedLabel]),
    state,
    stateLabel: stateLabel(state, sensor),
    stateColor: STATE_COLORS[state],
  };
}

function deviceRow(key: string, members: TransformedSensor[]): SensorRow {
  const sensor = members.find((member) => member.primary) ?? members[0];
  const states = members.map(sensorState);
  const state = STATE_SEVERITY.find((candidate) => states.includes(candidate)) ?? 'connected';
  const label = sensor.device?.name ?? sensor.displayName;
  const typeLabel = t('views.sensors.device_sensors', { count: members.length });
  const assignedLabel = cameraNames([...new Set(members.flatMap((member) => member.assignedCameraIds))]);
  return {
    key,
    sensor,
    device: sensor.device,
    members,
    label,
    exposed: members.some((member) => member.exposed),
    typeLabel,
    nativeLabel: '',
    pluginLabel: sensor.pluginName,
    assignedLabel,
    searchText: searchText([label, typeLabel, sensor.pluginName, assignedLabel, ...members.flatMap((member) => [member.shortName, sensorTypeLabel(member.type)])]),
    state,
    stateLabel: stateLabel(state, sensor),
    stateColor: STATE_COLORS[state],
  };
}

function discoveredRow(key: string, items: DiscoveredSensorListItem[]): DiscoveredRow {
  const item = items.find((entry) => entry.primary) ?? items[0];
  const device = items.length > 1 ? item.device : undefined;
  const name = device?.name ?? item.name;
  const typeLabel = device ? t('views.sensors.device_sensors', { count: items.length }) : sensorTypeLabel(item.type);
  return {
    key,
    item,
    items,
    name,
    detail: device ? (device.model ?? device.id) : (item.address ?? item.id),
    typeLabel,
    room: item.room ?? '',
    pluginName: item.pluginName,
    hidden: items.every((entry) => sensorsSocket.isHidden(entry)),
    searchText: searchText([name, typeLabel, item.pluginName, item.room ?? '', ...items.flatMap((entry) => [entry.name, entry.id])]),
  };
}

function toggleKey(keys: Record<string, boolean>, key: string): Record<string, boolean> {
  const { [key]: open, ...rest } = keys;
  return open ? rest : { ...rest, [key]: true };
}

function discoveredKey(item: DiscoveredSensorListItem): string {
  return `${item.pluginId}:${item.id}`;
}

function isEnabledForItsCamera(sensor: TransformedSensor): boolean {
  if (!sensor.boundCameraId) return true;
  const camera = cameraById.value.get(sensor.boundCameraId);
  if (!camera) return false;
  return sensorProvidedForCamera(sensor, camera);
}

function isConnected(sensor: TransformedSensor): boolean {
  return liveSensorById.value.get(sensor.id)?.connected.value ?? sensor.connected;
}

function sensorState(sensor: TransformedSensor): SensorState {
  if (!isConnected(sensor)) return 'disconnected';
  if (sensor.sourceState === 'removed') return 'removed';
  if (sensor.sourceState === 'unavailable') return 'unavailable';
  return 'connected';
}

function stateLabel(state: SensorState, sensor: TransformedSensor): string {
  switch (state) {
    case 'disconnected':
      return t('views.sensors.disconnected');
    case 'unavailable':
      return t('views.sensors.state_unavailable');
    case 'removed':
      return t('views.sensors.state_removed', { plugin: sensor.pluginName });
    default:
      return t('views.sensors.connected');
  }
}

function startAdoptedSelection() {
  exitDiscoveredSelectionMode();
  enterSelectionMode();
}

function startDiscoveredSelection() {
  exitSelectionMode();
  enterDiscoveredSelectionMode();
}

function discoveredRowClass(row: DiscoveredRow): string | undefined {
  return row.hidden ? 'opacity-50' : undefined;
}

function isDiscoveredRowSelected(row: DiscoveredRow): boolean {
  return row.items.every((item) => discoveredSelectedIds.value.has(discoveredKey(item)));
}

function toggleDiscoveredRow(row: DiscoveredRow) {
  const selected = isDiscoveredRowSelected(row);
  for (const item of row.items) {
    if (discoveredSelectedIds.value.has(discoveredKey(item)) === selected) toggleDiscoveredSelection(discoveredKey(item));
  }
}

function handleDiscoveredRowClick(row: DiscoveredRow) {
  if (discoveredSelectionMode.value) {
    toggleDiscoveredRow(row);
    return;
  }
  if (row.hidden) return;
  if (row.items.length > 1) confirmAdoptDevice(row);
  else confirmAdopt(row.item);
}

function handleDiscoveredItemClick(item: DiscoveredSensorListItem) {
  if (discoveredSelectionMode.value) {
    toggleDiscoveredSelection(discoveredKey(item));
    return;
  }
  if (sensorsSocket.isHidden(item)) return;
  confirmAdopt(item);
}

async function toggleHidden(event: Event, items: DiscoveredSensorListItem[], hidden: boolean) {
  event.stopPropagation();
  const result = hidden ? await sensorsSocket.unhideSensors(items) : await sensorsSocket.hideSensors(items);
  if (!result.success) {
    toast.add({ severity: 'error', summary: t('views.sensors.hide'), detail: result.error, life: 3000 });
  }
}

async function hideSelected() {
  const targets = [...discoveredSelectedItems.value];
  discoveredBulkBusy.value = true;
  try {
    const result = await sensorsSocket.hideSensors(targets);
    if (!result.success) {
      toast.add({ severity: 'error', summary: t('views.sensors.hide_selected'), detail: result.error, life: 3000 });
      return;
    }
    exitDiscoveredSelectionMode();
    toast.add({ severity: 'success', detail: t('views.sensors.hide_selected_done', { count: targets.length }), life: 5000 });
  } finally {
    discoveredBulkBusy.value = false;
  }
}

function confirmAdopt(item: DiscoveredSensorListItem) {
  dialog.openTextDialog({
    data: {
      title: t('views.sensors.adopt_title'),
      contentText: t('views.sensors.adopt_confirm', { name: item.name, plugin: item.pluginName }),
      confirmText: t('components.form.button.add'),
      loading: isAdopting,
    },
    onConfirm: async () => {
      isAdopting.value = true;
      try {
        const result = await sensorsSocket.adoptSensor(item);
        if (!result.success) {
          toast.add({ severity: 'error', summary: t('views.sensors.adopt_title'), detail: result.error, life: 3000 });
          return;
        }
        await queryClient.refetchQueries({ queryKey: ['sensorsList'] });
        toast.add({ severity: 'success', detail: t('views.sensors.adopted', { name: item.name }), life: 3000 });
      } finally {
        isAdopting.value = false;
      }
    },
  });
}

async function handleRescan() {
  const result = await sensorsSocket.forceRescan();
  if (!result.success) {
    toast.add({ severity: 'error', summary: t('views.sensors.rescan'), detail: result.error, life: 3000 });
  }
}

function isSensorActive(sensor: TransformedSensor): boolean {
  const live = liveSensorById.value.get(sensor.id);
  const get = (property: string): unknown => (live ? live.getProperty(property) : (sensor.properties as Record<string, unknown> | undefined)?.[property]);

  switch (sensor.type) {
    case SensorType.Light:
    case SensorType.Switch:
      return !!get('on');
    case SensorType.Siren:
      return !!get('active');
    case SensorType.Doorbell:
      return !!get('ring');
    case SensorType.Garage:
    case SensorType.Lock:
      return get('currentState') === 0;
    case SensorType.SecuritySystem:
      return get('currentState') === 4;
    case SensorType.Battery:
      return !!get('low');
    default:
      return DETECTED_ACTIVE_TYPES.has(String(sensor.type)) && !!get('detected');
  }
}

function canDelete(sensor: TransformedSensor): boolean {
  return sensor.virtual || !sensor.assignmentLocked || !isConnected(sensor);
}

function canDeleteRow(row: SensorRow): boolean {
  return rowSensors(row).every(canDelete);
}

function deleteTooltip(row: SensorRow): string {
  if (row.device) return t('views.sensors.delete_device');
  return canDelete(row.sensor) ? t('views.sensors.delete') : t('views.sensors.delete_camera_bound');
}

function handleRowClick(row: SensorRow) {
  if (selectionMode.value) {
    toggleSelection(row.key);
    return;
  }
  if (!isAdmin.value) return;

  if (row.device) openDeviceDialog(row.device, row);
  else openSensorDialog(row.sensor, row.sensor.device);
}

function handleMemberClick(sensor: TransformedSensor) {
  if (isAdmin.value) openSensorDialog(sensor);
}

function openSensorDialog(sensor: TransformedSensor, device?: TransformedSensorDevice) {
  dialog.openComponentDialog(SensorEditDialog, {
    data: {
      title: sensor.displayName || sensor.name,
      confirmText: t('components.form.button.save'),
      contentProps: {
        sensor,
        device,
        cameraOptions: cameraOptions.value,
      },
    },
    onConfirm: async (result: SensorEditResult | null) => {
      if (!result) return;
      if (!device) {
        await patchSensor({ id: sensor.id, data: result });
        return;
      }
      const { displayName, ...rest } = result;
      await patchSensorDevice({ id: device.id, data: { displayName } });
      await patchSensor({ id: sensor.id, data: rest });
    },
  });
}

function openDeviceDialog(device: TransformedSensorDevice, row: SensorRow) {
  dialog.openComponentDialog(SensorDeviceEditDialog, {
    data: {
      title: row.label,
      confirmText: t('components.form.button.save'),
      contentProps: {
        device,
        sensors: row.members,
        pluginName: row.pluginLabel,
      },
    },
    onConfirm: async (result: SensorDeviceEditResult | null) => {
      if (!result) return;
      await patchSensorDevice({ id: device.id, data: result });
    },
  });
}

function openHistoryDialog(sensor: TransformedSensor) {
  dialog.openComponentDialog(SensorHistoryDialog, {
    data: {
      title: `${sensor.displayName || sensor.name} · ${t('views.sensors.history')}`,
      hideConfirmButton: true,
      contentProps: {
        sensorId: sensor.id,
        sensorType: String(sensor.type),
      },
    },
  });
}

function reportBulk(done: number, failed: string[], doneKey: string): void {
  if (failed.length) {
    toast.add({ severity: 'error', summary: t('views.sensors.bulk_failed', { count: failed.length }), detail: failed.join(', '), life: 8000 });
  }
  if (done) {
    toast.add({ severity: 'success', detail: t(doneKey, { count: done }), life: 5000 });
  }
}

function confirmBulkDelete() {
  const targets = [...deletableSelected.value];
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.sensors.delete_selected_confirm', { count: targets.length }),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      bulkBusy.value = true;
      try {
        const { skipped } = await bulkDeleteSensors({ ids: targets.map((sensor) => sensor.id) });
        const failed = targets.filter((sensor) => skipped.includes(sensor.id)).map((sensor) => sensor.displayName || sensor.name);
        exitSelectionMode();
        reportBulk(targets.length - failed.length, failed, 'views.sensors.delete_selected_done');
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

function confirmBulkAdopt() {
  const targets = [...discoveredSelectedItems.value];
  dialog.openTextDialog({
    data: {
      title: t('views.sensors.adopt_title'),
      contentText: t('views.sensors.adopt_selected_confirm', { count: targets.length }),
      confirmText: t('components.form.button.add'),
    },
    onConfirm: () => adoptItems(targets),
  });
}

function confirmAdoptDevice(row: DiscoveredRow) {
  dialog.openTextDialog({
    data: {
      title: t('views.sensors.adopt_device_title'),
      contentText: t('views.sensors.adopt_device_confirm', { name: row.name, count: row.items.length, plugin: row.pluginName }),
      confirmText: t('components.form.button.add'),
    },
    onConfirm: () => adoptItems(row.items),
  });
}

async function adoptItems(items: DiscoveredSensorListItem[]) {
  discoveredBulkBusy.value = true;
  try {
    const failed: string[] = [];
    for (const item of items) {
      const result = await sensorsSocket.adoptSensor(item);
      if (!result.success) failed.push(item.name);
    }
    await queryClient.refetchQueries({ queryKey: ['sensorsList'] });
    exitDiscoveredSelectionMode();
    reportBulk(items.length - failed.length, failed, 'views.sensors.adopt_selected_done');
  } finally {
    discoveredBulkBusy.value = false;
  }
}

function applySourceChange(event: SensorsNamespaceEvents['sensor:source:changed']) {
  queryClient.setQueryData<TransformedSensor[]>(['sensorsList'], (list) =>
    list?.map((sensor) => (sensor.id === event.sensorId ? { ...sensor, sourceState: event.sourceState, address: event.address } : sensor)),
  );
}

function openCreateDialog() {
  dialog.openComponentDialog(VirtualSensorCreateDialog, {
    data: {
      title: t('views.sensors.create_virtual'),
      confirmText: t('components.form.button.save'),
      loading: isCreating,
      contentProps: {},
    },
    onConfirm: async (result: VirtualSensorCreateResult | null) => {
      if (!result) return;
      await createVirtualSensor({ data: result });
    },
  });
}

function confirmDelete(sensor: TransformedSensor) {
  dialog.openTextDialog({
    data: {
      title: t('views.sensors.delete'),
      contentText: t('views.sensors.delete_confirm'),
      confirmText: t('components.form.button.remove'),
      loading: isDeleting,
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      await deleteSensor({ id: sensor.id });
    },
  });
}

function confirmDeleteRow(row: SensorRow) {
  if (row.device) confirmDeleteDevice(row.device, row.members);
  else confirmDelete(row.sensor);
}

function confirmDeleteDevice(device: TransformedSensorDevice, members: TransformedSensor[]) {
  dialog.openTextDialog({
    data: {
      title: t('views.sensors.delete_device'),
      contentText: t('views.sensors.delete_device_confirm', { names: members.map((member) => member.shortName).join(', ') }),
      confirmText: t('components.form.button.remove'),
      loading: isDeletingDevice,
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      await deleteSensorDevice({ id: device.id });
    },
  });
}

onMounted(() => {
  if (!isAdmin.value) return;
  sensorsSocket.connect();
  stopSourceChanged = sensorsSocket.onSourceChanged(applySourceChange);
});

onUnmounted(() => {
  stopSourceChanged?.();
  if (isAdmin.value) sensorsSocket.unsubscribe();
});
</script>

<style scoped>
:deep(tr) {
  cursor: pointer !important;
}

:deep(.cui-col-center .p-datatable-column-header-content) {
  justify-content: center;
}
</style>
