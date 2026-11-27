<template>
  <div
    ref="shortcutContainerRef"
    class="shortcut-container min-w-0"
    :class="{
      '!pointer-events-auto': editing && !interactionLocked,
      hidden: !visible,
    }"
    :style="{ cursor: editing && !interactionLocked ? 'pointer' : 'default' }"
    @click.self="makeDraggable"
  >
    <div
      v-for="shortcut in cameraShortcuts"
      v-show="!removingShortcuts.has(shortcut._id)"
      :ref="(el: any) => functionRef(el, shortcut._id)"
      :key="shortcut._id"
      v-element-hover="[(state) => onHover(shortcut._id, state), { delayEnter: 0, delayLeave: 1000 }]"
      v-on-long-press="[
        () => onLongPressCallbackDirective(shortcut),
        {
          distanceThreshold: 24,
          delay: 500,
          onMouseUp: (duration: number, distance: number, isLongPress: boolean) => onMouseUpCallback(isLongPress, shortcut),
        },
      ]"
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
      class="draggable absolute pointer-events-auto camera-shortcut"
      :style="{ background: isHoveringMap[shortcut._id] ? '#545454' : undefined }"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <i-mingcute:computer-camera-fill width="100%" height="100%" />
        </template>
      </Button>

      <Popover
        v-if="mountedPopovers.has(shortcut._id)"
        :ref="(el: any) => previewMenuRef(el, shortcut._id)"
        class="shadow-lg cui-rounded-corner overflow-hidden"
        :pt="{ content: { class: 'p-0' } }"
      >
        <div class="snapshot-hover-container flex items-center justify-center relative">
          <ProgressSpinner v-if="!cameras?.result.find((cam) => cam._id === shortcut.cameraId)" stroke-width="5" class="w-[30px] h-[30px]" />
          <CuiCameraCard
            v-else
            :source-role="isNvrActive ? undefined : 'low-resolution'"
            activity-mode="always-on"
            streaming-mode="auto"
            :camera-info="cameras!.result.find((cam) => cam._id === shortcut.cameraId)!"
            :nvr-controller="isNvrActive ? getOrCreateFollower(shortcut) : undefined"
            :toolbar="false"
            :control="false"
            :subcontrol="false"
            :isolated-stream="true"
            live-indicator-overlay
            class="w-full"
            flat-card
          />
        </div>
      </Popover>
    </div>

    <div
      v-for="resolved in resolvedSensorShortcuts"
      v-show="!removingShortcuts.has(resolved.shortcut._id)"
      :ref="(el: any) => functionRef(el, resolved.shortcut._id)"
      :key="resolved.shortcut._id"
      v-on-long-press="[
        (event: PointerEvent) => onSensorLongPress(resolved.shortcut._id, event),
        {
          distanceThreshold: 24,
          delay: 500,
          onMouseUp: (_duration: number, _distance: number, _isLongPress: boolean, event: PointerEvent) => onSensorMouseUp(resolved.shortcut._id, event),
        },
      ]"
      @pointerdown="delete longPressTriggeredMap[resolved.shortcut._id]"
      @pointerenter="onSensorEnter($event, resolved)"
      @pointerleave="leaveSensorHover"
      @mousedown.stop
      @touchstart.stop
      @wheel.stop
      class="draggable absolute pointer-events-auto sensor-shortcut"
      :class="{ 'sensor-offline': !resolved.isOnline }"
      :style="{ background: hoveredSensor?.shortcut._id === resolved.shortcut._id ? '#545454' : undefined }"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <component
            :is="sensorIcon(resolved.shortcut.sensorType, resolved.sensor)"
            width="100%"
            height="100%"
            :style="sensorTone(resolved.shortcut.sensorType, resolved.sensor)"
          />
        </template>
      </Button>
    </div>

    <Popover ref="sensorHoverRef" :pt="TILE_HOVER_PT" @hide="onSensorHoverHide">
      <div v-if="hoveredSensor" @pointerenter="keepSensorHover" @pointerleave="leaveSensorHover">
        <CuiSensorTile
          v-if="hoveredSensor.sensor"
          :key="hoveredSensor.shortcut._id"
          v-model:expanded="sensorExpanded"
          :sensor="hoveredSensor.sensor"
          size="medium"
          expand-in-place
          :disabled="!canControlSensors"
        >
          <Button severity="secondary" size="small" :label="$t('components.sensor_tile.remove_from_image')" @click="removeSensor(hoveredSensor.shortcut)" />
        </CuiSensorTile>
        <div v-else class="sensor-tooltip">
          <div class="sensor-tooltip-name">{{ $t(`components.camera_options.sensor_type_${hoveredSensor.shortcut.sensorType}`) }}</div>
          <div class="sensor-tooltip-offline text-orange-500">{{ $t('connection.offline') }}</div>
        </div>
      </div>
    </Popover>

    <CuiSensorTileSheet v-if="sheetSensor?.sensor" ref="sensorSheetRef" :key="sheetSensor.shortcut._id" :sensor="sheetSensor.sensor" :disabled="!canControlSensors">
      <Button severity="secondary" size="small" :label="$t('components.sensor_tile.remove_from_image')" @click="removeSensor(sheetSensor.shortcut)" />
    </CuiSensorTileSheet>

    <div
      v-if="placeholderPosition"
      ref="placeholderRef"
      class="draggable absolute pointer-events-auto"
      :style="`left: ${placeholderPosition.x}px; top: ${placeholderPosition.y}px;`"
    >
      <Button severity="secondary" rounded class="cui-icon-lg shadow-sm pointer-events-auto">
        <template #icon>
          <i-lucide:plus width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <Popover
      v-if="editing && !isDragging && !isResizing"
      ref="camerasMenuRef"
      class="shadow-lg cui-rounded-corner"
      :auto-z-index="true"
      append-to="body"
      @show="camerasMenuOpen = true"
      @hide="camerasMenuOpenChange(false)"
    >
      <Tabs v-model:value="addMenuTab" class="shortcut-menu-tabs">
        <TabList :pt="{ content: { class: 'border-b border-color' } }">
          <Tab value="cameras" class="flex items-center gap-2 px-3 py-2">
            <i-mingcute:computer-camera-fill class="w-4 h-4" />
            <span class="text-sm">Cameras</span>
          </Tab>
          <Tab value="sensors" class="flex items-center gap-2 px-3 py-2">
            <i-lucide:settings-2 class="w-4 h-4" />
            <span class="text-sm">Sensors</span>
          </Tab>
        </TabList>

        <TabPanels>
          <TabPanel value="cameras">
            <div class="shortcut-menu">
              <div
                v-for="cam in availableCameras"
                :key="cam._id"
                class="shortcut-menu-item"
                :class="{ 'shortcut-menu-item-disabled': isCameraAlreadyAdded(cam) }"
                @click.prevent="!isCameraAlreadyAdded(cam) && add(cam)"
              >
                <CuiCameraSnapshot :camera="cam" width="100%" :loading="isLoading" />
                <div v-if="isCameraAlreadyAdded(cam)" class="shortcut-menu-item-overlay">
                  <i-lucide:check class="w-6 h-6 text-green-500" />
                </div>
              </div>
              <div v-if="availableCameras.length === 0" class="shortcut-menu-empty">No other cameras available</div>
            </div>
          </TabPanel>

          <TabPanel value="sensors">
            <div class="shortcut-menu-sensors">
              <template v-if="availableSensorsForShortcuts.length > 0">
                <template v-for="(sensor, index) in availableSensorsForShortcuts" :key="sensor.id">
                  <CuiListItem :disabled="isSensorAlreadyAdded(sensor)" @click="!isSensorAlreadyAdded(sensor) && addSensor(sensor)" :button-props="{ class: 'p-0!' }">
                    <template #prepend>
                      <div class="sensor-menu-icon">
                        <component :is="sensorTypeIcon(sensor.type)" class="w-5 h-5" />
                      </div>
                    </template>

                    {{ sensor.displayName.value }}

                    <template #subtitle>
                      {{ $t(`components.camera_options.sensor_type_${sensor.type}`) }}
                    </template>

                    <template v-if="isSensorAlreadyAdded(sensor)" #append>
                      <i-lucide:check class="w-4 h-4 text-green-500" />
                    </template>
                  </CuiListItem>
                  <Divider v-if="index < availableSensorsForShortcuts.length - 1" class="!my-1" />
                </template>
              </template>
              <div v-else class="shortcut-menu-empty">No sensors available</div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { useCameraUi, useSensors } from '@camera.ui/browser';
