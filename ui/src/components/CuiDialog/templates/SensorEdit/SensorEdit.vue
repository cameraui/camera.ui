<template>
  <div class="flex flex-col gap-4 w-full">
    <div v-if="hasWidget" class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.sensors.control') }}</label>
      <CuiSensorControl v-if="liveSensor" :sensor="liveSensor" :disabled="!canControl" />
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

    <CuiToggleRow v-if="!sensor.cameraBound" :label="$t('views.sensors.exposed')" :hint="$t('views.sensors.exposed_hint')">
      <ToggleSwitch v-model="exposed" />
    </CuiToggleRow>
  </div>
</template>

<script setup lang="ts">
import { useAllSensors } from '@camera.ui/browser';

import CuiSensorControl from '@/components/CuiSensorControl/CuiSensorControl.vue';
import { hasSensorControlWidget } from '@/components/CuiSensorControl/types.js';

import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { SensorEditProps, SensorEditResult } from './types.js';

const props = defineProps<SensorEditProps>();

const displayName = ref(props.device?.name ?? (props.sensor.shortName || props.sensor.name));
const assignedCameraIds = ref<string[]>([...props.sensor.assignedCameraIds]);
const exposed = ref(props.sensor.exposed);

const { sensors: allSensors } = useAllSensors();

const canControl = computed(() => hasPermission(undefined, 'admin'));
const lockedCameras = computed(() => props.cameraOptions.filter((camera) => props.sensor.assignedCameraIds.includes(camera.value)));
const hasWidget = computed(() => hasSensorControlWidget(props.sensor.type));
const liveSensor = computed(() => allSensors.value.find((sensor) => sensor.id === props.sensor.id));

defineExpose<CustomDialogComponent>({
  onConfirm: async (): Promise<SensorEditResult> => ({
    displayName: displayName.value || (props.device?.sourceName ?? props.sensor.name),
    assignedCameraIds: assignedCameraIds.value,
    exposed: exposed.value,
  }),
});
</script>
