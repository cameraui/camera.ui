<template>
  <CuiLightControl
    v-if="isReactiveLightControl(sensor)"
    :label="sensor.displayName.value"
    :on="sensor.getProperty(LightProperty.On) ?? false"
    :brightness="sensor.getProperty(LightProperty.Brightness) ?? 100"
    :has-brightness="sensor.hasCapability('brightness')"
    :disabled
    size="small"
    class="card-border"
    @update:on="(value) => sensor.setProperty(LightProperty.On, value)"
    @update:brightness="(value) => sensor.setProperty(LightProperty.Brightness, value)"
  />

  <CuiSwitchControl
    v-else-if="isReactiveSwitchControl(sensor)"
    :label="sensor.displayName.value"
    :on="sensor.getProperty(SwitchProperty.On) ?? false"
    :disabled
    size="small"
    class="card-border"
    @update:on="(value) => sensor.setProperty(SwitchProperty.On, value)"
  />

  <CuiLockControl
    v-else-if="isReactiveLockControl(sensor)"
    :label="sensor.displayName.value"
    :current-state="sensor.getProperty(LockProperty.CurrentState) ?? 2"
    :target-state="sensor.getProperty(LockProperty.TargetState) ?? 0"
    :disabled
    size="small"
    class="card-border"
    @update:target-state="(value) => sensor.setProperty(LockProperty.TargetState, value)"
  />

  <CuiSirenControl
    v-else-if="isReactiveSirenControl(sensor)"
    :label="sensor.displayName.value"
    :active="sensor.getProperty(SirenProperty.Active) ?? false"
    :volume="sensor.getProperty(SirenProperty.Volume) ?? 100"
    :has-volume="sensor.hasCapability('volume')"
    :disabled
    size="small"
    class="card-border"
    @update:active="(value) => sensor.setProperty(SirenProperty.Active, value)"
    @update:volume="(value) => sensor.setProperty(SirenProperty.Volume, value)"
  />

  <CuiSecuritySystem
    v-else-if="isReactiveSecuritySystem(sensor)"
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
    v-else-if="isReactiveGarageControl(sensor)"
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
    v-else-if="isReactiveDoorbellTrigger(sensor)"
    :label="sensor.displayName.value"
    :ring="sensor.getProperty(DoorbellProperty.Ring) ?? false"
    :disabled
    size="small"
    class="card-border"
    @trigger="() => sensor.setProperty(DoorbellProperty.Ring, true)"
  />

  <CuiContactSensor
    v-else-if="isReactiveContactSensor(sensor)"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty(ContactProperty.Detected) ?? false"
    size="small"
    class="card-border"
  />

  <CuiOccupancySensor
    v-else-if="isReactiveOccupancySensor(sensor)"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty(OccupancyProperty.Detected) ?? false"
    size="small"
    class="card-border"
  />

  <CuiSmokeSensor
    v-else-if="isReactiveSmokeSensor(sensor)"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty(SmokeProperty.Detected) ?? false"
    size="small"
    class="card-border"
  />

  <CuiLeakSensor
    v-else-if="isReactiveLeakSensor(sensor)"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty(LeakProperty.Detected) ?? false"
    size="small"
    class="card-border"
  />

  <CuiTemperatureInfo
    v-else-if="isReactiveTemperatureInfo(sensor)"
    :label="sensor.displayName.value"
    :current="sensor.getProperty(TemperatureProperty.Current)"
    size="small"
    class="card-border"
  />

  <CuiHumidityInfo
    v-else-if="isReactiveHumidityInfo(sensor)"
    :label="sensor.displayName.value"
    :current="sensor.getProperty(HumidityProperty.Current)"
    size="small"
    class="card-border"
  />

  <CuiBatteryInfo
    v-else-if="isReactiveBatteryInfo(sensor)"
    :label="sensor.displayName.value"
    :level="sensor.getProperty(BatteryProperty.Level) ?? 100"
    :charging="sensor.getProperty(BatteryProperty.Charging) ?? 'NOT_CHARGING'"
    :low="sensor.getProperty(BatteryProperty.Low) ?? false"
    size="small"
    class="card-border"
  />

  <CuiBinarySensor
    v-else-if="isBinarySensor(sensor)"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty('detected') ?? false"
    size="small"
    class="card-border"
  />

  <CuiMeasurementInfo
    v-else-if="measurementUnit(sensor)"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :current="sensor.getProperty('current') ?? undefined"
    :unit="measurementUnit(sensor)!"
    size="small"
    class="card-border"
  />

  <CuiDetectionSensorInfo
    v-else-if="isDetectionInfo(sensor)"
    :type="sensor.type"
    :label="sensor.displayName.value"
    :detected="sensor.getProperty('detected') ?? false"
    :labels="detectionLabels(sensor)"
    :decibels="sensor.type === SensorType.Audio ? (sensor.getProperty(AudioProperty.Decibels) ?? undefined) : undefined"
    size="small"
    class="card-border"
  />
</template>

<script setup lang="ts">
import {
  isReactiveBatteryInfo,
  isReactiveContactSensor,
  isReactiveDoorbellTrigger,
  isReactiveGarageControl,
  isReactiveHumidityInfo,
  isReactiveLeakSensor,
  isReactiveLightControl,
  isReactiveLockControl,
  isReactiveOccupancySensor,
  isReactiveSecuritySystem,
  isReactiveSirenControl,
  isReactiveSmokeSensor,
  isReactiveSwitchControl,
  isReactiveTemperatureInfo,
} from '@camera.ui/browser';
import {
  AudioProperty,
  BatteryProperty,
  ContactProperty,
  DoorbellProperty,
  GarageProperty,
  HumidityProperty,
  LeakProperty,
  LightProperty,
  LockProperty,
  OccupancyProperty,
  SecuritySystemProperty,
  SensorType,
  SirenProperty,
  SmokeProperty,
  SwitchProperty,
  TemperatureProperty,
} from '@camera.ui/sdk';

import CuiDetectionSensorInfo from '@/components/CuiDetectionSensorInfo/CuiDetectionSensorInfo.vue';
import { securityModes } from '@/components/CuiSensors/display.js';
import { BINARY_SENSOR_TYPES, DETECTION_INFO_TYPES, MEASUREMENT_UNITS } from './types.js';

import type { ReactiveSensor } from '@camera.ui/browser';

defineProps<{
  sensor: ReactiveSensor<any>;
  disabled?: boolean;
}>();

function isBinarySensor(sensor: ReactiveSensor<any>): boolean {
  return BINARY_SENSOR_TYPES.has(sensor.type as SensorType);
}

function measurementUnit(sensor: ReactiveSensor<any>): string | undefined {
  return MEASUREMENT_UNITS.get(sensor.type as SensorType);
}

function isDetectionInfo(sensor: ReactiveSensor<any>): boolean {
  return DETECTION_INFO_TYPES.has(sensor.type as SensorType);
}

function detectionLabels(sensor: ReactiveSensor<any>): string[] {
  const detections = (sensor.getProperty('detections') ?? []) as { label?: string; attribute?: string }[];
  return [...new Set(detections.map((d) => d.label ?? d.attribute).filter((label): label is string => !!label))];
}
</script>
