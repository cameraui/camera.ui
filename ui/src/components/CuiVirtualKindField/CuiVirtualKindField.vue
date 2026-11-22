<template>
  <div v-if="options.length > 0" class="flex flex-col field-gap">
    <label for="virtualKind" class="cui-label">{{ $t('components.camera_options.virtual_sensor_kind') }}</label>
    <Select
      v-model="kind"
      input-id="virtualKind"
      :options
      option-label="label"
      option-value="value"
      :placeholder="$t('components.camera_options.virtual_sensor_kind_none')"
      class="w-full"
    />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
      {{ $t('components.camera_options.virtual_sensor_kind_hint') }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { sensorKinds } from './types.js';

import type { CuiVirtualKindFieldProps } from './types.js';

const props = defineProps<CuiVirtualKindFieldProps>();
const kind = defineModel<string>();

const { t } = useI18n();

const options = computed(() =>
  sensorKinds(props.type)
    .map((value) => ({ value, label: t(`components.camera_options.sensor_kind_${value}`) }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);
</script>
