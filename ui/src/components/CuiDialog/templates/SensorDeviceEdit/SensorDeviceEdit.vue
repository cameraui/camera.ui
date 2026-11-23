<template>
  <div class="flex flex-col gap-4 w-full">
    <div class="flex flex-col field-gap">
      <label for="sensorDeviceName" class="cui-label">{{ $t('views.sensors.device_name') }}</label>
      <InputText id="sensorDeviceName" v-model.trim="displayName" :placeholder="device.sourceName" class="w-full" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.sensors.device_name_hint') }}
      </Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.room') }}</label>
      <CuiRoomSelect v-model="roomId" clearable :placeholder="$t('views.sensors.no_room')" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.sensors.device_room_hint') }}
      </Message>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div v-for="field in infoFields" :key="field.label" class="flex flex-col field-gap min-w-0 sm:last:odd:col-span-2">
        <label class="cui-label">{{ field.label }}</label>
        <InputText :model-value="field.value" readonly class="w-full" :class="{ 'font-mono text-sm': field.mono }" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.sensors.device_sensors_title') }}</label>
      <div class="flex flex-wrap gap-2">
        <Chip v-for="sensor in sensors" :key="sensor.id">
          <component :is="sensorTypeIcon(sensor.type)" class="w-4 h-4 shrink-0" />
          <span class="text-sm">{{ sensor.shortName }}</span>
          <i-mdi:star v-if="sensor.primary" v-tooltip="$t('views.sensors.main_sensor')" class="w-3.5 h-3.5 shrink-0 text-muted" />
        </Chip>
      </div>
    </div>

    <CuiToggleRow :label="$t('views.sensors.device_exposed')" :hint="$t('views.sensors.device_exposed_hint')">
      <ToggleSwitch v-model="exposed" />
    </CuiToggleRow>
  </div>
</template>

<script setup lang="ts">
import { sensorTypeIcon } from '@/common/sensorDisplay.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { SensorDeviceEditProps, SensorDeviceEditResult } from './types.js';

const props = defineProps<SensorDeviceEditProps>();

const { t } = useI18n();

const exposedBefore = props.sensors.every((sensor) => sensor.exposed);
const roomBefore = (props.sensors.find((sensor) => sensor.primary) ?? props.sensors[0])?.roomId ?? null;

const displayName = ref(props.device.name);
const exposed = ref(exposedBefore);
const roomId = ref(roomBefore);

const infoFields = computed(() =>
  [
    { label: t('views.sensors.manufacturer'), value: props.device.manufacturer },
    { label: t('views.sensors.model'), value: props.device.model },
    { label: t('views.sensors.firmware'), value: props.device.firmware },
    { label: t('views.sensors.serial_number'), value: props.device.serialNumber, mono: true },
    { label: t('views.sensors.plugin'), value: props.pluginName },
  ].filter((field) => field.value),
);

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<SensorDeviceEditResult> => ({
    displayName: displayName.value || props.device.sourceName,
    ...(exposed.value !== exposedBefore ? { exposed: exposed.value } : {}),
    ...(roomId.value !== roomBefore ? { roomId: roomId.value } : {}),
  }),
});
</script>
