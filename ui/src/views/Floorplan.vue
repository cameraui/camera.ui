<template>
  <div class="h-full w-full relative overflow-hidden flex flex-col">
    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex items-center gap-2 px-3 py-2 border-bottom-color card-background min-h-[48px]">
      <Button
        severity="secondary"
        text
        class="cui-button-medium shrink-0"
        :label="currentLevel?.name ?? $t('views.floorplan.no_levels')"
        :disabled="!levels.length"
        @click="(event) => levelMenuRef?.toggleMenu(event)"
      >
        <template #icon>
          <i-mdi:layers-outline />
        </template>
      </Button>

      <div class="flex-1" />

      <template v-if="isAdmin">
        <Button
          v-tooltip.bottom="{ value: $t('views.floorplan.level_down') }"
          severity="secondary"
          text
          rounded
          class="cui-icon-md shrink-0"
          :disabled="levelIndex < 1"
          @click="moveLevel(-1)"
        >
          <template #icon>
            <i-mdi:chevron-down width="100%" height="100%" />
          </template>
        </Button>

        <Button
          v-tooltip.bottom="{ value: $t('views.floorplan.level_up') }"
          severity="secondary"
          text
          rounded
          class="cui-icon-md shrink-0"
          :disabled="levelIndex < 0 || levelIndex >= levels.length - 1"
          @click="moveLevel(1)"
        >
          <template #icon>
            <i-mdi:chevron-up width="100%" height="100%" />
          </template>
        </Button>

        <Divider layout="vertical" class="floorplan-divider" />

        <Button
          v-tooltip.bottom="{ value: $t('views.floorplan.remove_level') }"
          severity="secondary"
          text
          rounded
          class="cui-icon-md shrink-0"
          :disabled="!levels.length"
          @click="removeLevel"
        >
          <template #icon>
            <i-mdi:trash-can-outline width="100%" height="100%" />
          </template>
        </Button>

        <Button
          v-tooltip.bottom="{ value: $t('views.floorplan.rename_level') }"
          severity="secondary"
          text
          rounded
          class="cui-icon-md shrink-0"
          :disabled="!levels.length"
          @click="renameLevel"
        >
          <template #icon>
            <i-mdi:pencil-outline width="100%" height="100%" />
          </template>
        </Button>

        <Button v-tooltip.bottom="{ value: $t('views.floorplan.add_level') }" severity="secondary" text rounded class="cui-icon-md shrink-0" @click="addLevel">
          <template #icon>
            <i-mdi:plus width="100%" height="100%" />
          </template>
        </Button>
      </template>
    </div>

    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div v-else class="flex flex-1 min-h-0">
      <CuiFloorplanPalette
        v-if="isAdmin && !smBreakpoint"
        :cameras="unplacedCameras"
        :sensors="unplacedSensors"
        :rooms="undrawnRooms"
        :disabled="!levels.length"
        class="w-[240px] shrink-0"
        @pick="onPalettePick"
      />

      <CuiFloorplanCanvas
        :mobile="smBreakpoint"
        :bottom-inset="smBreakpoint && selection ? Math.max(sheetHeight - sheetOffset, 0) : 0"
        :bottom-inset-dragging="sheetDragging"
        :levels="levels"
        :rooms="rooms"
        :connections="connections"
        :cameras="cameras"
        :sensors="sensors"
        :level-id="levelId"
        :selection="selection"
        :read-only="!isAdmin"
        :north="north"
        class="flex-1 min-w-0"
        @select="selection = $event"
        @history="pushHistory()"
        @create-connection="onCreateConnection"
        @drop="onDropItem"
        @update-north="north = $event"
        @request-stairs="onRequestStairs"
        @hover-camera="onHoverCamera"
        @move-room="onMoveRoom"
        @resize-room="onResizeRoom"
        @settle-room="onSettleRoom"
        @move-camera="onMoveCamera"
        @move-sensor="onMoveSensor"
        @hover-sensor="onHoverSensor"
        @rotate-camera="onRotateCamera"
        @move-connection="onMoveConnection"
        @resize-connection="onResizeConnection"
      />

      <div v-if="!smBreakpoint" class="shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out" :style="{ width: selection ? '300px' : '0px' }">
        <CuiFloorplanInspector
          v-if="selection"
          :rooms="rooms"
          :connections="connections"
          :cameras="cameras"
          :sensors="sensors"
          :levels="levels"
          :selection="selection"
          :read-only="!isAdmin"
          class="w-[300px]"
          @close="selection = null"
          @update-room="onUpdateRoom"
          @update-camera="onUpdateCamera"
          @update-sensor="onUpdateSensor"
          @update-connection="onUpdateConnection"
          @remove="onRemove"
        />
      </div>
    </div>

    <div
      v-if="smBreakpoint && selection"
      ref="sheetRef"
      class="fixed inset-x-0 z-[16] rounded-t-xl overflow-hidden shadow-lg border-top-color card-background"
      :style="{
        bottom: `calc(${bottombarHeight}px + var(--safe-area-inset-bottom))`,
        transform: `translateY(${sheetOffset}px)`,
        transition: sheetDragging ? 'none' : 'transform 0.2s ease-in-out',
      }"
    >
      <div class="flex justify-center py-2 cursor-grab active:cursor-grabbing sheet-grip" @pointerdown="startSheetDrag">
        <div class="w-10 h-1 rounded-full sheet-grip-bar" />
      </div>

      <CuiFloorplanInspector
        :rooms="rooms"
        :connections="connections"
        :cameras="cameras"
        :sensors="sensors"
        :levels="levels"
        :selection="selection"
        :read-only="!isAdmin"
        fluid
        class="max-h-[55vh]"
        @close="selection = null"
        @update-room="onUpdateRoom"
        @update-camera="onUpdateCamera"
        @update-sensor="onUpdateSensor"
        @update-connection="onUpdateConnection"
        @remove="onRemove"
      />
    </div>

    <SpeedDial
      v-if="isAdmin && !loading"
      :model="speedDialItems"
      direction="up"
      :transition-delay="80"
      :tooltip-options="{ position: 'left', event: undefined }"
      :style="{
        position: 'fixed',
        zIndex: 15,
        bottom: `calc(${bottombarHeight}px + ${hasChanges ? '4.25rem' : '1.25rem'} + var(--safe-area-inset-bottom))`,
        right: fabRight || 'calc(1.25rem + var(--safe-area-inset-right))',
        transition: 'right 0.2s ease-in-out, bottom 0.2s ease-in-out',
      }"
      :pt="{ root: { style: 'pointer-events: none' } }"
    >
      <template #button="{ visible, toggleCallback }">
        <Button rounded severity="secondary" class="pointer-events-auto" @click="toggleCallback">
          <template #icon>
            <div class="relative w-6 h-6">
              <div
                class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{ 'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': visible }"
                :style="{ backgroundColor: 'var(--text-color)' }"
              />
              <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
                :class="{ 'opacity-0 scale-0': visible }"
                :style="{ backgroundColor: 'var(--text-color)' }"
              />
              <div
                class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
                :class="{ 'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': visible }"
                :style="{ backgroundColor: 'var(--text-color)' }"
              />
            </div>
          </template>
        </Button>
      </template>
      <template #item="{ item, toggleCallback }">
        <Button v-tooltip="{ value: item.label }" severity="secondary" v-bind="item.buttonProps" rounded class="pointer-events-auto" @click="toggleCallback">
          <template #icon>
            <component :is="item.icon" />
          </template>
        </Button>
      </template>
    </SpeedDial>

    <Button
      v-if="isAdmin && hasChanges"
      v-tooltip="{ value: $t('views.floorplan.save') }"
      rounded
      severity="success"
      class="text-white"
      :loading="saving"
      :style="{
        position: 'fixed',
        zIndex: 15,
        bottom: `calc(${bottombarHeight}px + ${Math.max(sheetHeight - sheetOffset, 0)}px + 1.25rem + var(--safe-area-inset-bottom))`,
        right: fabRight || 'calc(1.25rem + var(--safe-area-inset-right))',
        transition: sheetDragging ? 'right 0.2s ease-in-out' : 'right 0.2s ease-in-out, bottom 0.2s ease-in-out',
      }"
      @click="onSave"
    >
      <template #icon>
        <i-carbon:save class="w-5 h-5" />
      </template>
    </Button>

    <Button
      v-if="isAdmin && smBreakpoint && !loading"
      v-tooltip="{ value: $t('views.floorplan.palette') }"
      rounded
      class="pointer-events-auto text-white"
      :style="{
        position: 'fixed',
        zIndex: 15,
        bottom: `calc(${bottombarHeight}px + 1.25rem + var(--safe-area-inset-bottom))`,
        right: 'calc(4.75rem + var(--safe-area-inset-right))',
      }"
      @click="showMobilePalette = true"
    >
      <template #icon>
        <i-mdi:plus class="w-5 h-5" />
      </template>
    </Button>

    <CuiBottomSheet v-model="showMobilePalette" :title="$t('views.floorplan.palette')" max-height="70vh">
      <CuiFloorplanPalette :cameras="unplacedCameras" :sensors="unplacedSensors" :rooms="undrawnRooms" :disabled="!levels.length" mode="click" @pick="onMobilePick" />
    </CuiBottomSheet>

    <div ref="menuAnchorRef" class="fixed w-0 h-0" :style="{ left: `${menuAnchor.x}px`, top: `${menuAnchor.y}px` }" />

    <div ref="previewAnchorRef" class="fixed w-0 h-0" :style="{ left: `${previewAnchor.x}px`, top: `${previewAnchor.y}px` }" />

    <div ref="sensorAnchorRef" class="fixed w-0 h-0" :style="{ left: `${sensorAnchor.x}px`, top: `${sensorAnchor.y}px` }" />

    <Popover ref="sensorPopoverRef" class="shadow-lg cui-rounded-corner" :pt="{ content: { class: 'p-3' } }">
      <div v-if="hoveredSensor" class="w-[220px] flex flex-col gap-3" @pointerenter="keepSensorPopover" @pointerleave="hideSensorPopover">
        <div class="flex items-center gap-2.5">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 palette-icon">
            <component :is="sensorIcon(hoveredSensor.sensorType, liveSensorOf(hoveredSensor.id))" class="w-4 h-4" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-sm font-semibold truncate text-color">{{ hoveredSensor.name }}</div>
            <div v-if="hoveredSensor.owner" class="text-[11px] text-muted truncate">{{ hoveredSensor.owner }}</div>
            <div class="text-xs text-muted truncate">{{ sensorStateText(hoveredSensor.sensorType, liveSensorOf(hoveredSensor.id)) }}</div>
          </div>
        </div>

        <div v-if="hoveredSensor.note" class="text-xs text-muted">{{ hoveredSensor.note }}</div>

        <div v-if="hoveredSensor.sensorType === 'securitySystem'" class="flex flex-col gap-1">
          <Button
            v-for="state in SECURITY_STATES"
            :key="state.value"
            severity="secondary"
            :outlined="securityState(liveSensorOf(hoveredSensor.id)) !== state.value"
            size="small"
            class="cui-button-medium"
            :label="$t(state.labelKey)"
            @click="onSetSecurity(hoveredSensor!.id, state.value)"
          />
        </div>

        <Button
          v-else-if="isControllable(hoveredSensor.sensorType)"
          severity="secondary"
          size="small"
          class="cui-button-medium"
          :label="$t('views.floorplan.sensor_toggle')"
          @click="onToggleSensor(hoveredSensor!.id)"
        />
      </div>
    </Popover>

    <Popover ref="previewRef" class="shadow-lg cui-rounded-corner overflow-hidden" :pt="{ content: { class: 'p-0' } }">
      <div class="w-[280px] flex flex-col" @pointerenter="keepPreview" @pointerleave="hidePreview">
        <div class="flex items-center justify-center">
          <CuiCameraCard
            v-if="previewCamera"
            :camera-info="previewCamera"
            source-role="low-resolution"
            streaming-mode="auto"
            :toolbar="false"
            :control="false"
            :subcontrol="false"
            :isolated-stream="true"
            live-indicator-overlay
            class="w-full"
            flat-card
          />
        </div>
        <div v-if="previewCamera" class="flex items-center gap-2 pl-3 pr-2 py-1.5">
          <span class="flex-1 min-w-0 text-sm font-semibold truncate text-color">{{ previewCamera.name }}</span>
          <Button
            v-tooltip.top="{ value: $t('views.floorplan.open_camera') }"
            severity="secondary"
            text
            class="cui-button p-1.5"
            @click="$router.push(`/cameras/${previewCamera.name}`)"
          >
            <template #icon>
              <i-mdi:open-in-new class="w-4 h-4" />
            </template>
          </Button>
        </div>
      </div>
    </Popover>

    <CuiMenu
      ref="stairsMenuRef"
      :items="stairsMenuItems"
      max-height="320px"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />

    <CuiMenu
      ref="levelMenuRef"
      :items="levelMenuItems"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import CleanIcon from '~icons/carbon/clean';
