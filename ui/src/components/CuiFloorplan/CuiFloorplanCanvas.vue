<template>
  <div
    ref="wrapperRef"
    class="floorplan-canvas relative w-full h-full overflow-hidden border-left-color border-bottom-color border-right-color rounded-b-xl"
    :class="{ 'rounded-none! border-0!': mobile }"
    @pointermove="onPointerMove"
    @pointerup="endDrag"
    @pointercancel="endDrag"
    @drop="onDrop"
    @dragover.prevent
    @dragenter.prevent
  >
    <VueFlow
      :nodes="sceneNodes"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-double-click="false"
      :min-zoom="FLOORPLAN_ZOOM_RANGE.min"
      :max-zoom="FLOORPLAN_ZOOM_RANGE.max"
      :default-viewport="{ x: 0, y: 0, zoom: 1 }"
      class="floorplan-flow"
      @pane-click="emit('select', null)"
    >
      <Background :gap="FLOORPLAN_GRID" :size="FLOORPLAN_DOT" pattern-color="#81818a" />

      <template #node-scene>
        <svg class="floorplan-scene" :style="{ left: `${sceneBox.x}px`, top: `${sceneBox.y}px`, width: `${sceneBox.width}px`, height: `${sceneBox.height}px` }">
          <defs>
            <pattern id="floorplan-public" :width="14 / zoom" :height="14 / zoom" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect :width="14 / zoom" :height="14 / zoom" class="public-base" />
              <line x1="0" y1="0" x2="0" :y2="14 / zoom" class="public-hatch" :stroke-width="1.5 / zoom" />
            </pattern>

            <clipPath v-for="area in sightAreas" :id="`floorplan-sight-${area.roomId}`" :key="area.roomId">
              <path :d="area.path" />
            </clipPath>
          </defs>

          <g :transform="`translate(${-sceneBox.x} ${-sceneBox.y})`">
            <g v-for="group in roomShapes" :key="group.roomId">
              <path
                :d="group.fill"
                class="room"
                :class="{
                  'room-outdoor': group.outdoor && !group.publicSpace,
                  'room-public': group.publicSpace,
                  'room-active': activeRooms.has(group.roomId),
                }"
              />
              <path
                :d="group.wall"
                class="room-wall"
                :class="{ 'room-selected': group.selected, 'room-public-wall': group.publicSpace }"
                :stroke-width="(group.selected ? 2.5 : 1.5) / zoom"
              />
            </g>

            <g v-for="area in sightAreas" :key="`sight-${area.roomId}`" :clip-path="`url(#floorplan-sight-${area.roomId})`">
              <path
                v-for="camera in camerasOf(area.roomId)"
                :key="camera.id"
                :d="conePath(camera)"
                class="cone"
                :class="[`cone-${activityOf(camera.id) ?? 'idle'}`, { 'cone-selected': isSelected('camera', camera.id) }]"
                :transform="`translate(${camera.x} ${camera.y}) rotate(${camera.rotation})`"
              />
            </g>

            <g v-for="group in roomShapes" :key="`hits-${group.roomId}`">
              <rect
                v-for="part in group.parts"
                :key="part.id"
                :x="part.x"
                :y="part.y"
                :width="part.width"
                :height="part.height"
                class="room-hit"
                :class="{ nopan: !editingLocked }"
                @pointerdown="startRoomDrag($event, part)"
              />

              <template v-for="label in labelsOf(group)" :key="label.text">
                <text
                  :x="label.x"
                  :y="label.y"
                  :font-size="label.size"
                  :transform="label.upright ? undefined : `rotate(-90 ${label.x} ${label.y})`"
                  class="room-label"
                  text-anchor="middle"
                >
                  {{ label.text }}
                </text>
              </template>
            </g>

            <g v-for="passage in passages" :key="passage.id" :class="{ nopan: !editingLocked }" @pointerdown="startPassageDrag($event, passage)">
              <path :d="passage.line" class="connection-hit" :stroke-width="24 / zoom" />
              <path
                :d="passage.line"
                class="connection"
                :class="[`connection-${passage.type}`, { 'connection-selected': isSelected('connection', passage.id) }]"
                :stroke-width="7 / zoom"
              />
              <circle
                v-for="(handle, index) in isSelected('connection', passage.id) && !editingLocked ? passage.handles : []"
                :key="index"
                :cx="handle.x"
                :cy="handle.y"
                :r="7 / zoom"
                class="passage-handle nopan"
                :stroke-width="2 / zoom"
                @pointerdown="startPassageResize($event, passage, index as 0 | 1)"
              />
            </g>

            <template v-for="entry in connectionShapes" :key="entry.connection.id">
              <path
                v-if="entry.geometry.kind === 'link'"
                :d="`M ${entry.geometry.x1} ${entry.geometry.y1} L ${entry.geometry.x2} ${entry.geometry.y2}`"
                class="connection connection-stairs"
                :class="{ 'connection-selected': isSelected('connection', entry.connection.id) }"
                :stroke-width="2 / zoom"
                @pointerdown="selectConnection($event, entry.connection.id)"
              />
            </template>

            <g
              v-for="camera in levelCameras"
              :key="camera.id"
              :class="{ nopan: !editingLocked }"
              @pointerdown="startCameraDrag($event, camera)"
              @pointerenter="onCameraEnter($event, camera)"
              @pointerleave="onCameraLeave"
            >
              <circle
                :cx="camera.x"
                :cy="camera.y"
                :r="13 / zoom"
                class="camera-body"
                :class="[`camera-${activityOf(camera.id) ?? 'idle'}`, { 'camera-selected': isSelected('camera', camera.id) }]"
                :stroke-width="2 / zoom"
              />
              <circle :cx="camera.x" :cy="camera.y" :r="4 / zoom" class="camera-lens" />

              <g v-if="hoveredCameraId === camera.id || isSelected('camera', camera.id) || activity.has(camera.id)" class="camera-chip">
                <rect :x="camera.x - chipBox(camera).width / 2" :y="camera.y - 42 / zoom" :width="chipBox(camera).width" :height="20 / zoom" :rx="10 / zoom" />
                <foreignObject
                  v-for="(label, index) in labelsOfCamera(camera)"
                  :key="label"
                  :x="camera.x - chipBox(camera).width / 2 + (8 + index * 17) / zoom"
                  :y="camera.y - 39.5 / zoom"
                  :width="15 / zoom"
                  :height="15 / zoom"
                  class="chip-glyph"
                >
                  <component :is="detectionStyle(label).icon" width="100%" height="100%" />
                </foreignObject>
                <text :x="camera.x - chipBox(camera).width / 2 + chipBox(camera).textOffset" :y="camera.y - 28 / zoom" :font-size="12 / zoom">
                  {{ camera.name }}
                </text>
              </g>
            </g>

            <g v-for="candidate in showDetail ? connectionCandidates : []" :key="candidate.roomId">
              <circle
                :cx="candidate.x"
                :cy="candidate.y"
                :r="11 / zoom"
                class="connection-ghost nopan"
                :stroke-width="1.5 / zoom"
                @pointerdown.stop="
                  emit('create-connection', {
                    fromRoomId: candidate.fromRoomId,
                    toRoomId: candidate.roomId,
                    fromShapeId: candidate.fromShapeId,
                    toShapeId: candidate.shapeId,
                  })
                "
              />
              <path
                :d="`M ${candidate.x - 5 / zoom} ${candidate.y} L ${candidate.x + 5 / zoom} ${candidate.y} M ${candidate.x} ${candidate.y - 5 / zoom} L ${candidate.x} ${candidate.y + 5 / zoom}`"
                class="connection-ghost-plus"
                :stroke-width="1.5 / zoom"
              />
            </g>

            <g
              v-for="sensor in levelSensors"
              :key="`sensor-${sensor.id}`"
              :class="{ nopan: !editingLocked }"
              @pointerdown="startSensorDrag($event, sensor)"
              @pointerenter="onSensorEnter($event, sensor)"
              @pointerleave="onSensorLeave"
            >
              <circle
                :cx="sensor.x"
                :cy="sensor.y"
                :r="11 / zoom"
                class="sensor-body"
                :class="{ 'sensor-selected': isSelected('sensor', sensor.id) }"
                :stroke-width="2 / zoom"
              />
              <foreignObject :x="sensor.x - 7 / zoom" :y="sensor.y - 7 / zoom" :width="14 / zoom" :height="14 / zoom" class="sensor-glyph">
                <component :is="sensorIcon(sensor.sensorType, liveSensor(sensor.id))" width="100%" height="100%" :style="sensorStyle(sensor)" />
              </foreignObject>

              <g v-if="hoveredSensorId === sensor.id || isSelected('sensor', sensor.id)" class="camera-chip">
                <rect
                  :x="sensor.x - chipWidth(sensorLabel(sensor)) / 2"
                  :y="sensor.y - 42 / zoom"
                  :width="chipWidth(sensorLabel(sensor))"
                  :height="20 / zoom"
                  :rx="10 / zoom"
                />
                <text :x="sensor.x" :y="sensor.y - 28 / zoom" text-anchor="middle" :font-size="12 / zoom">{{ sensorLabel(sensor) }}</text>
              </g>
            </g>

            <g v-for="mirror in flightCameras" :key="mirror.key" class="flight-camera" @pointerenter="hoveredFlight = mirror.key" @pointerleave="hoveredFlight = null">
              <circle :cx="mirror.x" :cy="mirror.y" :r="11 / zoom" class="flight-camera-body" :stroke-width="1.5 / zoom" />
              <circle :cx="mirror.x" :cy="mirror.y" :r="3.5 / zoom" class="flight-camera-lens" />

              <g v-if="hoveredFlight === mirror.key" class="camera-chip">
                <rect :x="mirror.x - chipWidth(mirror.label) / 2" :y="mirror.y - 42 / zoom" :width="chipWidth(mirror.label)" :height="20 / zoom" :rx="10 / zoom" />
                <text :x="mirror.x" :y="mirror.y - 28 / zoom" text-anchor="middle" :font-size="12 / zoom">{{ mirror.label }}</text>
              </g>
            </g>

            <g v-for="badge in cornerBadges" :key="badge.key" :class="{ nopan: !editingLocked }" @pointerdown="onBadgeDown($event, badge)">
              <circle
                :cx="badge.x"
                :cy="badge.y"
                :r="12 / zoom"
                :class="[
                  badge.connectionId ? 'connection-badge' : 'connection-ghost',
                  { 'connection-selected': badge.connectionId && isSelected('connection', badge.connectionId) },
                ]"
                :stroke-width="(badge.connectionId ? 2 : 1.5) / zoom"
              />
              <path :d="stairsGlyph(badge.x, badge.y)" class="badge-glyph" :stroke-width="1.5 / zoom" fill="none" stroke-linejoin="round" />
              <text v-if="badge.direction" :x="badge.x + 13 / zoom" :y="badge.y - 7 / zoom" class="badge-direction" :font-size="12 / zoom">{{ badge.direction }}</text>

              <g v-if="sizeChip" class="camera-chip">
                <rect :x="sizeChip.x - sizeChip.width / 2" :y="sizeChip.y" :width="sizeChip.width" :height="20 / zoom" :rx="10 / zoom" />
                <text :x="sizeChip.x" :y="sizeChip.y + 14 / zoom" text-anchor="middle" :font-size="12 / zoom">{{ sizeChip.text }}</text>
              </g>
            </g>

            <path v-if="guides.x !== null" :d="`M ${guides.x} ${viewBounds.top} L ${guides.x} ${viewBounds.bottom}`" class="guide" :stroke-width="1 / zoom" />
            <path v-if="guides.y !== null" :d="`M ${viewBounds.left} ${guides.y} L ${viewBounds.right} ${guides.y}`" class="guide" :stroke-width="1 / zoom" />

            <rect
              v-if="selectedRoom && !editingLocked"
              :x="selectedRoom.x + selectedRoom.width - 7 / zoom"
              :y="selectedRoom.y + selectedRoom.height - 7 / zoom"
              :width="14 / zoom"
              :height="14 / zoom"
              :rx="3 / zoom"
              class="handle nopan"
              :stroke-width="1.5 / zoom"
              @pointerdown="startRoomResize($event, selectedRoom)"
            />

            <circle
              v-if="selectedCamera && !editingLocked"
              :cx="selectedCamera.x + Math.cos(rad(selectedCamera.rotation)) * selectedCamera.range"
              :cy="selectedCamera.y + Math.sin(rad(selectedCamera.rotation)) * selectedCamera.range"
              :r="9 / zoom"
              class="handle nopan"
              :stroke-width="1.5 / zoom"
              @pointerdown="startCameraRotate($event, selectedCamera)"
            />
          </g>
        </svg>
      </template>
    </VueFlow>

    <div
      ref="compassRef"
      v-tooltip.left="{ value: editingLocked ? $t('views.floorplan.north_reading', { value: northAngle }) : $t('views.floorplan.north_hint') }"
      class="floorplan-compass absolute top-3 right-3"
      :class="{ 'cursor-grab active:cursor-grabbing': !editingLocked }"
      @pointerdown.stop="startNorthDrag"
    >
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="21" class="compass-ring" stroke-width="1" />
        <g :transform="`rotate(${northAngle} 23 23)`">
          <path d="M 23 6 L 27 23 L 23 19 L 19 23 Z" class="compass-needle" />
          <text x="23" y="41" text-anchor="middle" class="compass-label" font-size="9">N</text>
        </g>
      </svg>
    </div>

    <div
      class="absolute left-3 flex flex-col gap-2 items-start"
      :style="{ bottom: `${12 + (bottomInset ?? 0)}px`, transition: bottomInsetDragging ? 'none' : 'bottom 0.2s ease-in-out' }"
    >
      <div class="flex flex-col overflow-hidden floorplan-controls">
        <button v-tooltip.right="{ value: $t('views.floorplan.zoom_in') }" type="button" class="control-button" @pointerdown.stop @click.stop="zoomIn()">
          <i-mdi:plus class="w-4 h-4" />
        </button>
        <button v-tooltip.right="{ value: $t('views.floorplan.zoom_out') }" type="button" class="control-button" @pointerdown.stop @click.stop="zoomOut()">
          <i-mdi:minus class="w-4 h-4" />
        </button>
        <button v-tooltip.right="{ value: $t('views.floorplan.fit') }" type="button" class="control-button" @pointerdown.stop @click.stop="fit()">
          <i-mdi:fit-to-screen-outline class="w-4 h-4" />
        </button>
        <button
          v-tooltip.right="{ value: locked ? $t('views.floorplan.unlock') : $t('views.floorplan.lock') }"
          type="button"
          class="control-button"
          :class="{ 'control-active': locked }"
          @pointerdown.stop
          @click.stop="locked = !locked"
        >
          <i-mdi:lock v-if="locked" class="w-4 h-4" />
          <i-mdi:lock-open-variant-outline v-else class="w-4 h-4" />
        </button>
      </div>

      <div class="floorplan-scale flex items-center gap-2 px-2 py-1">
        <svg :width="scaleBar.width" height="10" class="shrink-0">
          <path :d="`M 1 1 L 1 9 M 1 5 L ${scaleBar.width - 1} 5 M ${scaleBar.width - 1} 1 L ${scaleBar.width - 1} 9`" class="scale-line" stroke-width="1" />
        </svg>
        <span class="text-xs text-muted whitespace-nowrap">{{ scaleBar.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAllSensors } from '@camera.ui/browser';
import { Background } from '@vue-flow/background';
import { useVueFlow, VueFlow } from '@vue-flow/core';

import { detectionStyle } from '@/common/detectionLabels.js';
import { sensorIcon, sensorReading, sensorState, sensorTone } from '@/components/CuiSensors/display.js';

import {
  FLOORPLAN_CAMERA_RANGE,
  FLOORPLAN_DOT,
  FLOORPLAN_DRAG_TYPE,
  FLOORPLAN_GRID,
  FLOORPLAN_MIN_ROOM,
  FLOORPLAN_PASSAGE_RANGE,
  FLOORPLAN_SNAP,
  FLOORPLAN_UNITS_PER_METER,
  FLOORPLAN_ZOOM_RANGE,
  ROOM_LABEL_ASPECT,
  ROOM_LABEL_MIN,
  ROOM_LABEL_SIZE,
  SNAP_PX,
} from './types.js';
import { connectionGeometry, metersLabel, passageOn, roomOutline, sharedWall } from './utils.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type {
  CuiFloorplanCanvasEmits,
  CuiFloorplanCanvasProps,
  FloorplanCamera,
  FloorplanConnection,
  FloorplanRoom,
  FloorplanSelection,
  FloorplanSensor,
} from './types.js';
import type { ConnectionGeometry, Segment, Wall } from './utils.js';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoomLabel {
  text: string;
  size: number;
  x: number;
  y: number;
  upright: boolean;
}