import { createNvrPlayback, NvrPlaybackKey, playheadUs, useNvrCtx } from '@camera.ui/nvr';
import { SensorType } from '@camera.ui/sdk';
import { vElementHover, vOnLongPress } from '@vueuse/components';
import Draggabilly from 'draggabilly';

import { CamerasQuery, getCameraFn } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import { deepToRaw } from '@/common/utils.js';

import { sensorIcon, sensorTone, sensorTypeIcon } from '@/common/sensorDisplay.js';
import { TILE_HOVER_PT } from '@/components/CuiSensorTile/hover.js';
import { SENSOR_SHORTCUTABLE_TYPES } from './types.js';

import type CuiSensorTileSheet from '@/components/CuiSensorTile/CuiSensorTileSheet.vue';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { NvrPlayback } from '@camera.ui/nvr';
import type { DBCamera, DBCameraShortcut, DBSensorShortcut, DBShortcut, SensorShortcutType } from '@shared/types';
import type { Popover } from 'openvue';
import type { CuiShortcutsProps, ResolvedSensorShortcut } from './types.js';

const camerasQuery = new CamerasQuery();
const usersQuery = new UsersQuery();

const props = defineProps<CuiShortcutsProps>();

const router = useRouter();
const { phoneBreakpoint } = useSharedCuiBreakpoint();