import RedoIcon from '~icons/carbon/redo';
import UndoIcon from '~icons/carbon/undo';
import LayersIcon from '~icons/mdi/layers-outline';
import RevertIcon from '~icons/mdi/restore';
import StairsIcon from '~icons/mdi/stairs';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { getFloorPlan, putFloorPlan } from '@/api/routes/floorplan.js';
import { getRooms } from '@/api/routes/rooms.js';
import { useAllSensors } from '@camera.ui/browser';
import { SecuritySystemState } from '@camera.ui/sdk';

import { extractErrorMessage } from '@/common/utils.js';
import FloorplanLevelDialog from '@/components/CuiDialog/templates/FloorplanLevel/FloorplanLevel.vue';
import { passageOn, sharedWall } from '@/components/CuiFloorplan/utils.js';
import { securityState, sensorIcon, sensorStateText, setSecurityState, toggleSensor } from '@/components/CuiSensors/display.js';
import { SENSOR_READONLY_TYPES, SENSOR_SHORTCUTABLE_TYPES } from '@/components/CuiShortcuts/types.js';

import type { FloorplanLevelProps } from '@/components/CuiDialog/templates/FloorplanLevel/types.js';
import { FLOORPLAN_DOOR_WIDTH } from '@/components/CuiFloorplan/types.js';

