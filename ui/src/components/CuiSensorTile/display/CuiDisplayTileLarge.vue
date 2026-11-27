<template>
  <CuiTilePanel fit :icon :title="name" :state="t(`components.camera_options.sensor_type_${sensor.type}`)" :color :active="!!shown" :offline="!online">
    <div class="flex flex-col items-center gap-4">
      <CuiDisplayScreen :text="shown" :empty="t('components.sensor_state.empty')" />

      <form v-if="!disabled" class="flex gap-2 w-full" @submit.prevent="submit">
        <InputText v-model="draft" :maxlength="maxLength" :placeholder="t('components.sensor_tile.message')" size="small" fluid :disabled="!interactive" />
        <Button type="submit" size="small" :label="t('components.sensor_tile.show')" :disabled="!interactive || !draft.trim()" />
      </form>

      <CuiTileChips
        v-if="presets.length > 0 && !disabled"
        :label="propertyLabel(DisplayProperty.Preset)"
        :options="presets"
        :selected="preset"
        :disabled="!interactive"
        @select="showPreset"
      />

      <div v-if="hasDuration" class="flex flex-col gap-1 w-full">
        <span class="text-xs font-medium text-muted">{{ propertyLabel(DisplayProperty.Duration) }}</span>
        <Select
          v-if="!disabled"
          :model-value="duration.value.value"
          :options="durations"
          option-label="label"
          option-value="value"
          size="small"
          fluid
          :disabled="!interactive"
          @update:model-value="setDuration"
        />
        <span v-else class="text-sm font-semibold tabular-nums">{{ durationLabel(duration.value.value) }}</span>
      </div>

      <Button
        v-if="shown && !disabled"
        text
        severity="secondary"
        size="small"
        :label="t('components.sensor_tile.clear_display')"
        :disabled="!interactive"
        @click="clear"
      />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { DisplayProperty } from '@camera.ui/sdk';

import { sensorIcon } from '@/common/sensorDisplay.js';

import CuiTileChips from '../frame/CuiTileChips.vue';
import CuiTilePanel from '../frame/CuiTilePanel.vue';
import { useTileSensor } from '../useTileSensor.js';
import CuiDisplayScreen from './CuiDisplayScreen.vue';
import { useDisplay } from './useDisplay.js';

import type { SensorTileProps } from '../types.js';

const props = defineProps<SensorTileProps>();

const { t } = useI18n();

const { name, online, interactive } = useTileSensor(props);
const { color, preset, presets, shown, hasDuration, duration, maxDuration, maxLength, show, showPreset, clear, setDuration, propertyLabel } = useDisplay(
  () => props.sensor,
);

const DURATION_SECONDS = [0, 30, 60, 300, 900];

const draft = ref('');

const icon = computed(() => sensorIcon(props.sensor.type, props.sensor));
const durations = computed(() => {
  const seconds = new Set(DURATION_SECONDS.filter((value) => value <= maxDuration.value));
  seconds.add(duration.value.value);
  return [...seconds].sort((a, b) => a - b).map((value) => ({ value, label: durationLabel(value) }));
});

function submit() {
  show(draft.value.trim());
  draft.value = '';
}

function durationLabel(seconds: number): string {
  if (seconds === 0) return t('components.sensor_tile.until_cleared');
  if (seconds < 60) return t('components.sensor_tile.seconds', { count: seconds });
  return t('components.sensor_tile.minutes', { count: Math.round(seconds / 60) });
}
</script>
