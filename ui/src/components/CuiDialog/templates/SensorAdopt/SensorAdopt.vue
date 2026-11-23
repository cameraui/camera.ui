<template>
  <div class="flex flex-col gap-4 w-full">
    <span class="text-sm text-muted">{{ source }}</span>

    <div class="flex flex-col field-gap">
      <label for="adoptName" class="cui-label">{{ device ? $t('views.sensors.device_name') : $t('components.camera_options.sensor_display_name') }}</label>
      <InputText id="adoptName" v-model.trim="name" class="w-full" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.room') }}</label>
      <CuiRoomSelect v-model="roomId" clearable :new-room="area" :placeholder="$t('views.sensors.no_room')" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ roomHint }}</Message>
    </div>

    <div v-if="!device" class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.sensors.assigned_cameras') }}</label>
      <MultiSelect
        v-model="assignedCameraIds"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('views.sensors.assigned_cameras_placeholder')"
        class="w-full"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.sensors.assigned_cameras_hint') }}</Message>
    </div>

    <CuiToggleRow :label="$t('views.sensors.exposed')" :hint="$t('views.sensors.exposed_hint')">
      <ToggleSwitch v-model="exposed" />
    </CuiToggleRow>
  </div>
</template>

<script setup lang="ts">
import { RoomsQuery } from '@/api/routes/rooms.js';
import { NEW_ROOM } from '@/components/CuiRoomSelect/rooms.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { AdoptSensorSettings } from '@shared/types';
import type { SensorAdoptProps } from './types.js';

const props = defineProps<SensorAdoptProps>();

const { t } = useI18n();

const { data: catalog } = new RoomsQuery().getRoomsQuery();

const area = props.items.map((item) => item.room?.trim()).find(Boolean);
const name = ref(props.name);
const roomId = ref<string | null>(null);
const assignedCameraIds = ref<string[]>([]);
const exposed = ref(false);

const source = computed(() =>
  props.device
    ? t('views.sensors.adopt_device_source', { count: props.items.length, plugin: props.pluginName })
    : t('views.sensors.adopt_source', { plugin: props.pluginName }),
);
const roomHint = computed(() => {
  if (area) return t('views.sensors.adopt_room_area', { plugin: props.pluginName, area });
  return props.device ? t('views.sensors.device_room_hint') : t('views.sensors.room_hint');
});

whenever(
  catalog,
  (value) => {
    if (!area) return;
    const match = value.rooms.find((room) => room.name.toLowerCase() === area.toLowerCase());
    roomId.value = match?.id ?? NEW_ROOM;
  },
  { immediate: true, once: true },
);

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<AdoptSensorSettings> => {
    const renamed = name.value && name.value !== props.name ? name.value : undefined;
    const room = roomId.value === NEW_ROOM ? { roomName: area } : { roomId: roomId.value };
    if (props.device) return { ...room, deviceName: renamed, exposed: exposed.value };
    return { ...room, displayName: renamed, exposed: exposed.value, ...(assignedCameraIds.value.length ? { assignedCameraIds: assignedCameraIds.value } : {}) };
  },
});
</script>