import type { FloorplanCamera, FloorplanConnection, FloorplanLevel, FloorplanRoom, FloorplanSelection, FloorplanSensor } from '@/components/CuiFloorplan/types.js';
import type { Wall } from '@/components/CuiFloorplan/utils.js';
import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { DBFloorPlan, DBRoomCatalog, PutFloorPlanInput, SensorShortcutType } from '@shared/types';
import type { Popover } from 'primevue';

interface PlanDrop {
  kind: 'room' | 'camera' | 'sensor';
  cameraId?: string;
  sensorId?: string;
  sensorType?: string;
  roomId?: string;
  x: number;
  y: number;
}

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { bottombarHeight } = useSharedCuiStates();
const dialog = useCuiDialog();
const toast = useCuiToast();
const router = useRouter();
const floorplanSocket = useFloorplanSocket();

const camerasQuery = new CamerasQuery();
const { sensors: liveSensors } = useAllSensors();
const { data: cameraList } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const levelMenuRef = ref<InstanceType<typeof CuiMenu>>();
const stairsMenuRef = ref<InstanceType<typeof CuiMenu>>();
const stairsSource = ref<string | null>(null);
const menuAnchorRef = ref<HTMLElement | null>(null);
const menuAnchor = ref({ x: 0, y: 0 });
const previewAnchorRef = ref<HTMLElement | null>(null);
const previewAnchor = ref({ x: 0, y: 0 });
const previewRef = ref<InstanceType<typeof Popover>>();
const sensorAnchorRef = ref<HTMLElement | null>(null);
const sensorAnchor = ref({ x: 0, y: 0 });
const sensorPopoverRef = ref<InstanceType<typeof Popover>>();
const hoveredSensorId = ref<string | null>(null);
const previewCameraId = ref<string | null>(null);

const catalog = ref<DBRoomCatalog>({ version: 0, updatedAt: 0, levels: [], rooms: [] });
const levels = ref<FloorplanLevel[]>([]);
const rooms = ref<FloorplanRoom[]>([]);
const connections = ref<FloorplanConnection[]>([]);
const cameras = ref<FloorplanCamera[]>([]);
const sensors = ref<FloorplanSensor[]>([]);
const levelId = ref('');
const north = ref<number | null>(null);
const selection = ref<FloorplanSelection | null>(null);
const showMobilePalette = ref(false);
const loading = ref(true);
const saving = ref(false);
const savedPlan = ref('');

const sheetRef = useTemplateRef<HTMLElement>('sheetRef');
const sheetHeight = ref(0);
const sheetOffset = ref(0);
const sheetDragging = ref(false);

const undoStack = shallowRef<string[]>([]);
const redoStack = shallowRef<string[]>([]);

const SECURITY_STATES = [
  { value: SecuritySystemState.Disarmed, labelKey: 'views.floorplan.security_disarmed' },
  { value: SecuritySystemState.StayArm, labelKey: 'views.floorplan.security_stay' },
  { value: SecuritySystemState.AwayArm, labelKey: 'views.floorplan.security_away' },
  { value: SecuritySystemState.NightArm, labelKey: 'views.floorplan.security_night' },
];

const MAX_HISTORY = 50;
const SHEET_PEEK = 92;

let lastPushAt = 0;
let leaveConfirmed = false;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let sensorHideTimer: ReturnType<typeof setTimeout> | undefined;
let sheetObserver: ResizeObserver | undefined;

const isAdmin = hasPermission(undefined, 'admin');

const sheetParked = computed(() => Math.max(sheetHeight.value - SHEET_PEEK, 0));

const canUndo = computed(() => undoStack.value.length > 0);
const canRedo = computed(() => redoStack.value.length > 0);

const previewCamera = computed(() => (cameraList.value?.result ?? []).find((camera) => camera._id === previewCameraId.value));

const currentLevel = computed(() => levels.value.find((level) => level.id === levelId.value));

const hasChanges = computed(() => snapshot() !== savedPlan.value);

const cameraNames = computed(() => new Map((cameraList.value?.result ?? []).map((camera) => [camera._id, camera.name])));

const placeableSensors = computed(() => liveSensors.value.filter((sensor: ReactiveSensor) => SENSOR_SHORTCUTABLE_TYPES.has(String(sensor.type) as SensorShortcutType)));

