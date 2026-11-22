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

    <div v-for="section in sensorSections" :key="section.type" class="overview-section">
      <h3 class="overview-section-title">{{ $t(`components.camera_options.sensor_type_${section.type}`) }}</h3>
      <div class="flex flex-col gap-2">
        <CuiSensorControl v-for="sensor in section.sensors" :key="sensor.id" :sensor :disabled="!canControlSensors" />
      </div>
    </div>

    <div v-if="!sensorSections.length && !hasDetectionSensors" class="overview-section">
      <div class="no-sensors">
        {{ $t('components.camera_options.no_sensors') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  isReactiveAudioSensor,
  isReactiveFaceSensor,
  isReactiveLicensePlateSensor,
  isReactiveMotionSensor,
  isReactiveObjectSensor,
  useSensors,
} from '@camera.ui/browser';
import { AudioProperty, FaceProperty, LicensePlateProperty, MotionProperty, ObjectProperty, SensorDomain, SensorType } from '@camera.ui/sdk';

import CuiDetection from '@/components/CuiDetection/CuiDetection.vue';
import { sensorControlKind } from '@/components/CuiSensorControl/types.js';
import { sensorProvidedForCamera } from '@/utils/sensorSlots.js';

import type { SensorControlKind } from '@/components/CuiSensorControl/types.js';
import type { StreamStatus } from '@/composables/sockets/useStreamStatus.js';
import type { SlotSensor } from '@/utils/sensorSlots.js';
import type { ReactiveSensor } from '@camera.ui/browser';
import type { Camera } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';
import type { CameraOptionsTabProps, OverviewRow } from '../../types.js';

const SECTION_ORDER: SensorControlKind[] = [
  SensorDomain.Light,
  SensorDomain.Switch,
  SensorDomain.Lock,
  SensorDomain.Siren,
  SensorDomain.Alarm,
  SensorDomain.Cover,
  SensorDomain.Climate,
  'doorbell',
  SensorDomain.Binary,
  SensorDomain.Measurement,
  'battery',
  'properties',
];

const TYPE_ORDER: string[] = Object.values(SensorType);

const props = defineProps<CameraOptionsTabProps>();

const { t } = useI18n();
const { getCameraStatus, connect: connectStreamStatus } = useStreamStatus();
const { cameraDevice, latestSnapshotSrc } = toRefs(props);
const { sensors: allSensors } = useSensors(cameraDevice);

const canControlSensors = hasPermission(undefined, 'admin');

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

const motionSensors = computed(() => providedForCamera(allSensors.value.filter(isReactiveMotionSensor)));
const objectSensors = computed(() => providedForCamera(allSensors.value.filter(isReactiveObjectSensor)));
const audioSensors = computed(() => providedForCamera(allSensors.value.filter(isReactiveAudioSensor)));
const faceSensors = computed(() => providedForCamera(allSensors.value.filter(isReactiveFaceSensor)));
const licensePlateSensors = computed(() => providedForCamera(allSensors.value.filter(isReactiveLicensePlateSensor)));
const sensorSections = computed(() => {
  const sections = new Map<string, ReactiveSensor[]>();
  for (const sensor of providedForCamera(allSensors.value)) {
    const kind = sensorControlKind(sensor.type);
    if (!kind || kind === 'detection') continue;
    sections.set(sensor.type, [...(sections.get(sensor.type) ?? []), sensor]);
  }
  return [...sections]
    .map(([type, sensors]) => ({ type, sensors }))
    .sort((a, b) => sectionRank(a.type) - sectionRank(b.type) || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
});

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

function providedForCamera<T extends SlotSensor>(sensors: T[]): T[] {
  return sensors.filter((sensor) => sensorProvidedForCamera(sensor, cameraObject.value));
}

function sectionRank(type: string): number {
  const rank = SECTION_ORDER.indexOf(sensorControlKind(type) as SensorControlKind);
  return rank === -1 ? SECTION_ORDER.length : rank;
}
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
