<template>
  <div class="flex flex-col gap-4">
    <div class="cui-banner cui-banner-info">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.condition_time_info') }}</span>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_time_start') }}</label>
      <DatePicker :model-value="startDate" time-only show-icon icon-display="input" class="w-full" @update:model-value="onStartChange" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_time_end') }}</label>
      <DatePicker :model-value="endDate" time-only show-icon icon-display="input" class="w-full" @update:model-value="onEndChange" />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_time_days') }}</label>
      <MultiSelect
        :model-value="data.days"
        :options="dayOptions"
        option-label="label"
        option-value="value"
        :placeholder="t('components.automation_nodes.condition_time_days_all')"
        class="w-full"
        @update:model-value="update('days', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfigConditionTimeProps, ConfigNodeUpdateEmits } from '../types.js';

const props = defineProps<ConfigConditionTimeProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const dayOptions = [
  { label: t('components.automation_nodes.day_monday'), value: 1 },
  { label: t('components.automation_nodes.day_tuesday'), value: 2 },
  { label: t('components.automation_nodes.day_wednesday'), value: 3 },
  { label: t('components.automation_nodes.day_thursday'), value: 4 },
  { label: t('components.automation_nodes.day_friday'), value: 5 },
  { label: t('components.automation_nodes.day_saturday'), value: 6 },
  { label: t('components.automation_nodes.day_sunday'), value: 0 },
];

const startDate = computed(() => timeToDate(props.data.startTime));
const endDate = computed(() => timeToDate(props.data.endTime));

function timeToDate(time: string): Date {
  const [h, m] = (time || '00:00').split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(date: Date | null): string {
  if (!date) return '00:00';
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function onStartChange(val: unknown): void {
  emit('update:data', { startTime: dateToTime(val as Date) });
}

function onEndChange(val: unknown): void {
  emit('update:data', { endTime: dateToTime(val as Date) });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