const sensorNames = computed(
  () => new Map(placeableSensors.value.map((sensor: ReactiveSensor) => [sensor.id, { name: sensorLabelOf(sensor), owner: sensorOwners(sensor) }])),
);

const unplacedSensors = computed(() => {
  const placed = new Set(sensors.value.map((sensor) => sensor.id));
  return placeableSensors.value
    .filter((sensor: ReactiveSensor) => !placed.has(sensor.id))
    .map((sensor: ReactiveSensor) => ({
      id: sensor.id,
      name: sensorLabelOf(sensor),
      subtitle: sensorOwners(sensor),
      sensorType: String(sensor.type),
    }));
});

const undrawnRooms = computed(() => {
  const drawn = new Set(rooms.value.map((room) => room.roomId));
  return catalog.value.rooms.filter((room) => !drawn.has(room.id)).map((room) => ({ id: room.id, name: room.name }));
});

const unplacedCameras = computed(() => {
  const placed = new Set(cameras.value.map((camera) => camera.id));
  return (cameraList.value?.result ?? []).filter((camera) => !placed.has(camera._id)).map((camera) => ({ id: camera._id, name: camera.name }));
});

const fabRight = computed(() => (smBreakpoint.value || !selection.value ? undefined : 'calc(300px + 1.25rem + var(--safe-area-inset-right))'));

const levelIndex = computed(() => levels.value.findIndex((level) => level.id === levelId.value));

const levelMenuItems = computed<MenuItem[]>(() =>
  [...levels.value].reverse().map((level) => ({
    key: level.id,
    label: level.name,
    icon: markRaw(LayersIcon),
    active: level.id === levelId.value,
    onClick: () => (levelId.value = level.id),
  })),
);

const speedDialItems = computed(() => [
  { label: t('views.floorplan.undo'), icon: UndoIcon, buttonProps: { disabled: !canUndo.value }, command: undo },
  { label: t('views.floorplan.redo'), icon: RedoIcon, buttonProps: { disabled: !canRedo.value }, command: redo },
  { label: t('views.floorplan.clear_level'), icon: CleanIcon, buttonProps: { disabled: !levels.value.length }, command: clearLevel },
  { label: t('views.floorplan.revert'), icon: RevertIcon, buttonProps: { disabled: !hasChanges.value }, command: revert },
]);

const stairsMenuItems = computed<MenuItem[]>(() => {
  const source = rooms.value.find((room) => room.roomId === stairsSource.value);
  if (!source) return [];

  const connected = new Set(connections.value.flatMap((connection) => [connection.fromRoomId, connection.toRoomId].join('|')));
  const seen = new Set<string>();

  return rooms.value
    .filter((room) => {
      if (room.levelId === source.levelId || seen.has(room.roomId)) return false;
      if (connected.has([source.roomId, room.roomId].join('|')) || connected.has([room.roomId, source.roomId].join('|'))) return false;
      seen.add(room.roomId);
      return true;
    })
    .map((room) => ({
      key: room.roomId,
      label: room.name,
      description: levels.value.find((level) => level.id === room.levelId)?.name,
      icon: markRaw(StairsIcon),
      onClick: () => onCreateConnection({ fromRoomId: source.roomId, toRoomId: room.roomId }),
    }));
});

const levelCenter = computed(() => {
  const levelRooms = rooms.value.filter((room) => room.levelId === levelId.value);
  if (!levelRooms.length) return { x: 0, y: 0 };
  const minX = Math.min(...levelRooms.map((room) => room.x));
  const minY = Math.min(...levelRooms.map((room) => room.y));
  const maxX = Math.max(...levelRooms.map((room) => room.x + room.width));
  const maxY = Math.max(...levelRooms.map((room) => room.y + room.height));
  return { x: Math.round((minX + maxX) / 2), y: Math.round((minY + maxY) / 2) };
});

function sensorLabelOf(sensor: ReactiveSensor): string {
  return sensor.displayName.value || sensor.name;
}

function sensorOwners(sensor: ReactiveSensor): string {
  const names = sensor.assignedCameraIds.value.map((id) => cameraNames.value.get(id)).filter(Boolean);
  return names.join(', ');
}

function snapshot(): string {
  return JSON.stringify(toPayload());
}

function toPayload(): PutFloorPlanInput {
  return {
    catalogVersion: catalog.value.version,
    north: north.value,
    levels: levels.value.map((level, index) => ({ id: level.id, name: level.name, order: index })),
    rooms: rooms.value.map((room) => ({
      id: room.id,
      roomId: room.roomId,
      name: room.name,
      note: room.note,
      publicSpace: room.publicSpace,
      levelId: room.levelId,
      outdoor: room.outdoor,
      x: room.x,
      y: room.y,
      width: room.width,
      height: room.height,
    })),
    connections: connections.value.map((connection) => ({ ...connection })),
    sensors: sensors.value.map((sensor) => ({
      sensorId: sensor.id,
      sensorType: sensor.sensorType,
      roomId: sensor.roomId,
      connectionId: sensor.connectionId,
      note: sensor.note,
      x: sensor.x,
      y: sensor.y,
    })),
    cameras: cameras.value.map((camera) => ({
      cameraId: camera.id,
      roomId: camera.roomId,
      note: camera.note,
      x: camera.x,
      y: camera.y,
      rotation: camera.rotation,
      fov: camera.fov,
      range: camera.range,
    })),
  };
}

function fromPayload(payload: PutFloorPlanInput): void {
  north.value = payload.north;
  levels.value = payload.levels.map((level) => ({ id: level.id, name: level.name }));
  rooms.value = payload.rooms.map((room) => ({ ...room }));

  const levelOf = new Map(rooms.value.map((room) => [room.roomId, room.levelId]));
  connections.value = payload.connections.map((connection) => anchorConnection({ ...connection }));
  cameras.value = payload.cameras.map((camera) => ({
    id: camera.cameraId,
    name: cameraNames.value.get(camera.cameraId) ?? camera.cameraId,
    levelId: levelOf.get(camera.roomId) ?? '',
    roomId: camera.roomId,
    note: camera.note ?? '',
    x: camera.x,
    y: camera.y,
    rotation: camera.rotation,
    fov: camera.fov,
    range: camera.range,
  }));

  sensors.value = payload.sensors.map((sensor) => ({
    id: sensor.sensorId,
    name: sensorNames.value.get(sensor.sensorId)?.name ?? sensor.sensorId,
    owner: sensorNames.value.get(sensor.sensorId)?.owner ?? '',
    sensorType: sensor.sensorType,
    levelId: levelOf.get(sensor.roomId) ?? '',
    roomId: sensor.roomId,
    connectionId: sensor.connectionId,
    note: sensor.note ?? '',
    x: sensor.x,
    y: sensor.y,
  }));

  if (!levels.value.some((level) => level.id === levelId.value)) {
    levelId.value = levels.value[0]?.id ?? '';
  }
  selection.value = null;
}