const { cameraName, visible, editing, interactionLocked } = toRefs(props);

const { camera: cameraDevice } = useCameraById(cameraName);
const { sensors: allSensors } = useSensors(cameraDevice);
const cameraUi = useCameraUi();
const nvrCtx = useNvrCtx();
const canControlSensors = hasPermission(undefined, 'admin');
const parentNvr = inject(NvrPlaybackKey, undefined);

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

camerasQuery.toggleQueryActivator('getCamerasQuery', false);

const { data: camera, isBusy: cameraLoading } = camerasQuery.getCameraQuery(cameraName);
const { data: cameras, isBusy: camerasLoading } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: shortcutsList, isBusy: shortcutsLoading } = usersQuery.getShortcutsQuery(user.value?.username || '', cameraName);
const { mutate: patchShortcut, isPending: patchShortcutLoading } = usersQuery.patchShortcutQuery();
const { mutate: addShortcut, isPending: addShortcutLoading } = usersQuery.createShortcutQuery();
const { mutate: removeShortcut, isPending: removeShortcutLoading } = usersQuery.removeShortcutQuery();

const followerControllers = new Map<string, NvrPlayback>();

const placeholderRef = useTemplateRef('placeholderRef');
const shortcutContainerRef = useTemplateRef('shortcutContainerRef');
const camerasMenuRef = useTemplateRef<InstanceType<typeof Popover>>('camerasMenuRef');
const shortcutElementRefs = shallowRef<{ [key: string]: HTMLElement | Element | ComponentPublicInstance }>({});
const previewMenuRefs = shallowRef<{ [key: string]: InstanceType<typeof Popover> | null }>({});
const sensorHoverRef = useTemplateRef<InstanceType<typeof Popover>>('sensorHoverRef');
const sensorSheetRef = useTemplateRef<InstanceType<typeof CuiSensorTileSheet>>('sensorSheetRef');
const draggies = shallowRef<{ [key: string]: Draggabilly }>({});
const draggablePositions = ref<{ [key: string]: { x: number; y: number } }>({});
const isDragging = ref(false);
const placeholderPosition = ref<{ x: number; y: number } | undefined>();
const placeholderActive = ref(false);
const isResizing = ref(false);
const shortcuts = ref<DBShortcut[]>([]);
const isHoveringMap = ref<{ [key: string]: boolean }>({});
const camerasMenuOpen = ref(false);
const addMenuTab = ref<'cameras' | 'sensors'>('cameras');
const longPressTriggeredMap = ref<{ [key: string]: boolean }>({});
const removingShortcuts = ref<Set<string>>(new Set());
const mountedPopovers = ref(new Set<string>());
const hoveredSensorId = ref<string>();
const sheetSensorId = ref<string>();
const sensorExpanded = ref(false);

let sensorHideTimer: ReturnType<typeof setTimeout> | undefined;

