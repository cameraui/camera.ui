<template>
  <div class="h-full flex flex-col overflow-hidden">
    <div class="flex items-center gap-2 px-4 py-3 border-bottom-color">
      <div class="flex items-center justify-center w-8 h-8 rounded-md shrink-0 inspector-icon">
        <i-mdi:cctv v-if="camera" class="w-4 h-4" />
        <i-mdi:door-open v-else-if="connection" class="w-4 h-4" />
        <i-mdi:vector-square v-else class="w-4 h-4" />
      </div>
      <div class="flex-1 min-w-0">
        <div class="text-sm font-semibold truncate text-color">{{ room?.name ?? camera?.name ?? sensor?.name ?? connectionTitle }}</div>
        <div class="text-xs text-muted truncate">{{ subtitle }}</div>
      </div>
      <Button severity="secondary" text rounded class="shrink-0 cui-icon-sm" @click="emit('close')">
        <template #icon>
          <i-mdi:close width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <div class="flex-1 overflow-y-auto">
      <Accordion multiple :value="openPanels" :class="fluid ? 'w-full' : 'w-[300px]'">
        <AccordionPanel v-if="room" value="general">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ $t('views.floorplan.section_room') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: fluid ? 'px-4 w-full' : 'px-4 w-[300px]' } }">
            <div class="flex flex-col gap-6">
              <div v-if="roomChoices.length > 1" class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.belongs_to') }}</label>
                <Select
                  :model-value="room.roomId"
                  :options="roomChoices"
                  option-label="label"
                  option-value="value"
                  :disabled="readOnly"
                  @update:model-value="(value) => value && patchRoom({ roomId: value })"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.belongs_to_hint') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.room_name') }}</label>
                <InputText :model-value="room.name" :disabled="readOnly" @update:model-value="(value) => patchRoom({ name: value ?? '' })" />
                <Message v-if="partCount > 1" severity="secondary" variant="simple" size="small" class="cui-input-hint">
                  {{ $t('views.floorplan.room_parts', { count: partCount }) }}
                </Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.level') }}</label>
                <Select
                  :model-value="room.levelId"
                  :options="levelOptions"
                  option-label="label"
                  option-value="value"
                  @update:model-value="(value) => patchRoom({ levelId: value })"
                />
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.room_kind') }}</label>
                <Select
                  :model-value="roomKind"
                  :options="roomKindOptions"
                  option-label="label"
                  option-value="value"
                  :disabled="readOnly"
                  @update:model-value="(value) => patchRoom(kindPatch(value))"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t(`views.floorplan.room_kind_${roomKind}_hint`) }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.note') }}</label>
                <Textarea
                  :model-value="room.note"
                  :disabled="readOnly"
                  :maxlength="FLOORPLAN_NOTE_MAX"
                  rows="3"
                  auto-resize
                  @update:model-value="(value) => patchRoom({ note: value ?? '' })"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.note_hint') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.size') }}</label>
                <span class="text-sm text-muted">{{ metersLabel(room.width) }} x {{ metersLabel(room.height) }}</span>
              </div>
            </div>
          </AccordionContent>
        </AccordionPanel>

        <AccordionPanel v-if="connection" value="general">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ $t('views.floorplan.section_connection') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: fluid ? 'px-4 w-full' : 'px-4 w-[300px]' } }">
            <div class="flex flex-col field-gap">
              <label class="cui-label">{{ $t('views.floorplan.connection_type') }}</label>
              <Select
                v-if="!crossLevel"
                :model-value="connection.type"
                :options="connectionTypeOptions"
                option-label="label"
                option-value="value"
                :disabled="readOnly"
                @update:model-value="(value) => emit('update-connection', { id: connection!.id, patch: { type: value } })"
              />
              <span v-else class="text-sm text-color">{{ $t('views.floorplan.connection_stairs') }}</span>
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
                {{ crossLevel ? $t('views.floorplan.connection_level_hint') : $t('views.floorplan.connection_type_hint') }}
              </Message>
            </div>

            <div v-if="!crossLevel" class="flex flex-col field-gap mt-6">
              <label class="cui-label">{{ $t('views.floorplan.connection_width', { value: toMeters(connection.width).toFixed(2) }) }}</label>
              <Slider
                :model-value="connection.width"
                :disabled="readOnly"
                :min="FLOORPLAN_PASSAGE_RANGE.min"
                :max="FLOORPLAN_PASSAGE_RANGE.max"
                :step="5"
                @update:model-value="(value) => emit('update-connection', { id: connection!.id, patch: { width: Number(value) } })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.connection_width_hint') }}</Message>
            </div>

            <div class="flex flex-col field-gap mt-6">
              <label class="cui-label">{{ $t('views.floorplan.note') }}</label>
              <Textarea
                :model-value="connection.note"
                :disabled="readOnly"
                :maxlength="FLOORPLAN_NOTE_MAX"
                rows="3"
                auto-resize
                @update:model-value="(value) => emit('update-connection', { id: connection!.id, patch: { note: value ?? '' } })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.note_hint') }}</Message>
            </div>
          </AccordionContent>
        </AccordionPanel>

        <AccordionPanel v-if="sensor" value="general">
          <AccordionHeader class="px-4 rounded-none!">
            <span class="text-color font-normal text-sm">{{ $t('views.floorplan.section_sensor') }}</span>
          </AccordionHeader>
          <AccordionContent :pt="{ content: { class: fluid ? 'px-4 w-full' : 'px-4 w-[300px]' } }">
            <div class="flex flex-col gap-6">
              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.assigned_room') }}</label>
                <Select
                  :model-value="sensor.roomId"
                  :options="sensorRoomOptions"
                  :disabled="readOnly"
                  option-label="label"
                  option-value="value"
                  @update:model-value="(value) => value && patchSensor({ roomId: value })"
                />
              </div>

              <div v-if="passageOptions.length" class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.sensor_passage') }}</label>
                <Select
                  :model-value="sensor.connectionId"
                  :options="passageOptions"
                  :disabled="readOnly"
                  option-label="label"
                  option-value="value"
                  show-clear
                  @update:model-value="(value) => patchSensor({ connectionId: value ?? null })"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.sensor_passage_hint') }}</Message>
              </div>

              <div class="flex flex-col field-gap">
                <label class="cui-label">{{ $t('views.floorplan.note') }}</label>
                <Textarea
                  :model-value="sensor.note"
                  :disabled="readOnly"
                  :maxlength="FLOORPLAN_NOTE_MAX"
                  rows="3"
                  auto-resize
                  @update:model-value="(value) => patchSensor({ note: value ?? '' })"
                />
                <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.note_hint') }}</Message>
              </div>
            </div>
          </AccordionContent>
        </AccordionPanel>

        <template v-if="camera">
          <AccordionPanel value="general">
            <AccordionHeader class="px-4 rounded-none!">
              <span class="text-color font-normal text-sm">{{ $t('views.floorplan.section_camera') }}</span>
            </AccordionHeader>
            <AccordionContent :pt="{ content: { class: fluid ? 'px-4 w-full' : 'px-4 w-[300px]' } }">
              <div class="flex flex-col gap-6">
                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.floorplan.assigned_room') }}</label>
                  <Select
                    :model-value="camera.roomId"
                    :options="roomOptions"
                    :disabled="readOnly"
                    option-label="label"
                    option-value="value"
                    @update:model-value="(value) => value && patchCamera({ roomId: value })"
                  />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.assigned_room_hint') }}</Message>
                </div>

                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.floorplan.note') }}</label>
                  <Textarea
                    :model-value="camera.note"
                    :disabled="readOnly"
                    :maxlength="FLOORPLAN_NOTE_MAX"
                    rows="3"
                    auto-resize
                    @update:model-value="(value) => patchCamera({ note: value ?? '' })"
                  />
                  <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.floorplan.note_hint') }}</Message>
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>

          <AccordionPanel value="view">
            <AccordionHeader class="px-4 rounded-none!">
              <span class="text-color font-normal text-sm">{{ $t('views.floorplan.section_view') }}</span>
            </AccordionHeader>
            <AccordionContent :pt="{ content: { class: fluid ? 'px-4 w-full' : 'px-4 w-[300px]' } }">
              <div class="flex flex-col gap-6">
                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.floorplan.direction', { value: normalizedRotation }) }}</label>
                  <Slider
                    :model-value="normalizedRotation"
                    :disabled="readOnly"
                    :min="0"
                    :max="359"
                    @update:model-value="(value) => patchCamera({ rotation: Number(value) })"
                  />
                </div>

                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.floorplan.fov', { value: camera.fov }) }}</label>
                  <Slider :model-value="camera.fov" :disabled="readOnly" :min="30" :max="180" @update:model-value="(value) => patchCamera({ fov: Number(value) })" />
                </div>

                <div class="flex flex-col field-gap">
                  <label class="cui-label">{{ $t('views.floorplan.range', { value: toMeters(camera.range).toFixed(1) }) }}</label>
                  <Slider
                    :disabled="readOnly"
                    :model-value="camera.range"
                    :min="FLOORPLAN_CAMERA_RANGE.min"
                    :max="FLOORPLAN_CAMERA_RANGE.max"
                    :step="50"
                    @update:model-value="(value) => patchCamera({ range: Number(value) })"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionPanel>
        </template>
      </Accordion>
    </div>

    <div v-if="!readOnly" class="p-4 border-top-color">
      <Button
        severity="danger"
        fluid
        class="w-full cui-button-medium"
        :label="
          room
            ? $t('views.floorplan.delete_room')
            : connection
              ? $t('views.floorplan.remove_connection')
              : sensor
                ? $t('views.floorplan.remove_sensor')
                : $t('views.floorplan.remove_camera')
        "
        @click="onRemove"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { FLOORPLAN_CAMERA_RANGE, FLOORPLAN_CONNECTION_TYPES, FLOORPLAN_NOTE_MAX, FLOORPLAN_PASSAGE_RANGE } from './types.js';