function applyPlan(plan: DBFloorPlan, rooms: DBRoomCatalog): void {
  catalog.value = rooms;
  const byId = new Map(rooms.rooms.map((room) => [room.id, room]));

  fromPayload({
    catalogVersion: rooms.version,
    north: plan.north,
    levels: [...rooms.levels].sort((a, b) => a.order - b.order),
    rooms: plan.rooms.flatMap((shape) => {
      const room = byId.get(shape.roomId);
      if (!room?.levelId) return [];
      return [
        {
          id: shape.id,
          roomId: room.id,
          name: room.name,
          note: room.note ?? '',
          levelId: room.levelId,
          outdoor: room.outdoor,
          publicSpace: room.publicSpace ?? false,
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        },
      ];
    }),
    connections: plan.connections,
    cameras: plan.cameras,
    sensors: plan.sensors ?? [],
  });
  savedPlan.value = snapshot();
  undoStack.value = [];
  redoStack.value = [];
}

function pushHistory(coalesce = false): void {
  const now = Date.now();
  if (coalesce && now - lastPushAt < 600) return;

  lastPushAt = now;
  const stack = [...undoStack.value, snapshot()];
  if (stack.length > MAX_HISTORY) stack.shift();
  undoStack.value = stack;
  redoStack.value = [];
}

function undo(): void {
  const stack = [...undoStack.value];
  const previous = stack.pop();
  if (!previous) return;

  redoStack.value = [...redoStack.value, snapshot()];
  undoStack.value = stack;
  lastPushAt = 0;
  fromPayload(JSON.parse(previous) as PutFloorPlanInput);
}

function redo(): void {
  const stack = [...redoStack.value];
  const next = stack.pop();
  if (!next) return;

  undoStack.value = [...undoStack.value, snapshot()];
  redoStack.value = stack;
  lastPushAt = 0;
  fromPayload(JSON.parse(next) as PutFloorPlanInput);
}

function findRoom(id: string): FloorplanRoom | undefined {
  return rooms.value.find((room) => room.id === id);
}

function anchorConnection(connection: FloorplanConnection): FloorplanConnection {
  connection.width ||= FLOORPLAN_DOOR_WIDTH;
  connection.offset ??= null;
  connection.note ??= '';

  if (connection.fromShapeId && connection.toShapeId) return connection;

  const fromParts = rooms.value.filter((room) => room.roomId === connection.fromRoomId);
  const toParts = rooms.value.filter((room) => room.roomId === connection.toRoomId);

  for (const from of fromParts) {
    for (const to of toParts) {
      if (!sharedWall(from, to)) continue;
      return { ...connection, fromShapeId: from.id, toShapeId: to.id };
    }
  }

  return { ...connection, fromShapeId: fromParts[0]?.id ?? null, toShapeId: toParts[0]?.id ?? null };
}

function partsOf(roomId: string): FloorplanRoom[] {
  return rooms.value.filter((room) => room.roomId === roomId);
}

function onSettleRoom(id: string): void {
  const part = findRoom(id);
  if (!part) return;

  const siblings = partsOf(part.roomId).filter((other) => other.id !== part.id);
  if (!siblings.length || siblings.some((other) => sharedWall(part, other))) return;

  const taken = new Set(rooms.value.map((room) => room.name.toLowerCase()));
  let name = part.name;
  for (let suffix = 2; taken.has(name.toLowerCase()); suffix++) name = `${part.name} ${suffix}`;

  const roomId = crypto.randomUUID();
  for (const camera of cameras.value) {
    if (camera.roomId === part.roomId && contains(part, camera)) camera.roomId = roomId;
  }
  Object.assign(part, { roomId, name });

  toast.add({ severity: 'info', detail: t('views.floorplan.room_detached', { name }), life: 4000 });
}

function joinRoom(part: FloorplanRoom, roomId: string): void {
  const target = partsOf(roomId)[0];
  if (!target) return;

  const previous = part.roomId;
  Object.assign(part, { roomId, name: target.name, note: target.note, levelId: target.levelId, outdoor: target.outdoor, publicSpace: target.publicSpace });

  for (const camera of cameras.value) {
    if (camera.roomId === previous && contains(part, camera)) camera.roomId = roomId;
  }

  if (partsOf(previous).length) return;

  cameras.value = cameras.value.filter((camera) => camera.roomId !== previous);
  connections.value = connections.value.filter((connection) => connection.fromRoomId !== previous && connection.toRoomId !== previous);
}

function findCamera(id: string): FloorplanCamera | undefined {
  return cameras.value.find((camera) => camera.id === id);
}

function onMoveRoom({ id, x, y }: { id: string; x: number; y: number }): void {
  const room = findRoom(id);
  if (!room) return;

  const deltaX = x - room.x;
  const deltaY = y - room.y;
  room.x = x;
  room.y = y;

  for (const camera of cameras.value) {
    if (camera.roomId !== room.roomId || !contains(room, camera)) continue;
    camera.x += deltaX;
    camera.y += deltaY;
  }
}

function onResizeRoom({ id, width, height }: { id: string; width: number; height: number }): void {
  const room = findRoom(id);
  if (!room) return;
  room.width = width;
  room.height = height;

  for (const camera of cameras.value) {
    if (camera.roomId !== room.id) continue;
    camera.x = Math.min(Math.max(camera.x, room.x), room.x + room.width);
    camera.y = Math.min(Math.max(camera.y, room.y), room.y + room.height);
  }
}

function onMoveCamera({ id, x, y }: { id: string; x: number; y: number }): void {
  const camera = findCamera(id);
  if (!camera) return;
  camera.x = x;
  camera.y = y;
}