const shortcutContainerSize = useElementSize(shortcutContainerRef);

const isNvrActive = computed(() => parentNvr?.isActive.value ?? false);
const cameraShortcuts = computed(() => shortcuts.value.filter((s): s is DBCameraShortcut => s.type === 'camera'));
const sensorShortcuts = computed(() => shortcuts.value.filter((s): s is DBSensorShortcut => s.type === 'sensor'));

const availableSensorsForShortcuts = computed(() => allSensors.value.filter((s) => SENSOR_SHORTCUTABLE_TYPES.has(s.type as SensorShortcutType)));

const resolvedSensorShortcuts = computed<ResolvedSensorShortcut[]>(() => {
  const currentSensors = allSensors.value;
  const list = sensorShortcuts.value;

  return list.map((shortcut) => {
    const sensor = currentSensors.find((s) => s.id === shortcut.sensorId);
    return {
      shortcut,
      sensor,
      isOnline: !!sensor,
    };
  });
});

const hoveredSensor = computed(() => findSensorShortcut(hoveredSensorId.value));
const sheetSensor = computed(() => findSensorShortcut(sheetSensorId.value));

const isLoading = computed(
  () => cameraLoading.value || shortcutsLoading.value || patchShortcutLoading.value || camerasLoading.value || addShortcutLoading.value || removeShortcutLoading.value,
);

const availableCameras = computed(() => {
  if (cameras.value?.result) {
    return cameras.value.result.filter((cam) => cam.name !== cameraName.value);
  }

  return [];
});

const username = computed(() => user.value?.username ?? '');

const activeHoveredShortcut = computed(() => {
  if (!isNvrActive.value) return undefined;
  return cameraShortcuts.value.find((s) => isHoveringMap.value[s._id]);
});

function getOrCreateFollower(shortcut: DBCameraShortcut): NvrPlayback {
  let ctrl = followerControllers.get(shortcut._id);
  if (ctrl) return ctrl;
  ctrl = createNvrPlayback(
    computed(() => shortcut.cameraId),
    { managed: true, sourceRole: 'scrub', cameraUi, nvrCtx },
  );
  followerControllers.set(shortcut._id, ctrl);
  return ctrl;
}

function isSensorAlreadyAdded(sensor: ReactiveSensor): boolean {
  return sensorShortcuts.value.some((shortcut) => shortcut.sensorId === sensor.id);
}

function isCameraAlreadyAdded(cam: DBCamera): boolean {
  return cameraShortcuts.value.some((shortcut) => shortcut.cameraId === cam._id);
}

function mapSensorTypeToShortcutType(type: SensorType): SensorShortcutType {
  const shortcut = String(type) as SensorShortcutType;
  return SENSOR_SHORTCUTABLE_TYPES.has(shortcut) ? shortcut : 'contact';
}

function onHover(id: string, isHovering: boolean): void {
  if (isDragging.value) return;

  camerasQuery.toggleQueryActivator('getCamerasQuery', isHovering);

  isHoveringMap.value[id] = isDragging.value ? false : isHovering;
  mountedPopovers.value.add(id);

  // only on hover in, a delayed leave would close the popover that just opened
  if (isHovering) {
    Object.entries(isHoveringMap.value).forEach(([key, value]) => {
      if (key !== id && value) {
        isHoveringMap.value[key] = false;
      }
    });
  }
}

function onLongPressCallbackDirective(shortcut: DBCameraShortcut): void {
  if (!isDragging.value) {
    longPressTriggeredMap.value[shortcut._id] = true;
    remove(shortcut);
  }
}

function onMouseUpCallback(isLongPress: boolean, shortcut: DBCameraShortcut) {
  if (longPressTriggeredMap.value[shortcut._id]) {
    delete longPressTriggeredMap.value[shortcut._id];
    return;
  }

  if (!isLongPress) {
    if (!isHoveringMap.value[shortcut._id]) {
      onHover(shortcut._id, true);
    } else {
      // read before clearing hover, that stops the preview
      const nvrHandoffTs = isNvrActive.value && parentNvr ? Math.floor(playheadUs(parentNvr) / 1000) : undefined;
      onHover(shortcut._id, false);
      routeCamera(shortcut.cameraId, nvrHandoffTs);
    }
  }
}