import { metersLabel, sharedWall, toMeters } from './utils.js';

import type { CuiFloorplanInspectorEmits, CuiFloorplanInspectorProps, FloorplanCamera, FloorplanRoom, FloorplanSensor } from './types.js';

const props = defineProps<CuiFloorplanInspectorProps>();

const emit = defineEmits<CuiFloorplanInspectorEmits>();

const { t } = useI18n();

const openPanels = ref(['general', 'view']);

const room = computed(() => (props.selection?.kind === 'room' ? props.rooms.find((item) => item.id === props.selection?.id) : undefined));
const camera = computed(() => (props.selection?.kind === 'camera' ? props.cameras.find((item) => item.id === props.selection?.id) : undefined));

const levelOptions = computed(() => props.levels.map((level) => ({ label: level.name, value: level.id })));

const roomKind = computed(() => (!room.value?.outdoor ? 'indoor' : room.value.publicSpace ? 'public' : 'outdoor'));

const roomKindOptions = computed(() => (['indoor', 'outdoor', 'public'] as const).map((kind) => ({ label: t(`views.floorplan.room_kind_${kind}`), value: kind })));

const partCount = computed(() => (room.value ? props.rooms.filter((item) => item.roomId === room.value?.roomId).length : 0));

const roomChoices = computed(() => {
  const part = room.value;
  if (!part) return [];

  const seen = new Set<string>();
  const options = [{ label: part.name, value: part.roomId }];
  seen.add(part.roomId);

  for (const other of props.rooms) {
    if (other.roomId === part.roomId || seen.has(other.roomId) || other.levelId !== part.levelId) continue;
    if (!sharedWall(part, other)) continue;

    seen.add(other.roomId);
    options.push({ label: other.name, value: other.roomId });
  }

  return options;
});

