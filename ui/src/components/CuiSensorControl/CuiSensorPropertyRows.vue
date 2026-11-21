<template>
  <div class="flex flex-col gap-2 p-2 rounded-lg" :class="{ 'opacity-60': disabled && !rows.some((row) => row.input) }">
    <div class="flex items-center gap-2">
      <component :is="sensorIcon(sensor.type, sensor)" class="w-[1.125rem] h-[1.125rem] shrink-0" :style="sensorTone(sensor.type, sensor)" />
      <span class="text-xs font-medium text-color truncate">{{ sensor.displayName.value }}</span>
    </div>

    <div v-for="row in rows" :key="row.property" class="flex items-center justify-between gap-3 min-h-8">
      <span class="text-xs text-muted truncate">{{ row.label }}</span>

      <ToggleSwitch v-if="row.input?.kind === 'boolean'" :model-value="row.value === true" :disabled @update:model-value="(value) => write(row, value)" />

      <Select
        v-else-if="row.input && row.options"
        :model-value="String(row.value ?? '')"
        :options="row.options"
        option-label="label"
        option-value="value"
        size="small"
        :disabled
        @update:model-value="(value) => write(row, value)"
      />

      <InputText
        v-else-if="row.input?.kind === 'text'"
        :model-value="String(row.value ?? '')"
        :maxlength="row.input.maxLength"
        size="small"
        class="w-40"
        :disabled
        @change="(event: Event) => write(row, (event.target as HTMLInputElement).value)"
      />

      <CuiNumberStepper
        v-else-if="row.input?.kind === 'number'"
        :model-value="typeof row.value === 'number' ? row.value : null"
        :min="row.input.min"
        :max="row.input.max"
        :step="row.input.step"
        :max-fraction-digits="3"
        size="small"
        :disabled
        @update:model-value="(value) => value != null && write(row, value)"
      />

      <span v-else class="text-xs font-medium text-color">{{ row.text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { sensorMeta } from '@camera.ui/sdk';

import { formatMeasurement, sensorIcon, sensorPropertyLabelKey, sensorPropertySpec, sensorTone } from '@/common/sensorDisplay.js';
import { getSensorPropertyInput } from '@/components/CuiAutomation/config/sensorPropertyInputs.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { SensorPropertySpec } from '@camera.ui/sdk';
import type { SensorPropertyInputMeta } from '@/components/CuiAutomation/config/sensorPropertyInputs.js';

interface PropertyRow {
  property: string;
  label: string;
  spec: SensorPropertySpec;
  value: unknown;
  text: string;
  input?: SensorPropertyInputMeta;
  options?: { label: string; value: string }[];
}

const props = defineProps<{
  sensor: ReactiveSensor<object>;
  disabled?: boolean;
}>();

const { t, te } = useI18n();

const rows = computed<PropertyRow[]>(() => {
  const meta = sensorMeta(props.sensor.type);
  return Object.keys(meta?.properties ?? {}).flatMap((property) => {
    const spec = sensorPropertySpec(props.sensor, property);
    const capability = meta?.propertyCapabilities?.[property];
    if (!spec || spec.internal || spec.type === 'object' || (capability && !props.sensor.hasCapability(capability))) return [];

    const input = getSensorPropertyInput(props.sensor.type, property, props.sensor.propertySpecs.value);
    const options = input.choices ?? input.options?.map(({ labelKey, value }) => ({ label: translated(`components.automation_nodes.${labelKey}`, value), value }));
    const value = props.sensor.getProperty(property);
    return [
      {
        property,
        label: translated(`components.automation_nodes.${sensorPropertyLabelKey(props.sensor.type, property)}`, property),
        spec,
        value,
        text: readingOf(spec, value, options),
        input: spec.writable ? input : undefined,
        options,
      },
    ];
  });
});

function readingOf(spec: SensorPropertySpec, value: unknown, options: PropertyRow['options']): string {
  if (value === undefined || value === null) return '--';
  if (typeof value === 'boolean') return t(`components.sensor_state.${value ? 'on' : 'off'}`);
  if (typeof value === 'number' && spec.type === 'number') return formatMeasurement(value, spec);
  return options?.find((option) => option.value === String(value))?.label ?? String(value);
}

function translated(key: string, fallback: string): string {
  return te(key) ? t(key) : fallback;
}

function write(row: PropertyRow, value: unknown) {
  const offered = [...Object.values(row.spec.values ?? {}), ...(row.spec.choices ?? []).map((choice) => choice.value)];
  const raw = typeof value === 'string' ? (offered.find((option) => String(option) === value) ?? value) : value;
  props.sensor.setProperty(row.property, raw);
}
</script>