function onSensorEnter(event: PointerEvent, resolved: ResolvedSensorShortcut): void {
  if (!usesHoverCard(event) || isDragging.value || sensorExpanded.value) return;
  showSensorHover(resolved);
}

function usesHoverCard(event: PointerEvent): boolean {
  return event.pointerType === 'mouse' && !phoneBreakpoint.value;
}

function keepSensorHover(): void {
  clearTimeout(sensorHideTimer);
}

function leaveSensorHover(): void {
  clearTimeout(sensorHideTimer);
  if (sensorExpanded.value) return;
  sensorHideTimer = setTimeout(() => sensorHoverRef.value?.hide(), 220);
}

function showSensorHover(resolved: ResolvedSensorShortcut): void {
  clearTimeout(sensorHideTimer);
  if (hoveredSensorId.value !== resolved.shortcut._id) sensorExpanded.value = false;
  hoveredSensorId.value = resolved.shortcut._id;
  const target = shortcutElementRefs.value[resolved.shortcut._id] as HTMLElement | undefined;
  if (!target) return;
  sensorHoverRef.value?.show({ currentTarget: target } as unknown as Event);
  // show keeps the old position while the popover is already open for another shortcut
  nextTick(() => sensorHoverRef.value?.alignOverlay());
}

function onSensorHoverHide(): void {
  hoveredSensorId.value = undefined;
  sensorExpanded.value = false;
}

function findSensorShortcut(id: string | undefined): ResolvedSensorShortcut | undefined {
  return resolvedSensorShortcuts.value.find((resolved) => resolved.shortcut._id === id);
}

function onSensorLongPress(id: string, event: PointerEvent): void {
  const resolved = findSensorShortcut(id);
  if (isDragging.value || !resolved) return;
  longPressTriggeredMap.value[id] = true;
  if (resolved.sensor) openSensorLarge(resolved, event);
  else removeSensor(resolved.shortcut);
}

function onSensorMouseUp(id: string, event: PointerEvent): void {
  if (longPressTriggeredMap.value[id]) {
    delete longPressTriggeredMap.value[id];
    return;
  }
  const resolved = findSensorShortcut(id);
  if (isDragging.value || !resolved?.sensor) return;
  openSensorLarge(resolved, event);
}

async function openSensorLarge(resolved: ResolvedSensorShortcut, event: PointerEvent): Promise<void> {
  if (usesHoverCard(event)) {
    showSensorHover(resolved);
    sensorExpanded.value = true;
    return;
  }

  sheetSensorId.value = resolved.shortcut._id;
  await nextTick();
  sensorSheetRef.value?.open({ currentTarget: shortcutElementRefs.value[resolved.shortcut._id] } as unknown as Event);
}

function removeSensor(shortcut: DBSensorShortcut) {
  removingShortcuts.value.add(shortcut._id);

  sensorHoverRef.value?.hide();
  sensorSheetRef.value?.close();

  draggies.value[shortcut._id]?.destroy();
  delete draggies.value[shortcut._id];
  delete draggablePositions.value[shortcut._id];
  delete shortcutElementRefs.value[shortcut._id];

  removeShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutid: shortcut._id,
    },
    {
      onSettled: () => {
        removingShortcuts.value.delete(shortcut._id);
      },
    },
  );
}

function updateDraggablePositions(): void {
  Object.entries(draggies.value).forEach(([shortcutId, draggie]) => {
    const container = shortcutContainerRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const shortcutRect = (draggie as any).element.getBoundingClientRect();

    const xPercent = ((shortcutRect.left - containerRect.left) / containerRect.width) * 100;
    const yPercent = ((shortcutRect.top - containerRect.top) / containerRect.height) * 100;

    draggablePositions.value[shortcutId] = {
      x: Math.max(0, Math.min(xPercent, 100)),
      y: Math.max(0, Math.min(yPercent, 100)),
    };
  });
}

function positionDraggables(): void {
  Object.entries(draggies.value).forEach(([shortcutId, draggie]) => {
    const position = draggablePositions.value[shortcutId];
    if (!position) return;

    const container = shortcutContainerRef.value;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const shortcutRect = (draggie as any).element.getBoundingClientRect();

    const maxX = containerRect.width - shortcutRect.width;
    const maxY = containerRect.height - shortcutRect.height;

    const xPixel = Math.max(0, Math.min((position.x / 100) * containerRect.width, maxX));
    const yPixel = Math.max(0, Math.min((position.y / 100) * containerRect.height, maxY));

    draggie.setPosition(xPixel, yPixel);
  });

  isResizing.value = false;
}

