<template>
  <CuiLightControl
    v-if="kind === SensorDomain.Light"
    :label="sensor.displayName.value"
    :on="sensor.getProperty(LightProperty.On) ?? false"
    :brightness="sensor.getProperty(LightProperty.Brightness) ?? 100"
    :has-brightness="sensor.hasCapability(LightCapability.Brightness)"
    v-bind="sensorControlRange(sensor, LightProperty.Brightness)"
    :color-temperature="sensor.getProperty(LightProperty.ColorTemperature) ?? 2700"
    :has-color-temperature="sensor.hasCapability(LightCapability.ColorTemperature)"
    :temperature-min="sensorControlRange(sensor, LightProperty.ColorTemperature).min"
    :temperature-max="sensorControlRange(sensor, LightProperty.ColorTemperature).max"
    :color="sensor.getProperty(LightProperty.Color) ?? undefined"
    :has-color="sensor.hasCapability(LightCapability.Color)"
    :color-mode="sensor.getProperty(LightProperty.ColorMode) ?? undefined"
    :disabled
    size="small"
    class="card-border"
    @update:on="(value) => sensor.setProperty(LightProperty.On, value)"
    @update:brightness="(value) => sensor.setProperty(LightProperty.Brightness, value)"
    @update:color-temperature="(value) => sensor.setProperty(LightProperty.ColorTemperature, value)"
    @update:color="(value) => sensor.setProperty(LightProperty.Color, value)"
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
    :tones="toneProperty ? choiceOptions(sensor, toneProperty) : undefined"
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

  <CuiCoverControl
    v-else-if="kind === SensorDomain.Cover"
    :icon="sensorIcon(sensor.type, sensor)"
    :label="sensor.displayName.value"
    :current-state="sensor.getProperty(CoverProperty.CurrentState) ?? CoverState.Closed"
    :obstruction-detected="sensor.getProperty(CoverProperty.ObstructionDetected) ?? false"
    :position="sensor.getProperty(CoverProperty.CurrentPosition) ?? 0"
    :target-position="sensor.getProperty(CoverProperty.TargetPosition) ?? 0"
    :has-position="sensorOffers(sensor, CoverProperty.TargetPosition)"
    :tilt="sensor.getProperty(CoverProperty.TargetTilt) ?? 0"
    :has-tilt="sensorOffers(sensor, CoverProperty.TargetTilt)"
    :can-stop="sensorOffers(sensor, CoverProperty.Stop)"
    :disabled
    size="small"
    class="card-border"
    @update:target-state="(value) => sensor.setProperty(CoverProperty.TargetState, value)"
    @update:target-position="(value) => sensor.setProperty(CoverProperty.TargetPosition, value)"
    @update:target-tilt="(value) => sensor.setProperty(CoverProperty.TargetTilt, value)"
    @stop="() => sensor.setProperty(CoverProperty.Stop, true)"
  />

  <CuiThermostatControl
    v-else-if="kind === SensorDomain.Climate"
    :icon="sensorIcon(sensor.type, sensor)"
    :icon-style="sensorTone(sensor.type, sensor)"
    :status="sensorStatus(sensor.type, sensor, t)"
    :label="sensor.displayName.value"
    :target-temperature="sensor.getProperty(ThermostatProperty.TargetTemperature) ?? undefined"
    :target-temperature-low="sensor.getProperty(ThermostatProperty.TargetTemperatureLow) ?? undefined"
    :target-temperature-high="sensor.getProperty(ThermostatProperty.TargetTemperatureHigh) ?? undefined"
    :show-target="mode !== ThermostatMode.Off"
    :show-range="mode === ThermostatMode.HeatCool && sensorOffers(sensor, ThermostatProperty.TargetTemperatureLow)"
    v-bind="targetRange"
    :mode
    :modes="enumOptions(sensor, ThermostatProperty.Mode)"
    :preset="String(sensor.getProperty(ThermostatProperty.Preset) ?? '')"
    :presets="sensorOffers(sensor, ThermostatProperty.Preset) ? choiceOptions(sensor, ThermostatProperty.Preset) : []"
    :fan-mode="String(sensor.getProperty(ThermostatProperty.FanMode) ?? '')"
    :fan-modes="sensorOffers(sensor, ThermostatProperty.FanMode) ? choiceOptions(sensor, ThermostatProperty.FanMode) : []"
    :disabled
    size="small"
    class="card-border"
    @update:target-temperature="(value) => sensor.setProperty(ThermostatProperty.TargetTemperature, value)"
    @update:target-temperature-low="(value) => sensor.setProperty(ThermostatProperty.TargetTemperatureLow, value)"
    @update:target-temperature-high="(value) => sensor.setProperty(ThermostatProperty.TargetTemperatureHigh, value)"
    @update:mode="(value) => sensor.setProperty(ThermostatProperty.Mode, value)"
    @update:preset="(value) => sensor.setProperty(ThermostatProperty.Preset, value)"
    @update:fan-mode="(value) => sensor.setProperty(ThermostatProperty.FanMode, value)"
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
  CoverProperty,
  CoverState,
  DoorbellProperty,
  LightCapability,
  LightProperty,
  LockProperty,
  SecuritySystemProperty,
  SensorDomain,
  SensorType,
  sensorMeta,
  SirenProperty,
  SwitchProperty,
  ThermostatMode,
  ThermostatProperty,
} from '@camera.ui/sdk';

import { isSensorActive, sensorIcon, sensorOffers, sensorPropertySpec, sensorReadings, sensorStatus, sensorTone } from '@/common/sensorDisplay.js';
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

const mode = computed(() => String(props.sensor.getProperty(ThermostatProperty.Mode) ?? ''));

const targetRange = computed(() => {
  const { min, max, step } = sensorControlRange(props.sensor, ThermostatProperty.TargetTemperature);
  return { min, max, step };
});

function choiceOptions(sensor: ReactiveSensor<any>, property: string): { label: string; value: string }[] {
  return (sensorPropertySpec(sensor, property)?.choices ?? []).map(({ label, value }) => ({ label, value: String(value) }));
}

function enumOptions(sensor: ReactiveSensor<any>, property: string): { label: string; value: string }[] {
  return Object.entries(sensorPropertySpec(sensor, property)?.values ?? {}).map(([name, value]) => ({
    label: t(`components.automation_nodes.${sensor.type}_state_${name}`),
    value: String(value),
  }));
}

function detectionLabels(sensor: ReactiveSensor<any>): string[] {
  const detections = (sensor.getProperty('detections') ?? []) as { label?: string; attribute?: string }[];
  return [...new Set(detections.map((d) => d.label ?? d.attribute).filter((label): label is string => !!label))];
}
</script>
