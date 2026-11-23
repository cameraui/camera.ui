<template>
  <div class="flex flex-col gap-4 w-full">
    <div v-if="hasTile" class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.sensors.control') }}</label>
      <CuiSensorTile v-if="liveSensor" :sensor="liveSensor" size="large" :disabled="!canControl" />
      <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.sensors.control_offline') }}
      </Message>
    </div>

    <div class="flex flex-col field-gap">
      <label for="sensorDisplayName" class="cui-label">{{ device ? $t('views.sensors.device_name') : $t('components.camera_options.sensor_display_name') }}</label>
      <InputText id="sensorDisplayName" v-model.trim="displayName" class="w-full" />
      <Message v-if="sensor.device && !device" severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.sensors.short_name_hint') }}
      </Message>
    </div>

    <div v-if="sensor.nativeId" class="flex flex-col field-gap">
      <label for="sensorNativeId" class="cui-label">{{ $t('views.sensors.native_id') }}</label>
      <InputText id="sensorNativeId" :model-value="sensor.nativeId" readonly class="w-full font-mono text-sm" />
    </div>

    <template v-if="sensor.virtual">
      <CuiVirtualSensorCapabilities
        :sensor-id="sensor.id"
        :type="sensor.type as VirtualSensorType"
        :capabilities="sensor.capabilities"
        :property-specs="sensor.propertySpecs"
      />
      <CuiVirtualDeviceField v-model="device" :devices="devices" />
    </template>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('components.form.label.room') }}</label>
      <CuiRoomSelect v-model="roomId" clearable :disabled="sensor.assignmentLocked" :placeholder="$t('views.sensors.no_room')" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ sensor.assignmentLocked ? $t('views.sensors.room_locked_hint') : $t('views.sensors.room_hint') }}
      </Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.sensors.assigned_cameras') }}</label>
      <div v-if="sensor.assignmentLocked" class="flex flex-wrap gap-2">
        <Chip v-for="camera in lockedCameras" :key="camera.value" :label="camera.label" />
      </div>
      <MultiSelect
        v-else
        v-model="assignedCameraIds"
        :options="cameraOptions"
        option-label="label"
        option-value="value"
        :placeholder="$t('views.sensors.assigned_cameras_placeholder')"
        class="w-full"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ sensor.assignmentLocked ? $t('views.sensors.assigned_cameras_locked_hint') : $t('views.sensors.assigned_cameras_hint') }}
      </Message>
    </div>

    <CuiToggleRow v-if="!(sensor.cameraBound && sensor.assignmentLocked)" :label="$t('views.sensors.exposed')" :hint="$t('views.sensors.exposed_hint')">
      <ToggleSwitch v-model="exposed" />
    </CuiToggleRow>
  </div>
</template>

<script setup lang="ts">
import { useAllSensors } from '@camera.ui/browser';

import CuiSensorTile from '@/components/CuiSensorTile/CuiSensorTile.vue';
import { hasSensorTile } from '@/components/CuiSensorTile/tiles.js';
import CuiVirtualDeviceField from '@/components/CuiVirtualDeviceField/CuiVirtualDeviceField.vue';
import { isIncompleteChoice } from '@/components/CuiVirtualDeviceField/types.js';
import CuiVirtualSensorCapabilities from '@/components/CuiVirtualSensorCapabilities/CuiVirtualSensorCapabilities.vue';

import type { VirtualDeviceChoice } from '@/components/CuiVirtualDeviceField/types.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { VirtualSensorType } from '@shared/types';
import type { SensorEditProps, SensorEditResult } from './types.js';

const props = defineProps<SensorEditProps>();

const displayName = ref(props.device?.name ?? (props.sensor.shortName || props.sensor.name));
const assignedCameraIds = ref<string[]>([...props.sensor.assignedCameraIds]);
const exposed = ref(props.sensor.exposed);
const roomId = ref(props.sensor.roomId ?? null);
const device = ref<VirtualDeviceChoice>({ deviceId: props.sensor.device?.id ?? null, newName: null });

const { t } = useI18n();
const toast = useCuiToast();

const { sensors: allSensors } = useAllSensors();

const canControl = computed(() => hasPermission(undefined, 'admin'));
const lockedCameras = computed(() => props.cameraOptions.filter((camera) => props.sensor.assignedCameraIds.includes(camera.value)));
const hasTile = computed(() => hasSensorTile(props.sensor.type));
const liveSensor = computed(() => allSensors.value.find((sensor) => sensor.id === props.sensor.id));

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<SensorEditResult | null> => {
    if (isIncompleteChoice(device.value)) {
      toast.add({ severity: 'error', detail: t('components.toast.validation_failed'), life: 3000 });
      return null;
    }

    const deviceId = props.sensor.device?.id ?? null;
    return {
      displayName: displayName.value || (props.device?.sourceName ?? props.sensor.name),
      assignedCameraIds: assignedCameraIds.value,
      exposed: exposed.value,
      roomId: roomId.value !== (props.sensor.roomId ?? null) ? roomId.value : undefined,
      deviceId: device.value.newName === null && device.value.deviceId !== deviceId ? device.value.deviceId : undefined,
      newDeviceName: device.value.newName?.trim() || undefined,
    };
  },
});
</script>