function correctPositionsAfterResize(): void {
  Object.entries(draggablePositions.value).forEach(([shortcutId, position]) => {
    draggablePositions.value[shortcutId] = {
      x: Math.max(0, Math.min(position.x, 100)),
      y: Math.max(0, Math.min(position.y, 100)),
    };
  });
  positionDraggables();
}

function initDraggables(): void {
  for (const [shortcutId, draggie] of Object.entries(draggies.value)) {
    if (!shortcuts.value.find((s) => s._id === shortcutId)) {
      draggie.destroy();
      delete draggies.value[shortcutId];
      delete draggablePositions.value[shortcutId];
    }
  }

  for (const [shortcutId] of Object.entries(draggablePositions.value)) {
    if (!shortcuts.value.find((s) => s._id === shortcutId)) {
      delete draggablePositions.value[shortcutId];
    }
  }

  for (const [shortcutId, element] of Object.entries(shortcutElementRefs.value)) {
    const shortcut = shortcuts.value.find((s) => s._id === shortcutId);

    if (element && shortcut && shortcutContainerRef.value) {
      if (draggies.value[shortcut._id]) {
        draggies.value[shortcut._id].destroy();
      }

      const draggie = new Draggabilly(element as Element, {
        containment: shortcutContainerRef.value as Element,
      });

      // zoomed coordinates would drift the saved %-positions
      if (interactionLocked.value) {
        draggie.disable();
      }

      draggies.value[shortcut._id] = draggie;

      const [xPercent, yPercent] = shortcut.points;
      const containerRect = shortcutContainerRef.value.getBoundingClientRect();

      const xPixel = (xPercent / 100) * containerRect.width;
      const yPixel = (yPercent / 100) * containerRect.height;
      draggie.setPosition(xPixel, yPixel);

      draggablePositions.value[shortcut._id] = { x: xPercent, y: yPercent };

      draggie.on('dragMove', () => {
        isDragging.value = true;
        const popover = previewMenuRefs.value[shortcutId];
        popover?.alignOverlay();
        if (hoveredSensorId.value === shortcutId) sensorHoverRef.value?.alignOverlay();
      });

      draggie.on('dragEnd', () => {
        setTimeout(() => {
          isDragging.value = false;
        }, 50);

        updateDraggablePositions();
        const position = draggablePositions.value[shortcut._id];

        patchShortcut({
          username: username.value,
          cameraname: cameraName.value,
          shortcutid: shortcut._id,
          shortcutData: {
            points: [position.x, position.y],
          },
        });
      });
    }
  }

  positionDraggables();
}

function makeDraggable(e: MouseEvent): void {
  if (!editing.value || !shortcutContainerRef.value) {
    return;
  }

  // zoomed click coordinates don't map to the saved %-space
  if (interactionLocked.value) {
    return;
  }

  placeholderActive.value = true;

  const containerRect = shortcutContainerRef.value.getBoundingClientRect();
  const elementWidth = 35;
  const elementHeight = 35;

  placeholderPosition.value = {
    x: Math.max(0, Math.min(e.clientX - containerRect.left - elementWidth / 2, containerRect.width - elementWidth)),
    y: Math.max(0, Math.min(e.clientY - containerRect.top - elementHeight / 2, containerRect.height - elementHeight)),
  };
}

async function add(cam: DBCamera): Promise<void> {
  if (!placeholderRef.value || !shortcutContainerRef.value) {
    return;
  }

  const container = shortcutContainerRef.value;
  const element = placeholderRef.value;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const xPixel = elementRect.left - containerRect.left;
  const yPixel = elementRect.top - containerRect.top;

  const xPercent = (xPixel / containerRect.width) * 100;
  const yPercent = (yPixel / containerRect.height) * 100;

  addShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutData: {
        _id: '',
        type: 'camera',
        points: [xPercent, yPercent],
        cameraId: cam._id,
      },
    },
    {
      onSettled: () => {
        placeholderActive.value = false;
        placeholderPosition.value = undefined;
        camerasMenuRef.value?.hide();
      },
    },
  );
}