function onRotateCamera({ id, rotation, range }: { id: string; rotation: number; range: number }): void {
  const camera = findCamera(id);
  if (!camera) return;
  camera.rotation = rotation;
  camera.range = range;
}

function onUpdateRoom({ id, patch }: { id: string; patch: Partial<FloorplanRoom> }): void {
  pushHistory(true);
  const room = findRoom(id);
  if (!room) return;

  if (patch.roomId && patch.roomId !== room.roomId) {
    joinRoom(room, patch.roomId);
    return;
  }

  const shared = { name: patch.name, note: patch.note, levelId: patch.levelId, outdoor: patch.outdoor, publicSpace: patch.publicSpace };
  const roomWide = Object.fromEntries(Object.entries(shared).filter(([, value]) => value !== undefined));

  Object.assign(room, patch);
  if (!Object.keys(roomWide).length) return;

  for (const part of partsOf(room.roomId)) Object.assign(part, roomWide);
  if (patch.levelId) {
    for (const camera of cameras.value) {
      if (camera.roomId === room.roomId) camera.levelId = patch.levelId;
    }
  }
}

function onUpdateCamera({ id, patch }: { id: string; patch: Partial<FloorplanCamera> }): void {
  pushHistory(true);
  const camera = findCamera(id);
  if (!camera) return;

  Object.assign(camera, patch);

  if (patch.roomId) {
    const parts = partsOf(patch.roomId);
    const room = parts.find((part) => contains(part, camera)) ?? parts[0];
    if (room && !contains(room, camera)) {
      camera.x = Math.round(room.x + room.width / 2);
      camera.y = Math.round(room.y + room.height / 2);
      camera.levelId = room.levelId;
    }
  }
}

function onMoveSensor({ id, x, y }: { id: string; x: number; y: number }): void {
  const sensor = sensors.value.find((item) => item.id === id);
  if (sensor) Object.assign(sensor, { x, y });
}

function onUpdateSensor({ id, patch }: { id: string; patch: Partial<FloorplanSensor> }): void {
  pushHistory(true);
  const sensor = sensors.value.find((item) => item.id === id);
  if (sensor) Object.assign(sensor, patch);
}

const hoveredSensor = computed(() => sensors.value.find((sensor) => sensor.id === hoveredSensorId.value));

function liveSensorOf(id: string): ReactiveSensor | undefined {
  return liveSensors.value.find((sensor: ReactiveSensor) => sensor.id === id);
}

function isControllable(type: string): boolean {
  return isAdmin && !SENSOR_READONLY_TYPES.has(type as SensorShortcutType);
}

async function onToggleSensor(id: string): Promise<void> {
  if (!isAdmin) return;
  await toggleSensor(liveSensorOf(id));
}

async function onSetSecurity(id: string, state: SecuritySystemState): Promise<void> {
  if (!isAdmin) return;
  await setSecurityState(liveSensorOf(id), state);
}

// leaving the dot must not close the card before the pointer reaches its buttons
function keepSensorPopover(): void {
  clearTimeout(sensorHideTimer);
}

function hideSensorPopover(): void {
  clearTimeout(sensorHideTimer);
  sensorHideTimer = setTimeout(() => {
    hoveredSensorId.value = null;
    sensorPopoverRef.value?.hide();
  }, 220);
}

function onHoverSensor(hover: { sensorId: string; x: number; y: number } | null): void {
  if (!hover) return hideSensorPopover();

  keepSensorPopover();
  hoveredSensorId.value = hover.sensorId;
  sensorAnchor.value = { x: hover.x, y: hover.y };
  nextTick(() => {
    if (sensorAnchorRef.value) sensorPopoverRef.value?.show({ currentTarget: sensorAnchorRef.value } as unknown as Event);
  });
}

function onHoverCamera(hover: { cameraId: string; x: number; y: number } | null): void {
  clearTimeout(previewTimer);

  if (!hover) {
    hidePreview();
    return;
  }

  previewAnchor.value = { x: hover.x, y: hover.y };
  previewCameraId.value = hover.cameraId;
  previewTimer = setTimeout(() => {
    if (previewAnchorRef.value) previewRef.value?.show({ currentTarget: previewAnchorRef.value } as unknown as Event);
  }, 350);
}

function keepPreview(): void {
  clearTimeout(previewTimer);
}

function hidePreview(): void {
  previewTimer = setTimeout(() => {
    previewRef.value?.hide();
    previewCameraId.value = null;
  }, 200);
}

function onRequestStairs({ roomId, event }: { roomId: string; event: PointerEvent }): void {
  stairsSource.value = roomId;
  menuAnchor.value = { x: event.clientX, y: event.clientY };
  nextTick(() => stairsMenuRef.value?.toggleMenu(event, menuAnchorRef.value));
}

function onUpdateConnection({ id, patch }: { id: string; patch: Partial<FloorplanConnection> }): void {
  pushHistory(true);
  const connection = connections.value.find((item) => item.id === id);
  if (connection) Object.assign(connection, patch);
}

function onCreateConnection({ fromRoomId, toRoomId, fromShapeId, toShapeId }: { fromRoomId: string; toRoomId: string; fromShapeId?: string; toShapeId?: string }): void {
  pushHistory();

  const from = rooms.value.find((room) => room.id === fromShapeId) ?? partsOf(fromRoomId)[0];
  const to = rooms.value.find((room) => room.id === toShapeId) ?? partsOf(toRoomId)[0];
  const wall = from && to ? sharedWall(from, to) : null;

  const connection: FloorplanConnection = {
    id: crypto.randomUUID(),
    fromRoomId,
    toRoomId,
    fromShapeId: from?.id ?? null,
    toShapeId: to?.id ?? null,
    offset: wall ? freeSpotOnWall(wall, from?.id, to?.id) : null,
    width: FLOORPLAN_DOOR_WIDTH,
    note: '',
    type: from && to && from.levelId !== to.levelId ? 'stairs' : 'door',
  };

  connections.value.push(connection);
  selection.value = { kind: 'connection', id: connection.id };
}

