<template>
  <div class="flex flex-col">
    <CuiTopbarSlot position="center">
      <div class="flex flex-row items-center justify-center gap-2">
        <InlineSvg :src="getImageUrl('logo_animated.svg')" width="18px" height="18px" title="camera.ui" aria-label="camera.ui" />
        <span class="font-semibold text-xl truncate">camera.ui</span>
      </div>
    </CuiTopbarSlot>

    <div v-if="uiSettings.cameras.showEvents && (isLoading || sortedCameras.length)" class="events-section mb-4">
      <h1 v-if="!smBreakpoint" class="page-title mb-2">
        {{ $t('components.camera_events.title') }}
      </h1>
      <CuiCameraEvents :cameras="cameras?.result" />
    </div>

    <div class="flex flex-col flex-1 overflow-x-hidden">
      <h1 v-if="isLoading || sortedCameras.length" class="page-title">
        {{ $t(`views.cameras.title`) }}
      </h1>

      <Transition name="fade-2" mode="out-in">
        <div v-if="isLoading" key="loading" class="grid w-full gap-2" :style="{ gridTemplateColumns: gridCols }">
          <Skeleton v-for="i in skeletonCount" :key="i" class="aspect-video !h-auto cui-card" />
        </div>

        <div v-else-if="!sortedCameras.length" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4 py-16" key="no-cameras">
          <div class="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center">
            <i-bxs:cctv class="w-8 h-8 text-primary-500" />
          </div>
          <div class="flex flex-col items-center gap-1 max-w-[400px] text-center">
            <span class="text-color font-semibold text-base">{{ $t('views.cameras.no_cameras') }}</span>
            <span class="text-muted text-sm">{{ $t('views.cameras.no_cameras_hint') }}</span>
          </div>
          <Button v-if="isAdmin" class="cui-button-medium mt-2" :label="$t('views.cameras.get_started')" @click="$router.push('/cameras')">
            <template #icon>
              <i-tabler:plus class="w-4 h-4" />
            </template>
          </Button>
        </div>

        <div v-else-if="viewMode === 'default'" key="defaultView">
          <div class="grid w-full gap-1" :style="{ gridTemplateColumns: gridColsFilled }">
            <DndProvider :backend="dndBackend">
              <TransitionGroup name="list">
                <CuiDraggableCameraCard
                  v-for="camera in sortedCameras"
                  :key="camera._id"
                  :camera="camera"
                  :find-card="findCard"
                  :move-card="moveCard"
                  :no-drag="uiSettings.cameras.dragDisabled || selectionMode"
                  :selection-mode="selectionMode"
                  :selected="selectedIds.has(camera._id)"
                  :snapshot-ref="(el: any) => (snapshotRefs[camera.name] = el)"
                  class="shadow-lg rounded-xl transition-transform"
                  view-transition
                  @refresh-snapshot="snapshotRefs[camera.name]?.refresh()"
                  @open-console="openConsoleDialog(camera.name)"
                  @open-settings="drawer.open({ cameraName: camera.name })"
                  @click="onCardClick(camera)"
                />
              </TransitionGroup>
            </DndProvider>
          </div>
        </div>

        <div v-else key="groupedView" class="flex flex-col gap-6">
          <div v-for="group in groupedCameras" :key="group.room">
            <h2 class="text-sm font-semibold text-muted uppercase tracking-wide mb-2">
              {{ group.room === 'Default' ? $t('components.form.label.room_default') : group.room }}
            </h2>
            <div class="grid w-full gap-1" :style="{ gridTemplateColumns: gridColsFilled }">
              <DndProvider :backend="dndBackend">
                <TransitionGroup name="list">
                  <CuiDraggableCameraCard
                    v-for="camera in group.cameras"
                    :key="camera._id"
                    :camera="camera"
                    :find-card="(id) => findGroupCard(group.room, id)"
                    :move-card="(id, atIndex) => moveGroupCard(group.room, id, atIndex)"
                    :no-drag="uiSettings.cameras.dragDisabled || selectionMode"
                    :selection-mode="selectionMode"
                    :selected="selectedIds.has(camera._id)"
                    :snapshot-ref="(el: any) => (snapshotRefs[camera.name] = el)"
                    class="shadow-lg rounded-xl transition-transform"
                    view-transition
                    @refresh-snapshot="snapshotRefs[camera.name]?.refresh()"
                    @open-console="openConsoleDialog(camera.name)"
                    @open-settings="drawer.open({ cameraName: camera.name })"
                    @click="onCardClick(camera)"
                  />
                </TransitionGroup>
              </DndProvider>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <CuiFloatingButtonGroup v-if="sortedCameras.length > 1" :force-visible="selectionMode">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: viewMode === 'default' ? $t('components.form.tooltip.view_grouped') : $t('components.form.tooltip.view_default') }"
          :button-props="{ severity: viewMode === 'default' ? 'secondary' : 'primary' }"
          :icon="viewMode === 'default' ? GridIcon : GroupIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleViewMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: uiSettings.cameras.dragDisabled ? $t('components.form.tooltip.enable_drag') : $t('components.form.tooltip.disable_drag') }"
          :button-props="{ severity: uiSettings.cameras.dragDisabled ? 'secondary' : 'success' }"
          :icon="uiSettings.cameras.dragDisabled ? LockIcon : LockOpenIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="uiSettings.cameras.dragDisabled = !uiSettings.cameras.dragDisabled"
        />
        <CuiFloatingButton
          v-if="isAdmin"
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.select_cameras') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelected ? $t('components.form.tooltip.deselect_all') : $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelectedDisabled ? $t('components.form.tooltip.enable_selected') : $t('components.form.tooltip.disable_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy }"
          :icon="allSelectedDisabled ? VideoOnIcon : VideoOffIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkToggleDisabled"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelectedSnoozed ? $t('components.form.tooltip.unsnooze_selected') : $t('components.form.tooltip.snooze_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy }"
          :icon="SnoozeIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkToggleSnooze"
        />
        <CuiFloatingButton
          v-if="anyNvrCamera"
          grouped
          :tooltip-props="{ value: allSelectedRecording ? $t('components.form.tooltip.recording_off_selected') : $t('components.form.tooltip.recording_on_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedNvrCameras.length || bulkBusy }"
          :icon="allSelectedRecording ? RecordOffIcon : RecordIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkToggleRecording"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.delete_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkDelete"
        />
      </template>
    </CuiFloatingButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import InlineSvg from 'vue-inline-svg';
import { DndProvider } from 'vue3-dnd';
import RecordOffIcon from '~icons/fluent/record-stop-12-filled';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import VideoOnIcon from '~icons/fluent/video-32-filled';
import VideoOffIcon from '~icons/fluent/video-off-32-filled';
import RecordIcon from '~icons/fluent/video-recording-20-filled';
import SelectIcon from '~icons/gis/arrow';
import CloseIcon from '~icons/mdi/close';
import TrashIcon from '~icons/mdi/delete-outline';
import LockIcon from '~icons/mdi/lock';
import LockOpenIcon from '~icons/mdi/lock-open';
import GroupIcon from '~icons/mdi/view-agenda';
import GridIcon from '~icons/mdi/view-grid';
import SnoozeIcon from '~icons/solar/moon-sleep-bold';

import { CamerasQuery, getCameraExtensionConfigFn, patchCameraExtensionConfigFn, patchCameraFn, removeCameraFn } from '@/api/routes/cameras.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { extractErrorMessage, getImageUrl } from '@/common/utils.js';

import type CuiCameraSnapshot from '@/components/CuiCameraSnapshot/CuiCameraSnapshot.vue';
import type { CameraConsoleProps } from '@/components/CuiDialog/templates/CameraConsole/types.js';
import type { DBCamera } from '@shared/types';

interface CameraGroup {
  room: string;
  cameras: DBCamera[];
}

const CameraConsoleDialog = asyncComponent(() => import('@/components/CuiDialog/templates/CameraConsole/CameraConsole.vue'));

const camerasQuery = new CamerasQuery();

const drawer = useCuiCameraDrawer();
const dialog = useCuiDialog();
const toast = useCuiToast();
const queryClient = useQueryClient();
const router = useRouter();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { isTouch } = useSharedCuiUserAgent();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: cameras, isLoading: camerasLoading } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const snapshotRefs = shallowRef<Record<string, InstanceType<typeof CuiCameraSnapshot>>>({});