type Drag =
  | { mode: 'room'; id: string; offsetX: number; offsetY: number }
  | { mode: 'resize'; id: string; originX: number; originY: number }
  | { mode: 'camera'; id: string; offsetX: number; offsetY: number }
  | { mode: 'sensor'; id: string; offsetX: number; offsetY: number }
  | { mode: 'rotate'; id: string }
  | { mode: 'passage'; id: string; wall: Wall; grab: number }
  | { mode: 'passage-resize'; id: string; wall: Wall; end: 0 | 1 }
  | { mode: 'north' };

const props = defineProps<CuiFloorplanCanvasProps>();

const emit = defineEmits<CuiFloorplanCanvasEmits>();

const wrapperRef = useTemplateRef<HTMLElement>('wrapperRef');
const locked = ref(false);

const { viewport, zoomIn, zoomOut, fitBounds } = useVueFlow();

const compassRef = useTemplateRef<HTMLElement>('compassRef');
const guides = ref<{ x: number | null; y: number | null }>({ x: null, y: null });
const hoveredCameraId = ref<string | null>(null);
const hoveredFlight = ref<string | null>(null);
const hoveredSensorId = ref<string | null>(null);
const resizingRoomId = ref<string | null>(null);

const CAMERA_MARGIN = 60;
const MOTION_SENSORS = new Set(['motion', 'audio']);
const DETECTION_SENSORS = new Set(['object', 'face', 'licensePlate', 'classifier', 'objectAssist', 'clip']);