async function addSensor(sensor: ReactiveSensor): Promise<void> {
  if (!placeholderRef.value || !shortcutContainerRef.value) {
    return;
  }

  const container = shortcutContainerRef.value;
  const element = placeholderRef.value;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const xPixel = elementRect.left - containerRect.left;
  const yPixel = elementRect.top - containerRect.top;

  const xPercent = (xPixel / containerRect.width) * 100;
  const yPercent = (yPixel / containerRect.height) * 100;

  addShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutData: {
        _id: '',
        type: 'sensor',
        points: [xPercent, yPercent],
        sensorId: sensor.id,
        sensorType: mapSensorTypeToShortcutType(sensor.type),
      },
    },
    {
      onSettled: () => {
        placeholderActive.value = false;
        placeholderPosition.value = undefined;
        camerasMenuRef.value?.hide();
      },
    },
  );
}

function remove(shortcut: DBCameraShortcut) {
  removingShortcuts.value.add(shortcut._id);

  previewMenuRefs.value[shortcut._id]?.hide();
  isHoveringMap.value[shortcut._id] = false;

  draggies.value[shortcut._id]?.destroy();
  delete draggies.value[shortcut._id];
  delete draggablePositions.value[shortcut._id];
  delete shortcutElementRefs.value[shortcut._id];

  removeShortcut(
    {
      username: username.value,
      cameraname: cameraName.value,
      shortcutid: shortcut._id,
    },
    {
      onSettled: () => {
        removingShortcuts.value.delete(shortcut._id);
      },
    },
  );
}

function functionRef(el: HTMLElement, id: string): void {
  shortcutElementRefs.value[id] = el;
}

function previewMenuRef(el: InstanceType<typeof Popover>, id: string): void {
  previewMenuRefs.value[id] = el;
}

async function routeCamera(cameraId: string, nvrHandoffTs?: number): Promise<void> {
  if (isDragging.value) {
    return;
  }

  const abortController = new AbortController();
  const cam = await getCameraFn({ cameraname: cameraId, signal: abortController.signal });
  const camName = cam.name;

  if (camName) {
    if (nvrHandoffTs !== undefined) {
      router.push({ path: `/cameras/${encodeURIComponent(camName)}`, query: { startTs: String(nvrHandoffTs) } });
    } else {
      router.push(`/cameras/${encodeURIComponent(camName)}`);
    }
  }
}

function camerasMenuOpenChange(state: boolean) {
  if (!state && !placeholderActive.value) {
    placeholderPosition.value = undefined;
  }
  camerasMenuOpen.value = state;
  camerasQuery.toggleQueryActivator('getCamerasQuery', state);
}

watch(
  [shortcutsList, camera],
  () => {
    if (shortcutsList.value && camera.value) {
      shortcuts.value = deepToRaw(shortcutsList.value);
    }
  },
  { immediate: true, deep: true },
);

watch([shortcutContainerSize.width, shortcutContainerSize.height], () => {
  isResizing.value = true;

  nextTick(() => {
    correctPositionsAfterResize();
  });
});

watch(
  shortcuts,
  () => {
    nextTick(() => {
      initDraggables();
    });
  },
  { deep: true, immediate: true },
);

watch(isResizing, (resizing) => {
  if (resizing) {
    placeholderPosition.value = undefined;
  }
});

watch(
  [placeholderRef, placeholderPosition],
  ([el, position]) => {
    if (el && position) {
      // let the DOM update before the popover opens
      setTimeout(() => {
        camerasMenuRef.value?.show({ currentTarget: el } as any);
      }, 50);
    }
  },
  { deep: true },
);

watch(
  isHoveringMap,
  async () => {
    await nextTick();
    Object.entries(isHoveringMap.value).forEach(([key, value]) => {
      if (value && previewMenuRefs.value[key]) {
        const el = shortcutElementRefs.value[key];
        if (el) previewMenuRefs.value[key]?.show({ currentTarget: el } as any);
      } else {
        previewMenuRefs.value[key]?.hide();
      }
    });
  },
  { deep: true },
);

watch(visible, (isVisible) => {
  if (!isVisible) {
    Object.values(previewMenuRefs.value).forEach((p) => p?.hide());
    sensorHoverRef.value?.hide();
    Object.keys(isHoveringMap.value).forEach((key) => {
      isHoveringMap.value[key] = false;
    });
  }
});