const isLoading = computed(() => camerasLoading.value);
const isAdmin = computed(() => hasPermission(undefined, 'admin'));
const dndBackend = computed(() => (isTouch.value ? TouchBackend : HTML5Backend));
const viewMode = computed(() => uiSettings.value.cameras.viewMode ?? 'default');
const gridCols = computed(() => `repeat(auto-fill, minmax(${smBreakpoint.value ? '100%' : '300px'}, 1fr))`);
const gridColsFilled = computed(() => {
  const base = gridCols.value;
  return sortedCameras.value.length < 2 ? `${base} 50%` : base;
});

const skeletonCount = computed(() => {
  const cols = smBreakpoint.value ? 1 : Math.max(1, Math.floor(windowWidth.value / 300));
  const cardHeight = ((windowWidth.value / cols) * 9) / 16 + 8;
  const rows = Math.max(1, Math.ceil(windowHeight.value / cardHeight));
  return cols * rows;
});

const sortedCameras = computed<DBCamera[]>(() => {
  if (!cameras.value?.result) return [];
  return sortByOrder(cameras.value.result, uiSettings.value.cameras.order || []);
});

const groupedCameras = computed<CameraGroup[]>(() => {
  if (!cameras.value?.result) return [];
  const groupOrder = uiSettings.value.cameras.groupOrder || {};

  const groups = new Map<string, DBCamera[]>();
  for (const camera of cameras.value.result) {
    const room = camera.room || 'Default';
    if (!groups.has(room)) groups.set(room, []);
    groups.get(room)!.push(camera);
  }

  const result: CameraGroup[] = [];
  for (const [room, cams] of groups) {
    const order = groupOrder[room] || [];
    result.push({ room, cameras: sortByOrder(cams, order) });
  }

  result.sort((a, b) => {
    if (a.room === 'Default') return -1;
    if (b.room === 'Default') return 1;
    return a.room.localeCompare(b.room);
  });

  return result;
});