let drag: Drag | null = null;
let dragCommitted = false;
let tap: { target: FloorplanSelection; x: number; y: number } | null = null;

const { sensors: liveSensors } = useAllSensors();

const levelSensors = computed(() => props.sensors.filter((sensor) => sensor.levelId === props.levelId));

const activity = computed(() => {
  const out = new Map<string, { level: 'motion' | 'detection'; labels: string[] }>();

  for (const sensor of liveSensors.value as ReactiveSensor[]) {
    const type = String(sensor.type);
    const motion = MOTION_SENSORS.has(type);
    const detection = DETECTION_SENSORS.has(type);
    if ((!motion && !detection) || sensor.getProperty('detected') !== true) continue;

    const labels = labelsOfSensor(sensor, type);

    for (const cameraId of sensor.assignedCameraIds.value) {
      const current = out.get(cameraId);

      out.set(cameraId, {
        level: current?.level === 'detection' || detection ? 'detection' : 'motion',
        labels: [...new Set([...(current?.labels ?? []), ...labels])],
      });
    }
  }

  return out;
});

const sizeChip = computed(() => {
  const room = levelRooms.value.find((item) => item.id === resizingRoomId.value);
  if (!room) return null;

  const text = `${metersLabel(room.width, 1)} x ${metersLabel(room.height, 1)}`;
  return { text, width: chipWidth(text), x: room.x + room.width / 2, y: room.y + room.height + 10 / zoom.value };
});

const zoom = computed(() => viewport.value.zoom);
const pan = computed(() => ({ x: viewport.value.x, y: viewport.value.y }));