const roomOptions = computed(() => {
  const seen = new Set<string>();
  return props.rooms
    .filter((item) => item.levelId === camera.value?.levelId && !seen.has(item.roomId) && seen.add(item.roomId))
    .map((item) => ({ label: item.name, value: item.roomId }));
});

const sensor = computed(() => (props.selection?.kind === 'sensor' ? props.sensors.find((item) => item.id === props.selection?.id) : undefined));

const sensorRoomOptions = computed(() => {
  const seen = new Set<string>();
  return props.rooms
    .filter((item) => item.levelId === sensor.value?.levelId && !seen.has(item.roomId) && seen.add(item.roomId))
    .map((item) => ({ label: item.name, value: item.roomId }));
});

const passageOptions = computed(() => {
  if (!sensor.value) return [];

  return props.connections
    .filter((item) => item.fromRoomId === sensor.value?.roomId || item.toRoomId === sensor.value?.roomId)
    .map((item) => {
      const other = item.fromRoomId === sensor.value?.roomId ? item.toRoomId : item.fromRoomId;
      return { label: props.rooms.find((room) => room.roomId === other)?.name ?? other, value: item.id };
    });
});

const connection = computed(() => (props.selection?.kind === 'connection' ? props.connections.find((item) => item.id === props.selection?.id) : undefined));

