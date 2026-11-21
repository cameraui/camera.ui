<template>
  <CuiLightControl
    v-if="kind === SensorDomain.Light"
    :label="sensor.displayName.value"
    :on="sensor.getProperty(LightProperty.On) ?? false"
    :brightness="sensor.getProperty(LightProperty.Brightness) ?? 100"
    :has-brightness="sensor.hasCapability('brightness')"
    v-bind="sensorControlRange(sensor, LightProperty.Brightness)"
    :disabled
    size="small"
    class="card-border"
    @update:on="(value) => sensor.setProperty(LightProperty.On, value)"
    @update:brightness="(value) => sensor.setProperty(LightProperty.Brightness, value)"
  />

  <CuiSwitchControl
    v-else-if="kind === SensorDomain.Switch"
    :label="sensor.displayName.value"
    :on="sensor.getProperty(SwitchProperty.On) ?? false"
    :disabled
    size="small"
    class="card-border"
    @update:on="(value) => sensor.setProperty(SwitchProperty.On, value)"
  />

  <CuiLockControl
    v-else-if="kind === SensorDomain.Lock"
    :label="sensor.displayName.value"
    :current-state="sensor.getProperty(LockProperty.CurrentState) ?? 2"
    :target-state="sensor.getProperty(LockProperty.TargetState) ?? 0"
    :disabled
    size="small"
    class="card-border"
    @update:target-state="(value) => sensor.setProperty(LockProperty.TargetState, value)"
  />

  <CuiSirenControl
    v-else-if="kind === SensorDomain.Siren"
    :label="sensor.displayName.value"
    :active="sensor.getProperty(SirenProperty.Active) ?? false"
    :volume="sensor.getProperty(SirenProperty.Volume) ?? 100"
    :has-volume="sensor.hasCapability('volume')"
    v-bind="sensorControlRange(sensor, SirenProperty.Volume)"
    :tone="toneProperty ? String(sensor.getProperty(toneProperty) ?? '') : undefined"
    :tones="toneProperty ? toneChoices(sensor, toneProperty) : undefined"
    :disabled
    size="small"
    class="card-border"
    @update:active="(value) => sensor.setProperty(SirenProperty.Active, value)"
    @update:volume="(value) => sensor.setProperty(SirenProperty.Volume, value)"
    @update:tone="(value) => toneProperty && sensor.setProperty(toneProperty, value)"
  />

  <CuiSecuritySystem
    v-else-if="kind === SensorDomain.Alarm"
    :label="sensor.displayName.value"
    :current-state="sensor.getProperty(SecuritySystemProperty.CurrentState) ?? 3"
    :target-state="sensor.getProperty(SecuritySystemProperty.TargetState) ?? 3"
    :modes="securityModes(sensor)"
    :disabled
    size="small"
    class="card-border"
    @update:target-state="(value) => sensor.setProperty(SecuritySystemProperty.TargetState, value)"
  />

  <CuiGarageControl
    v-else-if="kind === SensorDomain.Cover"
    :label="sensor.displayName.value"
    :current-state="sensor.getProperty(GarageProperty.CurrentState) ?? 1"
    :target-state="sensor.getProperty(GarageProperty.TargetState) ?? 1"
    :obstruction-detected="sensor.getProperty(GarageProperty.ObstructionDetected) ?? false"
    :disabled
    size="small"
    class="card-border"
    @update:target-state="(value) => sensor.setProperty(GarageProperty.TargetState, value)"
  />

  <CuiDoorbellTrigger
    v-else-if="kind === 'doorbell'"
    :label="sensor.displayName.value"
    :ring="sensor.getProperty(DoorbellProperty.Ring) ?? false"
    :disabled
    size="small"
    class="card-border"
    @trigger="() => sensor.setProperty(DoorbellProperty.Ring, true)"
  />

  <CuiBatteryInfo
    v-else-if="kind === 'battery'"
    :label="sensor.displayName.value"
    :level="sensor.getProperty(BatteryProperty.Level) ?? 100"
    :charging="sensor.getProperty(BatteryProperty.Charging) ?? 'NOT_CHARGING'"
    :low="sensor.getProperty(BatteryProperty.Low) ?? false"
    size="small"
    class="card-border"
  />

  <CuiBinarySensor
    v-else-if="kind === SensorDomain.Binary || kind === SensorDomain.Event"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :detected="isSensorActive(sensor)"
    :status="kind === SensorDomain.Event ? sensorStatus(sensor.type, sensor, t) : undefined"
    size="small"
    class="card-border"
  />

  <CuiMeasurementInfo
    v-else-if="kind === SensorDomain.Measurement"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :value="sensorStatus(sensor.type, sensor, t)"
    :details="sensorReadings(sensor, t)"
    size="small"
    class="card-border"
  />

  <CuiDetectionSensorInfo
    v-else-if="kind === 'detection'"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty('detected') ?? false"
    :labels="detectionLabels(sensor)"
    :decibels="sensor.type === SensorType.Audio ? (sensor.getProperty(AudioProperty.Decibels) ?? undefined) : undefined"
    size="small"
    class="card-border"
  />

  <CuiSensorPropertyRows v-else-if="kind === 'properties'" :sensor :disabled class="card-border" />
</template>

<script setup lang="ts">
import {
  AudioProperty,
  BatteryProperty,
  DoorbellProperty,
  GarageProperty,
  LightProperty,
  LockProperty,
  SecuritySystemProperty,
  SensorDomain,
  SensorType,
  sensorMeta,
  SirenProperty,
  SwitchProperty,
} from '@camera.ui/sdk';

import { isSensorActive, sensorPropertySpec, sensorReadings, sensorStatus } from '@/common/sensorDisplay.js';
import CuiDetectionSensorInfo from '@/components/CuiDetectionSensorInfo/CuiDetectionSensorInfo.vue';
import { securityModes } from '@/components/CuiSensors/display.js';
import CuiSensorPropertyRows from './CuiSensorPropertyRows.vue';
import { sensorControlKind, sensorControlRange } from './types.js';

import type { ReactiveSensor } from '@camera.ui/browser';

const props = defineProps<{
  sensor: ReactiveSensor<any>;
  disabled?: boolean;
}>();

const { t } = useI18n();

const kind = computed(() => sensorControlKind(props.sensor.type));

const toneProperty = computed(() => sensorMeta(props.sensor.type)?.semantics?.tone?.property);

function toneChoices(sensor: ReactiveSensor<any>, property: string): { label: string; value: string }[] {
  return (sensorPropertySpec(sensor, property)?.choices ?? []).map(({ label, value }) => ({ label, value: String(value) }));
}

function detectionLabels(sensor: ReactiveSensor<any>): string[] {
  const detections = (sensor.getProperty('detections') ?? []) as { label?: string; attribute?: string }[];
  return [...new Set(detections.map((d) => d.label ?? d.attribute).filter((label): label is string => !!label))];
}
</script>