const northAngle = computed(() => props.north ?? 0);

const editingLocked = computed(() => props.readOnly === true || locked.value);

const levelRooms = computed(() => props.rooms.filter((room) => room.levelId === props.levelId));
const levelCameras = computed(() => props.cameras.filter((camera) => camera.levelId === props.levelId));

const sceneBox = computed(() => {
  const margin = 4000;
  const xs = [0];
  const ys = [0];

  for (const room of levelRooms.value) {
    xs.push(room.x, room.x + room.width);
    ys.push(room.y, room.y + room.height);
  }
  for (const camera of levelCameras.value) {
    xs.push(camera.x - camera.range, camera.x + camera.range);
    ys.push(camera.y - camera.range, camera.y + camera.range);
  }

  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return { x, y, width: Math.max(...xs) + margin - x, height: Math.max(...ys) + margin - y };
});

const sceneNodes = [{ id: 'scene', type: 'scene', position: { x: 0, y: 0 }, draggable: false, selectable: false, data: {} }];

const selectedRoom = computed(() => (props.selection?.kind === 'room' ? levelRooms.value.find((room) => room.id === props.selection?.id) : undefined));
const selectedCamera = computed(() => (props.selection?.kind === 'camera' ? levelCameras.value.find((camera) => camera.id === props.selection?.id) : undefined));

const showDetail = computed(() => zoom.value >= 0.45);

const scaleBar = computed(() => {
  const steps = [0.5, 1, 2, 5, 10, 20, 50];
  const meters = steps.filter((step) => step * FLOORPLAN_UNITS_PER_METER * zoom.value <= 130).pop() ?? steps[0];
  return { meters, width: Math.round(meters * FLOORPLAN_UNITS_PER_METER * zoom.value), label: `${meters} m` };
});

const connectionShapes = computed(() =>
  props.connections
    .map((connection) => ({ connection, geometry: connectionGeometry(connection, props.rooms, props.levelId) }))
    .filter((entry): entry is { connection: FloorplanConnection; geometry: ConnectionGeometry } => entry.geometry !== null),
);

const roomLabels = computed(
  () =>
    new Map(
      [...roomGroups.value].map(([roomId, parts]) => {
        const biggest = parts.reduce((best, part) => (part.width * part.height > best.width * best.height ? part : best));
        return [roomId, labelOf(biggest)];
      }),
    ),
);

const roomGroups = computed(() => {
  const groups = new Map<string, FloorplanRoom[]>();
  for (const room of levelRooms.value) groups.set(room.roomId, [...(groups.get(room.roomId) ?? []), room]);
  return groups;
});

const doorways = computed(() => {
  const perRoom = new Map<string, Segment[]>();

  for (const entry of connectionShapes.value) {
    if (entry.geometry.kind !== 'edge') continue;

    const gap: Segment = { x1: entry.geometry.x1, y1: entry.geometry.y1, x2: entry.geometry.x2, y2: entry.geometry.y2 };
    for (const roomId of [entry.connection.fromRoomId, entry.connection.toRoomId]) {
      perRoom.set(roomId, [...(perRoom.get(roomId) ?? []), gap]);
    }
  }

  return perRoom;
});

const roomShapes = computed(() => {
  const shapes = [...roomGroups.value].map(([roomId, parts]) => ({
    roomId,
    parts,
    ...roomOutline(parts, 8 / zoom.value, doorways.value.get(roomId) ?? []),
    outdoor: parts.every((part) => part.outdoor),
    publicSpace: parts.every((part) => part.publicSpace),
    selected: parts.some((part) => isSelected('room', part.id)),
  }));

  return shapes.sort((a, b) => Number(a.selected) - Number(b.selected));
});

const sightAreas = computed(() => {
  const group = new Map<string, string>();
  for (const roomId of roomGroups.value.keys()) group.set(roomId, roomId);

  const rootOf = (roomId: string): string => {
    let root = roomId;
    while (group.get(root) !== root) root = group.get(root)!;
    return root;
  };

  const outdoor = (roomId: string): boolean => (roomGroups.value.get(roomId) ?? []).every((part) => part.outdoor);

  for (const connection of props.connections) {
    if (!group.has(connection.fromRoomId) || !group.has(connection.toRoomId)) continue;
    if (!outdoor(connection.fromRoomId) || !outdoor(connection.toRoomId)) continue;

    const from = rootOf(connection.fromRoomId);
    const to = rootOf(connection.toRoomId);
    if (from !== to) group.set(from, to);
  }

  const parts = new Map<string, FloorplanRoom[]>();
  for (const [roomId, members] of roomGroups.value) {
    const root = rootOf(roomId);
    parts.set(root, [...(parts.get(root) ?? []), ...members]);
  }

  const paths = new Map<string, string>();
  for (const [root, members] of parts) paths.set(root, roomOutline(members, 8 / zoom.value, []).fill);

  return [...roomGroups.value.keys()].map((roomId) => ({ roomId, path: paths.get(rootOf(roomId)) ?? '' }));
});

const passages = computed(() =>
  connectionShapes.value.flatMap((entry) => {
    if (entry.geometry.kind !== 'edge') return [];

    const { x1, y1, x2, y2, wall } = entry.geometry;
    return [
      {
        id: entry.connection.id,
        type: entry.connection.type,
        wall,
        line: `M ${x1} ${y1} L ${x2} ${y2}`,
        handles: [
          { x: x1, y: y1 },
          { x: x2, y: y2 },
        ],
      },
    ];
  }),
);

const connectionCandidates = computed(() => {
  const room = selectedRoom.value;
  if (!room || editingLocked.value) return [];

  return levelRooms.value
    .filter((other) => other.roomId !== room.roomId)
    .map((other) => ({ other, wall: sharedWall(room, other) }))
    .filter((entry): entry is { other: FloorplanRoom; wall: Wall } => entry.wall !== null)
    .map((entry) => ({
      fromRoomId: room.roomId,
      fromShapeId: room.id,
      roomId: entry.other.roomId,
      shapeId: entry.other.id,
      x: entry.wall.x + (entry.wall.stepX * entry.wall.length) / 2,
      y: entry.wall.y + (entry.wall.stepY * entry.wall.length) / 2,
    }));
});