function sortByOrder(cameraList: DBCamera[], order: string[]): DBCamera[] {
  return [...cameraList].sort((a, b) => {
    const indexA = order.indexOf(a._id);
    const indexB = order.indexOf(b._id);
    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

function toggleViewMode() {
  uiSettings.value.cameras.viewMode = viewMode.value === 'default' ? 'grouped' : 'default';
}

function findCard(id: string) {
  const camera = sortedCameras.value.find((c) => c._id === id);
  return {
    camera,
    index: camera ? sortedCameras.value.indexOf(camera) : -1,
  };
}

function moveCard(id: string, atIndex: number) {
  const { index } = findCard(id);
  if (index === -1 || index === atIndex) return;
  const newOrder = sortedCameras.value.map((c) => c._id);
  const [removed] = newOrder.splice(index, 1);
  newOrder.splice(atIndex, 0, removed);
  uiSettings.value.cameras.order = newOrder;
}

function findGroupCard(room: string, id: string) {
  const group = groupedCameras.value.find((g) => g.room === room);
  if (!group) return { camera: undefined, index: -1 };
  const camera = group.cameras.find((c) => c._id === id);
  return {
    camera,
    index: camera ? group.cameras.indexOf(camera) : -1,
  };
}

function moveGroupCard(room: string, id: string, atIndex: number) {
  const { index } = findGroupCard(room, id);
  if (index === -1 || index === atIndex) return;

  const group = groupedCameras.value.find((g) => g.room === room);
  if (!group) return;

  const newOrder = group.cameras.map((c) => c._id);
  const [removed] = newOrder.splice(index, 1);
  newOrder.splice(atIndex, 0, removed);

  const groupOrder = { ...(uiSettings.value.cameras.groupOrder || {}) };
  groupOrder[room] = newOrder;
  uiSettings.value.cameras.groupOrder = groupOrder;
}

const NVR_PLUGIN_NAME = '@camera.ui/camera-ui-nvr';

const selectionMode = ref(false);
const selectedIds = ref(new Set<string>());
const bulkBusy = ref(false);

// recordingEnabled lives in the NVR plugin's camera storage, not on the
// camera record — fetched lazily per selected camera to aim the toggle
const recordingStates = ref(new Map<string, boolean>());

const selectedCameras = computed(() => sortedCameras.value.filter((camera) => selectedIds.value.has(camera._id)));
const allSelected = computed(() => sortedCameras.value.length > 0 && sortedCameras.value.every((camera) => selectedIds.value.has(camera._id)));
const allSelectedDisabled = computed(() => selectedCameras.value.length > 0 && selectedCameras.value.every((camera) => camera.disabled));
const allSelectedSnoozed = computed(() => selectedCameras.value.length > 0 && selectedCameras.value.every((camera) => camera.detectionSettings?.snooze));

const anyNvrCamera = computed(() => sortedCameras.value.some(hasNvr));
const selectedNvrCameras = computed(() => selectedCameras.value.filter(hasNvr));
const allSelectedRecording = computed(
  () => selectedNvrCameras.value.length > 0 && selectedNvrCameras.value.every((camera) => recordingStates.value.get(camera._id) !== false),
);

watch([selectedIds, selectionMode], () => {
  if (!selectionMode.value) return;
  for (const camera of selectedNvrCameras.value) {
    if (recordingStates.value.has(camera._id)) continue;
    fetchRecordingState(camera);
  }
});

function hasNvr(camera: DBCamera) {
  return camera.plugins.some((plugin) => plugin.name === NVR_PLUGIN_NAME);
}

async function fetchRecordingState(camera: DBCamera) {
  try {
    const config = await getCameraExtensionConfigFn({ cameraname: camera.name, pluginname: NVR_PLUGIN_NAME, signal: new AbortController().signal });
    const next = new Map(recordingStates.value);
    next.set(camera._id, (config.config?.recordingEnabled as boolean | undefined) ?? true);
    recordingStates.value = next;
  } catch {
    // toggle direction falls back to the schema default (recording on)
  }
}

function enterSelectionMode() {
  selectionMode.value = true;
}

function exitSelectionMode() {
  selectionMode.value = false;
  selectedIds.value = new Set();
  recordingStates.value = new Map();
}

function toggleSelectAll() {
  selectedIds.value = allSelected.value ? new Set() : new Set(sortedCameras.value.map((camera) => camera._id));
}

function onCardClick(camera: DBCamera) {
  if (!selectionMode.value) {
    router.push(`/cameras/${camera.name}`);
    return;
  }

  const next = new Set(selectedIds.value);
  if (next.has(camera._id)) {
    next.delete(camera._id);
  } else {
    next.add(camera._id);
  }
  selectedIds.value = next;
}

// Sequential on purpose: every patch triggers a server-side reconfigure of the
// shared config — hammering them in parallel invites write races.
async function runBulk(operation: (camera: DBCamera) => Promise<unknown>, successDetail: string) {
  if (!selectedCameras.value.length || bulkBusy.value) return;

  bulkBusy.value = true;
  try {
    for (const camera of selectedCameras.value) {
      await operation(camera);
    }
    toast.add({ severity: 'success', detail: successDetail, life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 4000 });
  } finally {
    bulkBusy.value = false;
    await queryClient.refetchQueries({ queryKey: ['camerasList'] });
  }
}

async function bulkToggleDisabled() {
  const disabled = !allSelectedDisabled.value;
  await runBulk((camera) => patchCameraFn({ cameraname: camera.name, cameraData: { disabled } }), t('components.toast.camera_updated'));
}

async function bulkToggleSnooze() {
  const snooze = !allSelectedSnoozed.value;
  await runBulk((camera) => patchCameraFn({ cameraname: camera.name, cameraData: { detectionSettings: { snooze } } }), t('components.toast.camera_updated'));
}

async function bulkToggleRecording() {
  const recordingEnabled = !allSelectedRecording.value;
  await runBulk(async (camera) => {
    if (!hasNvr(camera)) return;
    await patchCameraExtensionConfigFn({ cameraname: camera.name, pluginname: NVR_PLUGIN_NAME, configData: { recordingEnabled } });
    const next = new Map(recordingStates.value);
    next.set(camera._id, recordingEnabled);
    recordingStates.value = next;
  }, t('components.toast.camera_updated'));
}

function confirmBulkDelete() {
  if (!selectedCameras.value.length) return;

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('components.dialog.message.confirm_remove_selected', { count: selectedCameras.value.length }),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      await runBulk((camera) => removeCameraFn({ cameraname: camera.name }), t('components.toast.cameras_removed'));
      exitSelectionMode();
    },
  });
}

function openConsoleDialog(cameraName: string) {
  dialog.openComponentDialog<CameraConsoleProps>(CameraConsoleDialog, {
    data: {
      title: t('components.dialog.title.log'),
      confirmText: t('components.form.button.download'),
      loading: isLoading,
      stayActive: true,
      contentProps: {
        cameraName,
      },
      dialogContentClass: 'not-md:px-0 h-full md:h-[50vh]',
    },
  });
}
</script>

<style scoped>
.camera-grid-move {
  -webkit-transition: -webkit-transform 0.3s ease;
  transition: transform 0.3s ease;
}
</style>
