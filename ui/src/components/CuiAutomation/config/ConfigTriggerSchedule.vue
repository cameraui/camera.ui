<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.cron_expression') }}</label>
      <InputText :model-value="data.cron" placeholder="0 * * * *" @update:model-value="update('cron', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.trigger_schedule_desc') }}</Message>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.cron_presets') }}</label>
      <div class="flex flex-wrap gap-1.5">
        <Button
          v-for="preset in presets"
          :key="preset.cron"
          :severity="data.cron === preset.cron ? 'primary' : 'secondary'"
          :outlined="data.cron !== preset.cron"
          :label="preset.label"
          class="cui-button-small"
          @click="update('cron', preset.cron)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfigNodeUpdateEmits, ConfigTriggerScheduleProps } from '../types.js';

defineProps<ConfigTriggerScheduleProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const presets = [
  { label: t('components.automation_nodes.cron_every_minute'), cron: '* * * * *' },
  { label: t('components.automation_nodes.cron_every_5_min'), cron: '*/5 * * * *' },
  { label: t('components.automation_nodes.cron_every_hour'), cron: '0 * * * *' },
  { label: t('components.automation_nodes.cron_daily_midnight'), cron: '0 0 * * *' },
  { label: t('components.automation_nodes.cron_daily_6am'), cron: '0 6 * * *' },
];

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