const flightCameras = computed(() => {
  const flight = new Map<string, string>();
  const find = (id: string): string => {
    while (flight.get(id) !== id) id = flight.get(id)!;
    return id;
  };

  for (const connection of props.connections) {
    if (connection.type !== 'stairs') continue;
    for (const id of [connection.fromRoomId, connection.toRoomId]) if (!flight.has(id)) flight.set(id, id);
    flight.set(find(connection.fromRoomId), find(connection.toRoomId));
  }

  const out: { key: string; label: string; x: number; y: number }[] = [];

  for (const room of levelRooms.value) {
    if (!flight.has(room.roomId)) continue;

    const here = find(room.roomId);
    const elsewhere = props.cameras.filter((camera) => camera.roomId !== room.roomId && flight.has(camera.roomId) && find(camera.roomId) === here);
    if (!elsewhere.length) continue;

    out.push({
      key: `${room.id}-flight`,
      label: elsewhere.map((camera) => camera.name).join(', '),
      x: room.x + room.width / 2,
      y: room.y + room.height / 2,
    });
  }

  return out;
});

const cornerBadges = computed(() => {
  const badges: { key: string; roomId: string; connectionId?: string; direction?: string; x: number; y: number }[] = [];
  const perRoom = new Map<string, number>();

  const place = (roomId: string, shapeId: string | undefined, connectionId: string | undefined, direction: string | undefined) => {
    const room = levelRooms.value.find((item) => item.id === shapeId) ?? levelRooms.value.find((item) => item.roomId === roomId);
    if (!room || room.width * zoom.value < 80 || room.height * zoom.value < 60) return;

    const index = perRoom.get(room.id) ?? 0;
    perRoom.set(room.id, index + 1);

    badges.push({
      key: connectionId ?? `stairs-${roomId}`,
      roomId,
      connectionId,
      direction,
      x: room.x + room.width - (16 + index * 30) / zoom.value,
      y: room.y + 16 / zoom.value,
    });
  };

  for (const entry of connectionShapes.value) {
    if (entry.geometry.kind !== 'badge') continue;
    place(entry.geometry.roomId, entry.geometry.shapeId, entry.connection.id, levelDirection(entry.connection, entry.geometry.roomId));
  }

  if (stairsCandidate.value) place(stairsCandidate.value.roomId, stairsCandidate.value.shapeId, undefined, undefined);

  return badges;
});

const stairsCandidate = computed(() => {
  const room = selectedRoom.value;
  if (!room || editingLocked.value) return null;

  const connected = new Set(props.connections.flatMap((connection) => [connection.fromRoomId, connection.toRoomId].join('|')));
  const reachable = props.rooms.some(
    (other) => other.levelId !== room.levelId && !connected.has([room.roomId, other.roomId].join('|')) && !connected.has([other.roomId, room.roomId].join('|')),
  );
  if (!reachable) return null;

  return { roomId: room.roomId, shapeId: room.id };
});

const viewBounds = computed(() => {
  const rect = wrapperRef.value?.getBoundingClientRect();
  const width = rect?.width ?? 0;
  const height = rect?.height ?? 0;
  return {
    left: -pan.value.x / zoom.value,
    top: -pan.value.y / zoom.value,
    right: (width - pan.value.x) / zoom.value,
    bottom: (height - pan.value.y) / zoom.value,
  };
});

const activeRooms = computed(() => new Set(levelCameras.value.filter((camera) => activity.value.has(camera.id)).map((camera) => camera.roomId)));

function labelsOfSensor(sensor: ReactiveSensor, type: string): string[] {
  switch (type) {
    case 'object':
    case 'classifier': {
      const labels = sensor.getProperty('labels');
      return Array.isArray(labels) && labels.length ? (labels as string[]) : ['other'];
    }
    case 'face':
      return ['face'];
    case 'licensePlate':
      return ['license_plate'];
    case 'motion':
    case 'audio':
      return ['motion'];
    default:
      return ['other'];
  }
}

function activityOf(cameraId: string): 'motion' | 'detection' | undefined {
  return activity.value.get(cameraId)?.level;
}

function labelsOfCamera(camera: FloorplanCamera): string[] {
  return activity.value.get(camera.id)?.labels ?? [];
}

function chipBox(camera: FloorplanCamera): { width: number; textOffset: number } {
  const icons = labelsOfCamera(camera).length;
  const textOffset = (8 + icons * 17) / zoom.value;
  return { width: textOffset + chipWidth(camera.name) - 10 / zoom.value, textOffset };
}

function onSensorEnter(event: PointerEvent, sensor: FloorplanSensor): void {
  hoveredSensorId.value = sensor.id;
  if (event.pointerType !== 'mouse') return;

  emit('hover-sensor', { sensorId: sensor.id, x: event.clientX, y: event.clientY });
}

function onSensorLeave(): void {
  hoveredSensorId.value = null;
  emit('hover-sensor', null);
}

function liveSensor(id: string): ReactiveSensor | undefined {
  return liveSensors.value.find((sensor: ReactiveSensor) => sensor.id === id);
}

function sensorStyle(sensor: FloorplanSensor): Record<string, string> {
  return sensorTone(sensor.sensorType, sensorState(liveSensor(sensor.id)));
}

function sensorLabel(sensor: FloorplanSensor): string {
  const reading = sensorReading(liveSensor(sensor.id));
  return reading ? `${sensor.name} · ${reading}` : sensor.name;
}

function levelDirection(connection: FloorplanConnection, visibleRoomId: string): string | undefined {
  const otherId = connection.fromRoomId === visibleRoomId ? connection.toRoomId : connection.fromRoomId;
  const here = props.rooms.find((room) => room.roomId === visibleRoomId)?.levelId;
  const there = props.rooms.find((room) => room.roomId === otherId)?.levelId;
  if (!here || !there) return undefined;

  const hereIndex = props.levels.findIndex((level) => level.id === here);
  const thereIndex = props.levels.findIndex((level) => level.id === there);
  if (hereIndex < 0 || thereIndex < 0 || hereIndex === thereIndex) return undefined;

  return thereIndex > hereIndex ? '↑' : '↓';
}

function onBadgeDown(event: PointerEvent, badge: { roomId: string; connectionId?: string }): void {
  if (badge.connectionId) return selectConnection(event, badge.connectionId);
  emit('request-stairs', { roomId: badge.roomId, event });
}

function labelsOf(group: { roomId: string }): RoomLabel[] {
  const label = roomLabels.value.get(group.roomId);
  return label ? [label] : [];
}

function labelOf(room: FloorplanRoom): RoomLabel | null {
  const upright = room.width >= room.height;
  const along = upright ? room.width : room.height;
  const across = upright ? room.height : room.width;

  const floor = ROOM_LABEL_MIN / zoom.value;
  const size = Math.max(Math.min(ROOM_LABEL_SIZE, across * 0.3), floor);
  if (size > across) return null;

  const available = along - size;
  const perCharacter = size * ROOM_LABEL_ASPECT;

  let text = room.name;
  if (perCharacter * text.length > available) {
    const fits = Math.floor(available / perCharacter) - 1;
    if (fits < 2) return null;
    text = `${text.slice(0, fits)}…`;
  }

  return { text, size, x: room.x + room.width / 2, y: room.y + room.height / 2 + size * 0.35, upright };
}