function freeSpotOnWall(wall: Wall, fromShapeId?: string, toShapeId?: string): number {
  const taken = connections.value
    .filter((connection) => connection.fromShapeId === fromShapeId && connection.toShapeId === toShapeId)
    .map((connection) => passageOn(wall, connection.offset, connection.width))
    .map((passage) => {
      const start = (passage.x1 - wall.x) * wall.stepX + (passage.y1 - wall.y) * wall.stepY;
      const end = (passage.x2 - wall.x) * wall.stepX + (passage.y2 - wall.y) * wall.stepY;
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .sort((a, b) => a.start - b.start);

  const half = Math.min(FLOORPLAN_DOOR_WIDTH, wall.length) / 2;
  let cursor = 0;

  for (const slot of taken) {
    if (slot.start - cursor >= half * 2) break;
    cursor = Math.max(cursor, slot.end);
  }

  return Math.round(Math.min(Math.max(cursor + half, half), wall.length - half));
}

function onMoveConnection({ id, offset }: { id: string; offset: number }): void {
  pushHistory(true);
  const connection = connections.value.find((item) => item.id === id);
  if (connection) connection.offset = offset;
}

function onResizeConnection({ id, offset, width }: { id: string; offset: number; width: number }): void {
  pushHistory(true);
  const connection = connections.value.find((item) => item.id === id);
  if (connection) Object.assign(connection, { offset, width });
}

function contains(room: FloorplanRoom, camera: FloorplanCamera): boolean {
  return camera.x >= room.x && camera.x <= room.x + room.width && camera.y >= room.y && camera.y <= room.y + room.height;
}

function onRemove(target: FloorplanSelection): void {
  pushHistory();
  if (target.kind === 'room') {
    const removed = findRoom(target.id);
    if (!removed) return;

    rooms.value = rooms.value.filter((room) => room.id !== target.id);
    cameras.value = cameras.value.filter((camera) => camera.roomId !== removed.roomId || !contains(removed, camera));

    if (!partsOf(removed.roomId).length) {
      cameras.value = cameras.value.filter((camera) => camera.roomId !== removed.roomId);
      connections.value = connections.value.filter((connection) => connection.fromRoomId !== removed.roomId && connection.toRoomId !== removed.roomId);
    }
  } else if (target.kind === 'connection') {
    connections.value = connections.value.filter((connection) => connection.id !== target.id);
  } else if (target.kind === 'sensor') {
    sensors.value = sensors.value.filter((sensor) => sensor.id !== target.id);
  } else {
    cameras.value = cameras.value.filter((camera) => camera.id !== target.id);
  }
  selection.value = null;
}

function addRoom(x: number, y: number, roomId?: string): void {
  pushHistory();
  const spot = freeSpot(Math.round(x - 120), Math.round(y - 100), 240, 200);
  const known = roomId ? catalog.value.rooms.find((room) => room.id === roomId) : undefined;

  const room: FloorplanRoom = {
    id: crypto.randomUUID(),
    roomId: known?.id ?? crypto.randomUUID(),
    name: known?.name ?? t('views.floorplan.new_room'),
    note: known?.note ?? '',
    publicSpace: known?.publicSpace ?? false,
    levelId: levelId.value,
    outdoor: known?.outdoor ?? false,
    x: spot.x,
    y: spot.y,
    width: 240,
    height: 200,
  };
  rooms.value.push(room);
  selection.value = { kind: 'room', id: room.id };
}

function freeSpot(x: number, y: number, width: number, height: number): { x: number; y: number } {
  const levelRooms = rooms.value.filter((room) => room.levelId === levelId.value);
  const blocked = (candidateX: number, candidateY: number): boolean =>
    levelRooms.some((room) => candidateX < room.x + room.width && candidateX + width > room.x && candidateY < room.y + room.height && candidateY + height > room.y);

  if (!blocked(x, y)) return { x, y };

  for (let ring = 1; ring <= 12; ring++) {
    for (const [stepX, stepY] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const candidateX = x + stepX * ring * (width + 20);
      const candidateY = y + stepY * ring * (height + 20);
      if (!blocked(candidateX, candidateY)) return { x: candidateX, y: candidateY };
    }
  }

  return { x, y };
}

function placeCamera(cameraId: string, x: number, y: number): void {
  const room = rooms.value.find((item) => item.levelId === levelId.value && x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
  if (!room) return;

  pushHistory();

  const camera: FloorplanCamera = {
    id: cameraId,
    name: cameraNames.value.get(cameraId) ?? cameraId,
    levelId: levelId.value,
    roomId: room.roomId,
    note: '',
    x: Math.round(x),
    y: Math.round(y),
    rotation: 0,
    fov: 90,
    range: 800,
  };
  cameras.value.push(camera);
  selection.value = { kind: 'camera', id: camera.id };
}

function placeSensor(sensorId: string, sensorType: string, x: number, y: number): void {
  const room = rooms.value.find((item) => item.levelId === levelId.value && x >= item.x && x <= item.x + item.width && y >= item.y && y <= item.y + item.height);
  if (!room) return;

  pushHistory();

  const sensor: FloorplanSensor = {
    id: sensorId,
    name: sensorNames.value.get(sensorId)?.name ?? sensorId,
    owner: sensorNames.value.get(sensorId)?.owner ?? '',
    sensorType,
    levelId: levelId.value,
    roomId: room.roomId,
    connectionId: null,
    note: '',
    x: Math.round(x),
    y: Math.round(y),
  };

  sensors.value.push(sensor);
  selection.value = { kind: 'sensor', id: sensor.id };
}

function onDropItem({ kind, cameraId, sensorId, sensorType, roomId, x, y }: PlanDrop): void {
  if (!levels.value.length) return;

  if (kind === 'room') addRoom(x, y, roomId);
  else if (kind === 'sensor' && sensorId && sensorType) placeSensor(sensorId, sensorType, x, y);
  else if (cameraId) placeCamera(cameraId, x, y);
}

function onPalettePick(item: Omit<PlanDrop, 'x' | 'y'>): void {
  onDropItem({ ...item, x: levelCenter.value.x, y: levelCenter.value.y });
}

function onMobilePick(item: Omit<PlanDrop, 'x' | 'y'>): void {
  showMobilePalette.value = false;
  onPalettePick(item);
}

function addLevel(): void {
  dialog.openComponentDialog<FloorplanLevelProps>(FloorplanLevelDialog, {
    data: {
      title: t('views.floorplan.add_level'),
      confirmText: t('components.form.button.add'),
      contentProps: {},
    },
    onConfirm: (name: string | null) => {
      if (!name) return;

      pushHistory();
      const level: FloorplanLevel = { id: crypto.randomUUID(), name };
      levels.value.push(level);
      levelId.value = level.id;
      selection.value = null;
    },
  });
}

function renameLevel(): void {
  const level = currentLevel.value;
  if (!level) return;

  dialog.openComponentDialog<FloorplanLevelProps>(FloorplanLevelDialog, {
    data: {
      title: t('views.floorplan.rename_level'),
      confirmText: t('components.form.button.save'),
      contentProps: { name: level.name },
    },
    onConfirm: (name: string | null) => {
      if (!name) return;

      pushHistory();
      level.name = name;
    },
  });
}

function removeLevel(): void {
  if (!currentLevel.value) return;
  pushHistory();

  const removed = levelId.value;
  const removedRooms = new Set(rooms.value.filter((room) => room.levelId === removed).map((room) => room.id));
  levels.value = levels.value.filter((level) => level.id !== removed);
  rooms.value = rooms.value.filter((room) => room.levelId !== removed);
  cameras.value = cameras.value.filter((camera) => camera.levelId !== removed);
  connections.value = connections.value.filter((connection) => !removedRooms.has(connection.fromRoomId) && !removedRooms.has(connection.toRoomId));
  levelId.value = levels.value[0]?.id ?? '';
  selection.value = null;
}

function moveLevel(delta: number): void {
  const index = levelIndex.value;
  const target = index + delta;
  if (index < 0 || target < 0 || target >= levels.value.length) return;

  pushHistory();
  const next = [...levels.value];
  [next[index], next[target]] = [next[target], next[index]];
  levels.value = next;
}

function clearLevel(): void {
  pushHistory();
  const clearedRooms = new Set(rooms.value.filter((room) => room.levelId === levelId.value).map((room) => room.id));
  rooms.value = rooms.value.filter((room) => room.levelId !== levelId.value);
  cameras.value = cameras.value.filter((camera) => camera.levelId !== levelId.value);
  connections.value = connections.value.filter((connection) => !clearedRooms.has(connection.fromRoomId) && !clearedRooms.has(connection.toRoomId));
  selection.value = null;
}

async function onSave(): Promise<void> {
  saving.value = true;
  try {
    const plan = await putFloorPlan(toPayload());
    applyPlan(plan, await getRooms());
    await refreshCameras();
    toast.add({ severity: 'success', detail: t('views.floorplan.saved'), life: 3000 });
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    saving.value = false;
  }
}

async function refreshCameras(): Promise<void> {
  await Promise.all([
    camerasQuery.queryClient.refetchQueries({ queryKey: ['camerasList'] }),
    camerasQuery.queryClient.refetchQueries({ queryKey: ['cameras'] }),
    camerasQuery.queryClient.refetchQueries({ queryKey: ['rooms'], exact: true }),
  ]);
}

async function load(): Promise<void> {
  try {
    const [plan, rooms] = await Promise.all([getFloorPlan(), getRooms()]);
    applyPlan(plan, rooms);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    loading.value = false;
  }
}

async function revert(): Promise<void> {
  await load();
}

function onKeyDown(event: KeyboardEvent): void {
  if (!isAdmin) return;

  const target = event.target as HTMLElement | null;
  if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;

  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }

  if (modifier && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
    return;
  }

  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (!selection.value) return;

  event.preventDefault();
  onRemove(selection.value);
}

const offPlan = floorplanSocket.onPlan(async (plan) => {
  if (hasChanges.value) return;
  applyPlan(plan, await getRooms());
  await refreshCameras();
});

function startSheetDrag(event: PointerEvent): void {
  const startY = event.clientY;
  const startOffset = sheetOffset.value;
  let moved = false;

  sheetDragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

  const onMove = (move: PointerEvent) => {
    if (Math.abs(move.clientY - startY) > 3) moved = true;
    sheetOffset.value = Math.min(Math.max(startOffset + (move.clientY - startY), 0), sheetParked.value);
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);

    sheetDragging.value = false;
    if (!moved) sheetOffset.value = startOffset > 0 ? 0 : sheetParked.value;
    else sheetOffset.value = sheetOffset.value > sheetParked.value * 0.35 ? sheetParked.value : 0;
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}

watch(cameraNames, (names) => {
  for (const camera of cameras.value) {
    camera.name = names.get(camera.id) ?? camera.id;
  }
});

watch(sensorNames, (names) => {
  for (const sensor of sensors.value) {
    sensor.name = names.get(sensor.id)?.name ?? sensor.id;
    sensor.owner = names.get(sensor.id)?.owner ?? '';
  }
});

watch(sheetRef, (element) => {
  sheetObserver?.disconnect();
  if (!element) {
    sheetHeight.value = 0;
    return;
  }

  sheetObserver = new ResizeObserver(([entry]) => (sheetHeight.value = Math.round(entry.contentRect.height)));
  sheetObserver.observe(element);
});

watch(
  () => selection.value && `${selection.value.kind}:${selection.value.id}`,
  () => (sheetOffset.value = 0),
);

onMounted(() => {
  floorplanSocket.connect();
  window.addEventListener('keydown', onKeyDown);
  load();
});

onBeforeRouteLeave((to) => {
  if (!hasChanges.value || leaveConfirmed) return true;

  dialog.openTextDialog({
    data: {
      title: t('views.floorplan.unsaved_title'),
      contentText: t('views.floorplan.unsaved_message'),
      confirmText: t('views.floorplan.discard'),
    },
    onConfirm: async () => {
      leaveConfirmed = true;
      router.push(to.fullPath);
    },
  });

  return false;
});

onUnmounted(() => {
  clearTimeout(previewTimer);
  clearTimeout(sensorHideTimer);
  offPlan();
  sheetObserver?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<style scoped>
.sheet-grip {
  touch-action: none;
}

.sheet-grip-bar {
  background: var(--p-content-border-color);
}

.floorplan-divider {
  margin: 0 0.25rem;
  height: 22px;
  align-self: center;
}
</style>
