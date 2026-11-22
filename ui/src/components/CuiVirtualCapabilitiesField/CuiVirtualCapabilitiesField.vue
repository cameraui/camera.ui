<template>
  <div v-if="options.length" class="flex flex-col field-gap">
    <label for="virtualCapabilities" class="cui-label">{{ $t('components.camera_options.virtual_sensor_capabilities') }}</label>
    <MultiSelect
      id="virtualCapabilities"
      v-model="capabilities"
      :options="options"
      option-label="label"
      option-value="value"
      :placeholder="$t('components.camera_options.virtual_sensor_capabilities_placeholder')"
      class="w-full"
    />
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
      {{ $t('components.camera_options.virtual_sensor_capabilities_hint') }}
    </Message>
  </div>
</template>

<script setup lang="ts">
import { VIRTUAL_SENSOR_CAPABILITIES } from '@shared/types';

import type { VirtualSensorType } from '@shared/types';

const props = defineProps<{ type: VirtualSensorType }>();
const capabilities = defineModel<string[]>({ required: true });

const { t } = useI18n();

const options = computed(() =>
  (VIRTUAL_SENSOR_CAPABILITIES[props.type]?.offered ?? []).map((capability) => ({
    label: t(`components.camera_options.sensor_capability_${capability}`),
    value: capability,
  })),
);
</script>
