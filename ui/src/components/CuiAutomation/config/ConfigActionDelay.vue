<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.delay_duration') }}</label>
      <InputNumber :model-value="data.duration" :min="1" :max="9999" class="w-full" @update:model-value="update('duration', $event)" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.delay_unit') }}</label>
      <Select :model-value="data.unit" :options="units" option-label="label" option-value="value" class="w-full" @update:model-value="update('unit', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.action_delay_desc') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfigActionDelayProps, ConfigNodeUpdateEmits } from '../types.js';

defineProps<ConfigActionDelayProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const units = [
  { label: t('components.automation_nodes.unit_seconds'), value: 'seconds' },
  { label: t('components.automation_nodes.unit_minutes'), value: 'minutes' },
  { label: t('components.automation_nodes.unit_hours'), value: 'hours' },
];

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
