<template>
  <CuiTilePanel :icon :title="name" :state="headline" :color :active="!!color" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiThermometerScene v-if="type === SensorType.Temperature" :ratio="ratio ?? 0" />
      <CuiDropScene v-else-if="type === SensorType.Humidity" :ratio="ratio ?? 0" :zones="zoneViews ?? []" />
      <CuiSunScene v-else-if="type === SensorType.Illuminance" :ratio="ratio ?? 0" :dark="!!zoneViews?.[0]?.active" />
      <CuiCo2Scene v-else-if="type === SensorType.CarbonDioxide" :poor="!!zoneViews?.[2]?.active" />
      <CuiAirQualityScene v-else-if="isAirQuality" :level :colors="AIR_COLORS" />
      <CuiBatteryScene v-else-if="type === SensorType.Battery" :ratio="ratio ?? 0" :charging="isCharging" />

      <div class="measurement-large__reading">
        <span class="measurement-large__value">{{ (isAirQuality ? word : text) ?? '--' }}</span>
        <span v-if="!isAirQuality && word" class="measurement-large__word">{{ word }}</span>
      </div>

      <div v-if="labeledScale" class="flex flex-col gap-1.5 w-full">
        <CuiTileScale :ratio :zones="scaleZones" :color />
        <div class="measurement-large__zones">
          <span
            v-for="zone in zoneViews"
            :key="zone.label"
            class="measurement-large__zone"
            :class="{ 'measurement-large__zone--active': zone.active }"
            :style="{ left: `${((zone.from + zone.to) / 2) * 100}%` }"
          >
            {{ zone.label }}
          </span>
        </div>
      </div>

      <div v-if="isAirQuality && readings.length > 0" class="measurement-large__readings">
        <div v-for="reading in readings" :key="reading.property" class="measurement-large__chip">
          <span class="text-xs text-muted">{{ reading.label }}</span>
          <span class="text-sm font-semibold tabular-nums">{{ reading.text }}</span>
        </div>
      </div>

      <CuiMeasurementTrend v-if="readingProperty" :sensor :property="readingProperty" :format="(value) => format(value, readingProperty!)" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTilePanel from '../frame/CuiTilePanel.vue';
import CuiTileScale from '../frame/CuiTileScale.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiAirQualityScene from './CuiAirQualityScene.vue';
import CuiBatteryScene from './CuiBatteryScene.vue';
import CuiCo2Scene from './CuiCo2Scene.vue';
import CuiDropScene from './CuiDropScene.vue';
import CuiMeasurementTrend from './CuiMeasurementTrend.vue';
import CuiSunScene from './CuiSunScene.vue';
import CuiThermometerScene from './CuiThermometerScene.vue';
import { AIR_COLORS } from './scales.js';
import { useMeasurement } from './useMeasurement.js';

import type { SensorTileProps } from '../types.js';

// the scene of these two shows no zones, the scale under the value does
const LABELED_SCALE = new Set<string>([SensorType.Illuminance, SensorType.CarbonDioxide]);

const props = defineProps<SensorTileProps>();

const { name, online } = useTileSensor(props);
const { isAirQuality, readings, readingProperty, text, level, ratio, isCharging, color, word, headline, scaleZones, zoneViews, format } = useMeasurement(
  () => props.sensor,
);

const type = computed(() => props.sensor.type);
const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const labeledScale = computed(() => LABELED_SCALE.has(type.value) && ratio.value !== undefined);
</script>

<style scoped>
.measurement-large__reading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.125rem;
}

.measurement-large__value {
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--text-color);
}

.measurement-large__word {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--tile-ink);
}

.measurement-large__zones {
  position: relative;
  height: 1rem;
}

.measurement-large__zone {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 0.6875rem;
  color: var(--text-secondary-color);
  white-space: nowrap;
}

.measurement-large__zone--active {
  color: var(--text-color);
  font-weight: 600;
}

.measurement-large__readings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5rem, 1fr));
  gap: 0.5rem;
  width: 100%;
}

.measurement-large__chip {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  background: var(--p-content-hover-background);
}
</style>