const crossLevel = computed(() => {
  if (!connection.value) return false;
  const from = props.rooms.find((room) => room.roomId === connection.value?.fromRoomId);
  const to = props.rooms.find((room) => room.roomId === connection.value?.toRoomId);
  return !!from && !!to && from.levelId !== to.levelId;
});

const connectionTypeOptions = computed(() =>
  FLOORPLAN_CONNECTION_TYPES.filter((type) => type !== 'stairs').map((type) => ({ label: t(`views.floorplan.connection_${type}`), value: type })),
);

const connectionTitle = computed(() => {
  if (!connection.value) return '';
  const from = props.rooms.find((room) => room.roomId === connection.value?.fromRoomId)?.name ?? '';
  const to = props.rooms.find((room) => room.roomId === connection.value?.toRoomId)?.name ?? '';
  return `${from} · ${to}`;
});

const normalizedRotation = computed(() => (((camera.value?.rotation ?? 0) % 360) + 360) % 360);

const subtitle = computed(() => {
  if (sensor.value) return sensor.value.owner || (props.rooms.find((item) => item.roomId === sensor.value?.roomId)?.name ?? '');
  if (room.value) return props.levels.find((level) => level.id === room.value?.levelId)?.name ?? '';
  if (connection.value) return t(`views.floorplan.connection_${connection.value.type}`);
  if (!camera.value) return '';
  return props.rooms.find((item) => item.roomId === camera.value?.roomId)?.name ?? t('views.floorplan.no_room');
});

function patchSensor(patch: Partial<FloorplanSensor>): void {
  if (!sensor.value) return;
  emit('update-sensor', { id: sensor.value.id, patch });
}

function kindPatch(kind: string): Partial<FloorplanRoom> {
  return { outdoor: kind !== 'indoor', publicSpace: kind === 'public' };
}

function patchRoom(patch: Partial<FloorplanRoom>): void {
  if (!room.value) return;
  emit('update-room', { id: room.value.id, patch });
}

function patchCamera(patch: Partial<FloorplanCamera>): void {
  if (!camera.value) return;
  emit('update-camera', { id: camera.value.id, patch });
}

function onRemove(): void {
  if (room.value) emit('remove', { kind: 'room', id: room.value.id });
  else if (sensor.value) emit('remove', { kind: 'sensor', id: sensor.value.id });
  else if (camera.value) emit('remove', { kind: 'camera', id: camera.value.id });
  else if (connection.value) emit('remove', { kind: 'connection', id: connection.value.id });
}
</script>

<style scoped>
.inspector-icon {
  background: var(--p-primary-color);
  color: var(--p-primary-color);
  background-color: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
}
</style>
