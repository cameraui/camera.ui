<template>
  <div v-if="!cameraObject" class="flex items-center justify-center h-full">
    <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
  </div>

  <div v-else class="overview-container">
    <div class="relative">
      <div v-if="cameraObject?.disabled" class="absolute inset-0 z-2 flex items-center justify-center bg-black/80 pointer-events-none">
        <i-fluent:video-off-32-filled class="w-8 h-8 text-white/60" />
      </div>
      <div v-if="cameraObject?.disabled" class="absolute top-2 right-2 z-3 flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full pointer-events-none">
        <i-fluent:video-off-32-filled class="w-3.5 h-3.5 text-red-400" />
        <span class="text-xs text-white/80">{{ $t('views.camera.camera_disabled') }}</span>
      </div>
      <div
        v-else-if="cameraObject?.detectionSettings?.snooze"
        class="absolute top-2 right-2 z-2 flex items-center gap-1 px-2 py-1 bg-black/60 rounded-full pointer-events-none"
      >
        <i-solar:moon-sleep-bold class="w-3.5 h-3.5 text-amber-400" />
        <span class="text-xs text-white/80">{{ $t('views.camera.camera_snoozed') }}</span>
      </div>
      <CuiCameraSnapshot :camera="cameraObject as unknown as DBCamera" :src="latestSnapshotSrc" />
    </div>

    <div class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.overview') }}</h3>

      <CuiDataTable :value="overviewRows" striped-rows :show-headers="false" class="card-border rounded-lg overflow-hidden">
        <Column field="label" class="p-2 font-medium text-sm" />
        <Column field="value" class="p-2 text-muted text-sm text-right">
          <template #body="{ data: row }">
            <Tag v-if="row.tag" :severity="row.tagSeverity" :value="row.value" />
            <span v-else>{{ row.value }}</span>
          </template>
        </Column>
      </CuiDataTable>
    </div>

    <div v-if="hasDetectionSensors" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.detection') }}</h3>

      <div class="flex flex-col gap-2">
        <CuiDetection
          v-for="sensor in motionSensors"
          :key="sensor.id"
          type="motion"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(MotionProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />

        <CuiDetection
          v-for="sensor in objectSensors"
          :key="sensor.id"
          type="object"
          :label="sensor.displayName.value"
          :detected="(sensor.getProperty(ObjectProperty.Detections)?.length ?? 0) > 0"
          :detections="sensor.getProperty(ObjectProperty.Detections)?.map((d: any) => d.label ?? d.class ?? 'unknown')"
          size="small"
          class="card-border"
        />

        <CuiDetection
          v-for="sensor in audioSensors"
          :key="sensor.id"
          type="audio"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(AudioProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />

        <CuiDetection
          v-for="sensor in faceSensors"
          :key="sensor.id"
          type="face"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(FaceProperty.Detected) ?? false"
          :detections="sensor.getProperty(FaceProperty.Detections)?.map((d: any) => d.identity ?? 'unknown')"
          size="small"
          class="card-border"
        />

        <CuiDetection
          v-for="sensor in licensePlateSensors"
          :key="sensor.id"
          type="licensePlate"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(LicensePlateProperty.Detected) ?? false"
          :detections="sensor.getProperty(LicensePlateProperty.Detections)?.map((d: any) => d.plateText ?? 'unknown')"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="lightSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_light') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiLightControl
          v-for="sensor in lightSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :on="sensor.getProperty(LightProperty.On) ?? false"
          :brightness="sensor.getProperty(LightProperty.Brightness) ?? 100"
          :has-brightness="sensor.hasCapability('brightness')"
          size="small"
          class="card-border"
          @update:on="(value) => sensor.setProperty(LightProperty.On, value)"
          @update:brightness="(value) => sensor.setProperty(LightProperty.Brightness, value)"
        />
      </div>
    </div>

    <div v-if="switchSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_switch') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiSwitchControl
          v-for="sensor in switchSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :on="sensor.getProperty(SwitchProperty.On) ?? false"
          size="small"
          class="card-border"
          @update:on="(value) => sensor.setProperty(SwitchProperty.On, value)"
        />
      </div>
    </div>

    <div v-if="lockSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_lock') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiLockControl
          v-for="sensor in lockSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :current-state="sensor.getProperty(LockProperty.CurrentState) ?? 2"
          :target-state="sensor.getProperty(LockProperty.TargetState) ?? 0"
          size="small"
          class="card-border"
          @update:target-state="(value) => sensor.setProperty(LockProperty.TargetState, value)"
        />
      </div>
    </div>

    <div v-if="sirenSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_siren') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiSirenControl
          v-for="sensor in sirenSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :active="sensor.getProperty(SirenProperty.Active) ?? false"
          :volume="sensor.getProperty(SirenProperty.Volume) ?? 100"
          :has-volume="sensor.hasCapability('volume')"
          size="small"
          class="card-border"
          @update:active="(value) => sensor.setProperty(SirenProperty.Active, value)"
          @update:volume="(value) => sensor.setProperty(SirenProperty.Volume, value)"
        />
      </div>
    </div>

    <div v-if="securitySystemSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_securitySystem') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiSecuritySystem
          v-for="sensor in securitySystemSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :current-state="sensor.getProperty(SecuritySystemProperty.CurrentState) ?? 3"
          :target-state="sensor.getProperty(SecuritySystemProperty.TargetState) ?? 3"
          size="small"
          class="card-border"
          @update:target-state="(value) => sensor.setProperty(SecuritySystemProperty.TargetState, value)"
        />
      </div>
    </div>

    <div v-if="doorbellSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_doorbell') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiDoorbellTrigger
          v-for="sensor in doorbellSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :ring="sensor.getProperty(DoorbellProperty.Ring) ?? false"
          size="small"
          class="card-border"
          @trigger="() => sensor.setProperty(DoorbellProperty.Ring, true)"
        />
      </div>
    </div>

    <div v-if="contactSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_contact') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiContactSensor
          v-for="sensor in contactSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(ContactProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="occupancySensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_occupancy') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiOccupancySensor
          v-for="sensor in occupancySensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(OccupancyProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="smokeSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_smoke') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiSmokeSensor
          v-for="sensor in smokeSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(SmokeProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="leakSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_leak') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiLeakSensor
          v-for="sensor in leakSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :detected="sensor.getProperty(LeakProperty.Detected) ?? false"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="garageSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_garage') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiGarageControl
          v-for="sensor in garageSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :current-state="sensor.getProperty(GarageProperty.CurrentState) ?? 1"
          :target-state="sensor.getProperty(GarageProperty.TargetState) ?? 1"
          :obstruction-detected="sensor.getProperty(GarageProperty.ObstructionDetected) ?? false"
          size="small"
          class="card-border"
          @update:target-state="(value) => sensor.setProperty(GarageProperty.TargetState, value)"
        />
      </div>
    </div>

    <div v-if="temperatureSensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_temperature') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiTemperatureInfo
          v-for="sensor in temperatureSensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :current="sensor.getProperty(TemperatureProperty.Current)"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="humiditySensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_humidity') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiHumidityInfo
          v-for="sensor in humiditySensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :current="sensor.getProperty(HumidityProperty.Current)"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="batterySensors.length" class="overview-section">
      <h3 class="overview-section-title">{{ $t('components.camera_options.sensor_type_battery') }}</h3>
      <div class="flex flex-col gap-2">
        <CuiBatteryInfo
          v-for="sensor in batterySensors"
          :key="sensor.id"
          :label="sensor.displayName.value"
          :level="sensor.getProperty(BatteryProperty.Level) ?? 100"
          :charging="sensor.getProperty(BatteryProperty.Charging) ?? 'NOT_CHARGING'"
          :low="sensor.getProperty(BatteryProperty.Low) ?? false"
          size="small"
          class="card-border"
        />
      </div>
    </div>

    <div v-if="!hasSensors && !hasDetectionSensors" class="overview-section">
      <div class="no-sensors">
        {{ $t('components.camera_options.no_sensors') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  isReactiveAudioSensor,
  isReactiveBatteryInfo,
  isReactiveContactSensor,
  isReactiveDoorbellTrigger,
  isReactiveFaceSensor,
  isReactiveGarageControl,
  isReactiveHumidityInfo,
  isReactiveLeakSensor,
  isReactiveLicensePlateSensor,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveMotionSensor,
  isReactiveObjectSensor,
  isReactiveOccupancySensor,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
  isReactiveSmokeSensor,
  isReactiveSwitchControl,
  isReactiveTemperatureInfo,
  useSensors,
} from '@camera.ui/browser';
import {
  AudioProperty,
  BatteryProperty,
  ContactProperty,
  DoorbellProperty,
  FaceProperty,
  GarageProperty,
  HumidityProperty,
  LeakProperty,
  LicensePlateProperty,
  LightProperty,
  LockProperty,
  MotionProperty,
  ObjectProperty,
  OccupancyProperty,
  SecuritySystemProperty,
  SirenProperty,
  SmokeProperty,
  SwitchProperty,
  TemperatureProperty,
} from '@camera.ui/sdk';

import CuiDetection from '@/components/CuiDetection/CuiDetection.vue';

import type { StreamStatus } from '@/composables/sockets/useStreamStatus.js';
import type { Camera } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { CameraOptionsTabProps, OverviewRow } from '../../types.js';

const props = defineProps<CameraOptionsTabProps>();

const { t } = useI18n();
const { getCameraStatus, connect: connectStreamStatus } = useStreamStatus();
const { cameraDevice, latestSnapshotSrc } = toRefs(props);
const { sensors: allSensors } = useSensors(cameraDevice);

connectStreamStatus();

const cameraObject = computed<Camera>(() => cameraDevice.value?.camera.value);

const cameraStatus = computed<StreamStatus>(() => getCameraStatus(cameraObject.value?._id));

const statusSeverity = computed<'success' | 'warn' | 'danger' | 'secondary' | 'contrast'>(() => {
  switch (cameraStatus.value) {
    case 'connected':
      return 'success';
    case 'connecting':
      return 'warn';
    case 'error':
      return 'danger';
    case 'partial':
      return 'contrast';
    default:
      return 'secondary';
  }
});

const statusLabel = computed(() => {
  switch (cameraStatus.value) {
    case 'connected':
      return t('components.camera_table.online');
    case 'connecting':
      return t('components.camera_table.connecting');
    case 'error':
      return t('components.camera_table.error');
    case 'partial':
      return t('components.camera_table.partial');
    default:
      return t('components.camera_table.idle');
  }
});
const motionSensors = computed(() => allSensors.value.filter(isReactiveMotionSensor));
const objectSensors = computed(() => allSensors.value.filter(isReactiveObjectSensor));
const audioSensors = computed(() => allSensors.value.filter(isReactiveAudioSensor));
const faceSensors = computed(() => allSensors.value.filter(isReactiveFaceSensor));
const licensePlateSensors = computed(() => allSensors.value.filter(isReactiveLicensePlateSensor));
const batterySensors = computed(() => allSensors.value.filter(isReactiveBatteryInfo));
const lightSensors = computed(() => allSensors.value.filter(isReactiveLightControl));
const sirenSensors = computed(() => allSensors.value.filter(isReactiveSirenControl));
const switchSensors = computed(() => allSensors.value.filter(isReactiveSwitchControl));
const lockSensors = computed(() => allSensors.value.filter(isReactiveLockControl));
const doorbellSensors = computed(() => allSensors.value.filter(isReactiveDoorbellTrigger));
const contactSensors = computed(() => allSensors.value.filter(isReactiveContactSensor));
const temperatureSensors = computed(() => allSensors.value.filter(isReactiveTemperatureInfo));
const humiditySensors = computed(() => allSensors.value.filter(isReactiveHumidityInfo));
const occupancySensors = computed(() => allSensors.value.filter(isReactiveOccupancySensor));
const smokeSensors = computed(() => allSensors.value.filter(isReactiveSmokeSensor));
const leakSensors = computed(() => allSensors.value.filter(isReactiveLeakSensor));
const garageSensors = computed(() => allSensors.value.filter(isReactiveGarageControl));
const securitySystemSensors = computed(() => allSensors.value.filter(isReactiveSecuritySystem));

const isMotionActive = computed(() => motionSensors.value.some((s) => s.getProperty(MotionProperty.Detected)));

const lastMotionTriggered = computed<number | undefined>(() => {
  let latest: number | undefined;
  for (const sensor of motionSensors.value) {
    const ts = sensor.getProperty(MotionProperty.LastTriggered) as number | undefined;
    if (ts && (!latest || ts > latest)) latest = ts;
  }
  return latest;
});

const lastMotionTimestamp = computed(() => new Date(lastMotionTriggered.value ?? 0));
const lastMotionAgo = useTimeAgo(lastMotionTimestamp);

const overviewRows = computed<OverviewRow[]>(() => {
  const rows: OverviewRow[] = [
    { label: t('components.camera_options.overview_status'), value: statusLabel.value, tag: true, tagSeverity: statusSeverity.value },
    { label: t('components.camera_options.overview_sources'), value: String(cameraObject.value?.sources.length ?? 0) },
  ];

  const info = cameraObject.value?.info;
  if (info?.manufacturer) rows.push({ label: t('components.form.label.manufacturer'), value: info.manufacturer });
  if (info?.model) rows.push({ label: t('components.camera_options.model'), value: info.model });
  if (info?.hardware) rows.push({ label: t('components.form.label.hardware_version'), value: info.hardware });
  if (info?.serialNumber) rows.push({ label: t('components.form.label.serial_number'), value: info.serialNumber });
  if (info?.firmwareVersion) rows.push({ label: t('components.form.label.firmware_version'), value: info.firmwareVersion });
  if (info?.supportUrl) rows.push({ label: t('components.form.label.support_url'), value: info.supportUrl });

  if (motionSensors.value.length > 0) {
    if (isMotionActive.value) {
      rows.push({
        label: t('components.camera_options.overview_last_motion'),
        value: t('components.camera_options.overview_motion_active'),
        tag: true,
        tagSeverity: 'danger',
      });
    } else if (lastMotionTriggered.value) {
      rows.push({ label: t('components.camera_options.overview_last_motion'), value: lastMotionAgo.value });
    } else {
      rows.push({ label: t('components.camera_options.overview_last_motion'), value: t('components.camera_options.overview_no_motion') });
    }
  }

  return rows;
});

const hasDetectionSensors = computed(
  () =>
    motionSensors.value.length > 0 ||
    objectSensors.value.length > 0 ||
    audioSensors.value.length > 0 ||
    faceSensors.value.length > 0 ||
    licensePlateSensors.value.length > 0,
);

const hasSensors = computed(
  () =>
    batterySensors.value.length > 0 ||
    temperatureSensors.value.length > 0 ||
    humiditySensors.value.length > 0 ||
    occupancySensors.value.length > 0 ||
    smokeSensors.value.length > 0 ||
    leakSensors.value.length > 0 ||
    lightSensors.value.length > 0 ||
    lockSensors.value.length > 0 ||
    garageSensors.value.length > 0 ||
    sirenSensors.value.length > 0 ||
    switchSensors.value.length > 0 ||
    doorbellSensors.value.length > 0 ||
    contactSensors.value.length > 0 ||
    securitySystemSensors.value.length > 0,
);
</script>

<style scoped>
.overview-container {
  display: flex;
  flex-direction: column;
}

.overview-section {
  padding: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.overview-section:last-child {
  border-bottom: none;
}

.overview-section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--text-secondary-color);
  margin-bottom: 0.75rem;
  letter-spacing: 0.05em;
}

:deep(.p-datatable-tbody > tr > td) {
  height: 50px;
}

.no-sensors {
  text-align: center;
  padding: 1.5rem;
  color: var(--text-secondary-color);
  font-size: 0.875rem;
}
</style>
