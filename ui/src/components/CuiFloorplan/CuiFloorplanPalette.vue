<template>
  <div class="overflow-y-auto p-3" :class="mode === 'drag' ? 'h-full' : ''">
    <div v-if="mode === 'drag'" class="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
      {{ $t('views.floorplan.palette') }}
    </div>

    <Message v-if="disabled" severity="secondary" variant="simple" size="small" class="cui-input-hint mb-3">{{ $t('views.floorplan.needs_level') }}</Message>

    <div class="mb-4">
      <div class="text-xs font-medium text-muted mb-2">{{ $t('views.floorplan.section_room') }}</div>
      <div
        class="floorplan-palette-item"
        :class="[mode === 'drag' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', { 'palette-disabled': disabled }]"
        :draggable="mode === 'drag' && !disabled"
        @dragstart="onDragStart($event, 'room')"
        @click="!disabled && emit('pick', { kind: 'room' })"
      >
        <div class="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2.5">
          <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 palette-icon">
            <i-mdi:vector-square class="w-4 h-4" />
          </div>
          <span class="text-[13px] font-medium truncate text-color leading-tight">{{ $t('views.floorplan.new_room') }}</span>
        </div>
      </div>

      <div v-if="rooms.length" class="flex flex-col gap-1.5 mt-1.5">
        <div
          v-for="room in rooms"
          :key="room.id"
          v-tooltip.right="{ value: $t('views.floorplan.room_not_drawn') }"
          class="floorplan-palette-item"
          :class="[mode === 'drag' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', { 'palette-disabled': disabled }]"
          :draggable="mode === 'drag' && !disabled"
          @dragstart="onDragStart($event, 'room', undefined, room.id)"
          @click="!disabled && emit('pick', { kind: 'room', roomId: room.id })"
        >
          <div class="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2.5">
            <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 palette-icon">
              <i-mdi:vector-square-plus class="w-4 h-4" />
            </div>
            <span class="text-[13px] font-medium truncate text-color leading-tight">{{ room.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="mb-4">
      <div class="text-xs font-medium text-muted mb-2">{{ $t('views.floorplan.section_cameras') }}</div>

      <span v-if="!cameras.length" class="text-xs text-muted px-1">{{ $t('views.floorplan.all_cameras_placed') }}</span>

      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="camera in cameras"
          :key="camera.id"
          class="floorplan-palette-item"
          :class="[mode === 'drag' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', { 'palette-disabled': disabled }]"
          :draggable="mode === 'drag' && !disabled"
          @dragstart="onDragStart($event, 'camera', camera.id)"
          @click="!disabled && emit('pick', { kind: 'camera', cameraId: camera.id })"
        >
          <div class="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2.5">
            <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 palette-icon">
              <i-mdi:cctv class="w-4 h-4" />
            </div>
            <span class="text-[13px] font-medium truncate text-color leading-tight">{{ camera.name }}</span>
          </div>
        </div>
      </div>
    </div>
    <div>
      <div class="text-xs font-medium text-muted mb-2">{{ $t('views.floorplan.section_sensors') }}</div>

      <span v-if="!sensors.length" class="text-xs text-muted px-1">{{ $t('views.floorplan.all_sensors_placed') }}</span>

      <div v-else class="flex flex-col gap-1.5">
        <div
          v-for="sensor in sensors"
          :key="sensor.id"
          class="floorplan-palette-item"
          :class="[mode === 'drag' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', { 'palette-disabled': disabled }]"
          :draggable="mode === 'drag' && !disabled"
          @dragstart="onDragStart($event, 'sensor', undefined, undefined, sensor)"
          @click="!disabled && emit('pick', { kind: 'sensor', sensorId: sensor.id, sensorType: sensor.sensorType })"
        >
          <div class="flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2.5">
            <div class="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 palette-icon">
              <component :is="sensorIcon(sensor.sensorType, undefined)" class="w-4 h-4" />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-[13px] font-medium truncate text-color leading-tight">{{ sensor.name }}</span>
              <span v-if="sensor.subtitle" class="text-[11px] text-muted truncate leading-tight">{{ sensor.subtitle }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorIcon } from '@/components/CuiSensors/display.js';
import { FLOORPLAN_DRAG_TYPE } from './types.js';

import type { CuiFloorplanPaletteEmits, CuiFloorplanPaletteProps, FloorplanPaletteSensor } from './types.js';

const props = withDefaults(defineProps<CuiFloorplanPaletteProps>(), { mode: 'drag' });

const emit = defineEmits<CuiFloorplanPaletteEmits>();

function onDragStart(event: DragEvent, kind: 'room' | 'camera' | 'sensor', cameraId?: string, roomId?: string, sensor?: FloorplanPaletteSensor): void {
  if (props.disabled || !event.dataTransfer) return;
  event.dataTransfer.setData(FLOORPLAN_DRAG_TYPE, JSON.stringify({ kind, cameraId, roomId, sensorId: sensor?.id, sensorType: sensor?.sensorType }));
  event.dataTransfer.effectAllowed = 'move';
}
</script>

<style scoped>
.floorplan-palette-item {
  display: flex;
  align-items: stretch;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--card-background);
  overflow: hidden;
}

.floorplan-palette-item:hover {
  border-color: var(--p-primary-color);
}

.palette-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.palette-icon {
  color: var(--p-primary-color);
  background-color: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}
</style>