watch(editing, (isEditing) => {
  if (!isEditing) {
    placeholderPosition.value = undefined;
    placeholderActive.value = false;
    camerasMenuRef.value?.hide();
  }
});

watch(interactionLocked, (locked) => {
  Object.values(draggies.value).forEach((draggie) => {
    if (locked) {
      draggie.disable();
    } else {
      draggie.enable();
    }
  });
  if (locked) {
    placeholderPosition.value = undefined;
    placeholderActive.value = false;
  }
});

watch(activeHoveredShortcut, (shortcut, oldShortcut) => {
  if (oldShortcut) {
    followerControllers.get(oldShortcut._id)?.stop();
  }
  if (shortcut && parentNvr && isNvrActive.value) {
    const ctrl = getOrCreateFollower(shortcut);
    ctrl.setSpeed(parentNvr.speed.value);
    ctrl.play(playheadUs(parentNvr), true);
  }
});

watch(
  () => parentNvr?.mode.value,
  (mode) => {
    if (!activeHoveredShortcut.value || !parentNvr) return;
    const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
    if (!ctrl) return;
    switch (mode) {
      case 'idle':
        ctrl.stop();
        break;
      case 'play':
        ctrl.play(playheadUs(parentNvr), true);
        break;
      case 'pause':
        ctrl.pause();
        break;
    }
  },
);

watch(
  () => parentNvr?.currentTimestamp.value,
  (ts) => {
    if (!activeHoveredShortcut.value || !parentNvr || !ts) return;
    if (parentNvr.mode.value === 'scrub') {
      const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
      ctrl?.scrub(ts, true);
    }
  },
);

watch(
  () => parentNvr?.speed.value,
  (speed) => {
    if (!activeHoveredShortcut.value || !speed) return;
    const ctrl = followerControllers.get(activeHoveredShortcut.value._id);
    ctrl?.setSpeed(speed);
  },
);

onBeforeUpdate(() => {
  shortcutElementRefs.value = {};
});

onMounted(() => {
  nextTick(() => {
    initDraggables();
  });
});

onUnmounted(() => {
  clearTimeout(sensorHideTimer);
  Object.values(draggies.value).forEach((draggie) => draggie.destroy());
});
</script>

<style scoped>
.shortcut-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  transition: opacity 0.15s ease;
}

.shortcut-container.hidden {
  opacity: 0;
  pointer-events: none;
}

.draggable {
  background: transparent !important;
}

.draggable.is-dragging {
  opacity: 0.7;
}

.snapshot-hover-container {
  width: 250px;
  background: #000;
}

.shortcut-menu {
  width: 100%;
  height: 100%;
  background: var(--background-card);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(1, 1fr);
  gap: 10px;
  padding: 10px;
}

.shortcut-menu-item {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000000;
  border-radius: 4px;
  overflow: hidden;
  cursor: pointer;
  transition: opacity 0.2s ease;
}

.shortcut-menu-item-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.shortcut-menu-item-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.sensor-shortcut {
  transition: opacity 0.2s ease;
}

.sensor-shortcut.sensor-offline {
  opacity: 0.5;
}

.sensor-tooltip {
  text-align: center;
  min-width: 80px;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: var(--p-content-background);
  border: 1px solid var(--border-color);
}

.sensor-tooltip-name {
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 4px;
}

.sensor-tooltip-offline {
  font-size: 0.75rem;
  margin-top: 4px;
}

.shortcut-menu-tabs {
  width: 240px;
}

.shortcut-menu-tabs :deep(.p-tablist-tab-list) {
  background: transparent;
  display: flex;
  width: 100%;
}

.shortcut-menu-tabs :deep(.p-tab) {
  flex: 1;
  justify-content: center;
}

.shortcut-menu-tabs :deep(.p-tabpanels) {
  padding: 0;
  padding-top: 10px;
}

.shortcut-menu-empty {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-secondary);
  padding: 20px 10px;
  font-size: 0.875rem;
}

.shortcut-menu-sensors {
  display: flex;
  flex-direction: column;
  max-height: 200px;
  overflow-y: auto;
  padding: 0px;
}

.sensor-menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-border);
  flex-shrink: 0;
}
</style>