function onCameraEnter(event: PointerEvent, camera: FloorplanCamera): void {
  if (event.pointerType !== 'mouse') return;
  hoveredCameraId.value = camera.id;
  emit('hover-camera', { cameraId: camera.id, x: event.clientX, y: event.clientY });
}

function onCameraLeave(): void {
  hoveredCameraId.value = null;
  emit('hover-camera', null);
}

function chipWidth(name: string): number {
  return (name.length * 7 + 20) / zoom.value;
}

function stairsGlyph(x: number, y: number): string {
  const step = 4 / zoom.value;
  return `M ${x - step * 2} ${y + step * 1.5} L ${x - step} ${y + step * 1.5} L ${x - step} ${y} L ${x + step} ${y} L ${x + step} ${y - step * 1.5} L ${x + step * 2} ${y - step * 1.5}`;
}

function rad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function isSelected(kind: FloorplanSelection['kind'], id: string): boolean {
  return props.selection?.kind === kind && props.selection.id === id;
}

function conePath(camera: FloorplanCamera): string {
  const half = rad(camera.fov / 2);
  const x1 = Math.cos(-half) * camera.range;
  const y1 = Math.sin(-half) * camera.range;
  const x2 = Math.cos(half) * camera.range;
  const y2 = Math.sin(half) * camera.range;
  const largeArc = camera.fov > 180 ? 1 : 0;
  return `M 0 0 L ${x1} ${y1} A ${camera.range} ${camera.range} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function toPlan(event: PointerEvent): { x: number; y: number } {
  const rect = wrapperRef.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: (event.clientX - rect.left - pan.value.x) / zoom.value, y: (event.clientY - rect.top - pan.value.y) / zoom.value };
}

function snap(value: number): number {
  return Math.round(value / FLOORPLAN_SNAP) * FLOORPLAN_SNAP;
}

function overlaps(rect: Rect, ignoreId: string): boolean {
  return levelRooms.value.some(
    (room) => room.id !== ignoreId && rect.x < room.x + room.width && rect.x + rect.width > room.x && rect.y < room.y + room.height && rect.y + rect.height > room.y,
  );
}

function snapEdges(rect: Rect, ignoreId: string, edges: 'both' | 'end'): Rect {
  const threshold = SNAP_PX / zoom.value;
  const xCandidates = edges === 'end' ? [rect.x + rect.width] : [rect.x, rect.x + rect.width];
  const yCandidates = edges === 'end' ? [rect.y + rect.height] : [rect.y, rect.y + rect.height];

  let bestX: number | undefined;
  let bestY: number | undefined;

  for (const room of levelRooms.value) {
    if (room.id === ignoreId) continue;

    for (const edge of xCandidates) {
      for (const target of [room.x, room.x + room.width]) {
        const delta = target - edge;
        if (Math.abs(delta) <= threshold && (bestX === undefined || Math.abs(delta) < Math.abs(bestX))) bestX = delta;
      }
    }

    for (const edge of yCandidates) {
      for (const target of [room.y, room.y + room.height]) {
        const delta = target - edge;
        if (Math.abs(delta) <= threshold && (bestY === undefined || Math.abs(delta) < Math.abs(bestY))) bestY = delta;
      }
    }
  }

  guides.value = {
    x: bestX === undefined ? null : (edges === 'end' ? rect.x + rect.width : rect.x) + bestX,
    y: bestY === undefined ? null : (edges === 'end' ? rect.y + rect.height : rect.y) + bestY,
  };

  if (edges === 'end') {
    return { ...rect, width: rect.width + (bestX ?? 0), height: rect.height + (bestY ?? 0) };
  }

  return { ...rect, x: rect.x + (bestX ?? 0), y: rect.y + (bestY ?? 0) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampToRoom(roomId: string, x: number, y: number): { x: number; y: number } {
  const parts = roomGroups.value.get(roomId);
  if (!parts?.length) return { x, y };
  if (parts.some((part) => x >= part.x && x <= part.x + part.width && y >= part.y && y <= part.y + part.height)) return { x, y };

  let best = { x, y };
  let bestDistance = Infinity;

  for (const part of parts) {
    const nearest = { x: clamp(x, part.x, part.x + part.width), y: clamp(y, part.y, part.y + part.height) };
    const distance = Math.hypot(nearest.x - x, nearest.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = nearest;
    }
  }

  return best;
}

function camerasOf(roomId: string): FloorplanCamera[] {
  return levelCameras.value.filter((camera) => camera.roomId === roomId);
}

function capture(event: PointerEvent): void {
  wrapperRef.value?.setPointerCapture?.(event.pointerId);
}

function selectConnection(event: PointerEvent, id: string): void {
  selectOnTap(event, { kind: 'connection', id });
}

function startRoomDrag(event: PointerEvent, room: FloorplanRoom): void {
  selectOnTap(event, { kind: 'room', id: room.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  const point = toPlan(event);
  drag = { mode: 'room', id: room.id, offsetX: point.x - room.x, offsetY: point.y - room.y };
  capture(event);
}

function startRoomResize(event: PointerEvent, room: FloorplanRoom): void {
  emit('select', { kind: 'room', id: room.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  resizingRoomId.value = room.id;
  drag = { mode: 'resize', id: room.id, originX: room.x, originY: room.y };
  capture(event);
}

function startCameraDrag(event: PointerEvent, camera: FloorplanCamera): void {
  selectOnTap(event, { kind: 'camera', id: camera.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  const point = toPlan(event);
  drag = { mode: 'camera', id: camera.id, offsetX: point.x - camera.x, offsetY: point.y - camera.y };
  capture(event);
}

function startCameraRotate(event: PointerEvent, camera: FloorplanCamera): void {
  emit('select', { kind: 'camera', id: camera.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  drag = { mode: 'rotate', id: camera.id };
  capture(event);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;

  if (drag.mode === 'north') {
    const rect = compassRef.value?.getBoundingClientRect();
    if (!rect) return;

    const angle = (Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2)) * 180) / Math.PI;
    emit('update-north', Math.round((angle + 450) % 360));
    return;
  }

  if (!dragCommitted) {
    dragCommitted = true;
    emit('history');
  }

  const point = toPlan(event);

  if (drag.mode === 'room') {
    const dragged = drag.id;
    const room = levelRooms.value.find((item) => item.id === dragged);
    if (!room) return;

    const wanted = snapEdges({ x: snap(point.x - drag.offsetX), y: snap(point.y - drag.offsetY), width: room.width, height: room.height }, room.id, 'both');

    const trapped = overlaps(room, room.id);
    const target = trapped ? { x: wanted.x, y: wanted.y } : firstFree(room, wanted);
    if (target) emit('move-room', { id: room.id, x: target.x, y: target.y });
    return;
  }

  if (drag.mode === 'resize') {
    const resized = drag.id;
    const room = levelRooms.value.find((item) => item.id === resized);
    if (!room) return;

    const wanted = snapEdges(
      {
        x: room.x,
        y: room.y,
        width: Math.max(FLOORPLAN_MIN_ROOM, snap(point.x - drag.originX)),
        height: Math.max(FLOORPLAN_MIN_ROOM, snap(point.y - drag.originY)),
      },
      room.id,
      'end',
    );

    const width = overlaps({ ...wanted, height: room.height }, room.id) ? room.width : Math.max(FLOORPLAN_MIN_ROOM, wanted.width);
    const height = overlaps({ ...wanted, width }, room.id) ? room.height : Math.max(FLOORPLAN_MIN_ROOM, wanted.height);

    emit('resize-room', { id: room.id, width, height });
    return;
  }

  if (drag.mode === 'passage') {
    const dragged = drag;
    const connection = props.connections.find((item) => item.id === dragged.id);
    if (!connection) return;

    const current = passageOn(dragged.wall, connection.offset, connection.width);
    const centre = along(dragged.wall, { x: (current.x1 + current.x2) / 2, y: (current.y1 + current.y2) / 2 });
    const moved = along(dragged.wall, point);

    emit('move-connection', { id: dragged.id, offset: Math.round(centre + (moved - dragged.grab)) });
    dragged.grab = moved;
    return;
  }

  if (drag.mode === 'passage-resize') {
    const dragged = drag;
    const connection = props.connections.find((item) => item.id === dragged.id);
    if (!connection) return;

    const current = passageOn(dragged.wall, connection.offset, connection.width);
    const fixed = along(dragged.wall, dragged.end === 0 ? { x: current.x2, y: current.y2 } : { x: current.x1, y: current.y1 });
    const moved = Math.min(Math.max(along(dragged.wall, point), 0), dragged.wall.length);

    const width = Math.min(Math.max(Math.abs(moved - fixed), FLOORPLAN_PASSAGE_RANGE.min), FLOORPLAN_PASSAGE_RANGE.max);
    const start = moved < fixed ? fixed - width : fixed;

    emit('resize-connection', { id: dragged.id, offset: Math.round(start + width / 2), width: Math.round(width) });
    return;
  }

  if (drag.mode === 'sensor') {
    const dragged = drag.id;
    const sensor = levelSensors.value.find((item) => item.id === dragged);
    const spot = clampToRoom(sensor?.roomId ?? '', snap(point.x - drag.offsetX), snap(point.y - drag.offsetY));

    emit('move-sensor', { id: dragged, ...spot });
    return;
  }

  if (drag.mode === 'camera') {
    const dragged = drag.id;
    const camera = levelCameras.value.find((item) => item.id === dragged);
    const spot = clampToRoom(camera?.roomId ?? '', snap(point.x - drag.offsetX), snap(point.y - drag.offsetY));

    emit('move-camera', { id: dragged, ...spot });
    return;
  }

  const id = drag.id;
  const camera = levelCameras.value.find((item) => item.id === id);
  if (!camera) return;

  const deltaX = point.x - camera.x;
  const deltaY = point.y - camera.y;
  emit('rotate-camera', {
    id,
    rotation: Math.round((Math.atan2(deltaY, deltaX) * 180) / Math.PI),
    range: Math.round(clamp(Math.hypot(deltaX, deltaY), FLOORPLAN_CAMERA_RANGE.min, FLOORPLAN_CAMERA_RANGE.max)),
  });
}

function firstFree(room: FloorplanRoom, wanted: Rect): { x: number; y: number } | undefined {
  for (const candidate of [wanted, { ...wanted, y: room.y }, { ...wanted, x: room.x }]) {
    if (!overlaps(candidate, room.id)) return { x: candidate.x, y: candidate.y };
  }
  return undefined;
}

function startNorthDrag(event: PointerEvent): void {
  if (editingLocked.value) return;

  event.stopPropagation();

  emit('history');
  drag = { mode: 'north' };
  compassRef.value?.setPointerCapture?.(event.pointerId);
}

function onDrop(event: DragEvent): void {
  const raw = event.dataTransfer?.getData(FLOORPLAN_DRAG_TYPE);
  if (!raw || props.readOnly) return;

  event.preventDefault();
  const item = JSON.parse(raw) as { kind: 'room' | 'camera'; cameraId?: string };
  const rect = wrapperRef.value?.getBoundingClientRect();
  if (!rect) return;

  emit('drop', {
    ...item,
    x: snap((event.clientX - rect.left - pan.value.x) / zoom.value),
    y: snap((event.clientY - rect.top - pan.value.y) / zoom.value),
  });
}

function startSensorDrag(event: PointerEvent, sensor: FloorplanSensor): void {
  selectOnTap(event, { kind: 'sensor', id: sensor.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  const point = toPlan(event);
  drag = { mode: 'sensor', id: sensor.id, offsetX: point.x - sensor.x, offsetY: point.y - sensor.y };
  capture(event);
}

function startPassageDrag(event: PointerEvent, passage: { id: string; wall: Wall }): void {
  selectOnTap(event, { kind: 'connection', id: passage.id });
  if (editingLocked.value) return;

  event.stopPropagation();
  drag = { mode: 'passage', id: passage.id, wall: passage.wall, grab: along(passage.wall, toPlan(event)) };
  capture(event);
}

function startPassageResize(event: PointerEvent, passage: { id: string; wall: Wall }, end: 0 | 1): void {
  if (editingLocked.value) return;

  event.stopPropagation();
  drag = { mode: 'passage-resize', id: passage.id, wall: passage.wall, end };
  capture(event);
}

function along(wall: Wall, point: { x: number; y: number }): number {
  return (point.x - wall.x) * wall.stepX + (point.y - wall.y) * wall.stepY;
}

function selectOnTap(event: PointerEvent, target: FloorplanSelection): void {
  tap = { target, x: event.clientX, y: event.clientY };
}

function endDrag(event?: PointerEvent): void {
  resizingRoomId.value = null;

  if (tap) {
    const stayed = event ? Math.abs(event.clientX - tap.x) < 4 && Math.abs(event.clientY - tap.y) < 4 : false;
    if (stayed) emit('select', tap.target);
    tap = null;
  }

  if (drag?.mode === 'room' && dragCommitted) emit('settle-room', drag.id);

  drag = null;
  dragCommitted = false;
  guides.value = { x: null, y: null };
}

function fit(): void {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const room of levelRooms.value) {
    xs.push(room.x, room.x + room.width);
    ys.push(room.y, room.y + room.height);
  }

  for (const camera of levelCameras.value) {
    xs.push(camera.x - CAMERA_MARGIN, camera.x + CAMERA_MARGIN);
    ys.push(camera.y - CAMERA_MARGIN, camera.y + CAMERA_MARGIN);
  }

  if (!xs.length) return;

  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  fitBounds({ x: minX, y: minY, width: Math.max(Math.max(...xs) - minX, 1), height: Math.max(Math.max(...ys) - minY, 1) }, { padding: 0.15 });
}

watch(
  () => props.levelId,
  () => nextTick(fit),
);

onMounted(() => {
  window.addEventListener('pointerup', endDrag);
  nextTick(fit);
});

onUnmounted(() => window.removeEventListener('pointerup', endDrag));

defineExpose({ fit });
</script>

<style>
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';

/* vue flow hides a node until it has a measured size, and the scene draws
   outside its own box on purpose */
.floorplan-canvas .vue-flow__node-scene {
  width: 1px;
  height: 1px;
  overflow: visible;
}
</style>

<style scoped>
.floorplan-flow {
  width: 100%;
  height: 100%;
}

.floorplan-scene {
  position: absolute;
  overflow: visible;
  pointer-events: none;
}

.floorplan-canvas {
  --vf-node-bg: var(--card-background);
  --vf-node-text: var(--text-color);
  background: var(--content-background);
  touch-action: none;
  cursor: grab;
}

.floorplan-canvas:active {
  cursor: grabbing;
}

.room {
  fill: var(--card-background);
  stroke: none;
  pointer-events: none;
}

.room-wall {
  fill: none;
  stroke: var(--p-content-border-color);
  stroke-linecap: round;
  pointer-events: none;
}

.room-hit,
.sensor-body,
.sensor-glyph,
.camera-body,
.camera-lens,
.connection-badge,
.connection-ghost,
.passage-handle,
.handle {
  pointer-events: all;
}

.room-hit {
  fill: transparent;
  cursor: move;
}

.room-outdoor {
  fill: var(--p-primary-color);
  fill-opacity: 0.04;
}

.room-public {
  fill: url(#floorplan-public);
}

.public-base {
  fill: var(--text-muted-color);
  fill-opacity: 0.05;
}

.public-hatch {
  stroke: var(--text-muted-color);
  stroke-opacity: 0.35;
}

.room-public-wall {
  stroke: var(--text-muted-color);
  stroke-dasharray: 14 10;
}

.room-selected {
  stroke: var(--p-primary-color);
}

.room-active {
  fill: var(--p-primary-color);
  fill-opacity: 0.14;
}

.room-label {
  fill: var(--text-muted-color);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  pointer-events: none;
}

.cone {
  fill: var(--p-primary-color);
  fill-opacity: 0.12;
  pointer-events: none;
}

.cone-motion {
  fill-opacity: 0.22;
}

.cone-detection {
  fill: var(--p-primary-color);
  fill-opacity: 0.34;
}

.camera-motion {
  stroke: var(--p-primary-color);
}

.camera-detection {
  fill: var(--p-primary-color);
  stroke: var(--p-primary-color);
}

.cone-selected {
  fill-opacity: 0.22;
}

.camera-body {
  fill: var(--card-background);
  stroke: var(--p-primary-color);
  cursor: move;
}

.camera-selected {
  fill: var(--p-primary-color);
  fill-opacity: 0.2;
}

.flight-camera {
  pointer-events: all;
  cursor: help;
}

.flight-camera-body {
  fill: var(--card-background);
  stroke: var(--text-muted-color);
  stroke-dasharray: 3 3;
}

.flight-camera-lens {
  fill: var(--text-muted-color);
}

.sensor-body {
  fill: var(--card-background);
  stroke: var(--p-content-border-color);
  cursor: move;
}

.sensor-selected {
  stroke: var(--p-primary-color);
}

.sensor-glyph {
  pointer-events: none;
  overflow: visible;
}

.camera-lens {
  fill: var(--p-primary-color);
  pointer-events: none;
}

.camera-chip {
  pointer-events: none;
}

.camera-chip rect {
  fill: var(--p-primary-color);
}

.chip-glyph {
  color: #ffffff;
  pointer-events: none;
  overflow: visible;
}

.camera-chip text {
  fill: #ffffff;
  font-weight: 600;
}

.connection {
  stroke: var(--p-primary-color);
  fill: none;
  cursor: pointer;
  stroke-linecap: round;
}

.connection-hit {
  fill: none;
  stroke: transparent;
  stroke-linecap: round;
  pointer-events: stroke;
  cursor: grab;
}

.connection-opening {
  stroke: var(--p-text-muted-color);
  stroke-dasharray: 2 7;
  stroke-linecap: round;
}

.passage-handle {
  fill: var(--card-background);
  stroke: var(--p-primary-color);
  cursor: pointer;
}

.connection-stairs {
  stroke: var(--text-muted-color);
  stroke-dasharray: 10 6;
}

.connection-selected {
  stroke: var(--p-primary-color);
  filter: brightness(1.3);
}

.connection-badge {
  fill: var(--card-background);
  stroke: var(--p-primary-color);
  cursor: pointer;
}

.connection-ghost {
  fill: var(--card-background);
  stroke: var(--p-primary-color);
  stroke-dasharray: 4 3;
  cursor: pointer;
}

.connection-ghost:hover {
  fill: var(--p-primary-color);
  fill-opacity: 0.15;
}

.badge-glyph {
  stroke: var(--p-primary-color);
  pointer-events: none;
}

.badge-direction {
  fill: var(--text-muted-color);
  font-weight: 700;
  pointer-events: none;
}

.connection-ghost-plus {
  stroke: var(--p-primary-color);
  pointer-events: none;
}

.guide {
  stroke: var(--p-primary-color);
  stroke-dasharray: 6 4;
  fill: none;
  pointer-events: none;
}

.handle {
  fill: var(--card-background);
  stroke: var(--p-primary-color);
  cursor: pointer;
}

.floorplan-compass {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 2px;
  line-height: 0;
  touch-action: none;
}

.compass-ring {
  fill: none;
  stroke: var(--border-color);
}

.compass-needle {
  fill: var(--p-primary-color);
}

.compass-label {
  fill: var(--text-muted-color);
  font-weight: 700;
}

.floorplan-scale {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.scale-line {
  stroke: var(--text-muted-color);
  fill: none;
}

.floorplan-controls {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.control-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--text-color);
  cursor: pointer;
}

.control-button + .control-button {
  border-top: 1px solid var(--border-color);
}

.control-button:hover {
  background: var(--content-background);
}

.control-active {
  color: var(--p-primary-color);
}
</style>
