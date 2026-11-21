<template>
  <div class="flex flex-col gap-2 w-full min-h-[200px] max-h-[60vh] overflow-y-auto">
    <div v-if="isLoading" class="flex flex-col gap-2">
      <Skeleton v-for="i in 6" :key="i" height="40px" class="rounded-md" />
    </div>

    <template v-else-if="entries.length">
      <div v-for="(entry, idx) in entries" :key="idx" class="flex items-center gap-3 p-2 rounded-md border-color">
        <div class="flex flex-col flex-1 min-w-0">
          <span class="text-sm font-medium truncate">{{ propertyLabel(entry.property) }}</span>
          <span class="text-xs text-muted">{{ formatTimestamp(entry.timestamp) }}</span>
        </div>
        <span class="text-sm font-mono shrink-0">{{ formatValue(entry.value) }}</span>
      </div>
    </template>

    <div v-else class="flex flex-1 flex-col items-center justify-center gap-3 py-10">
      <i-mdi:history class="w-10 h-10 text-muted" />
      <span class="text-muted text-sm">{{ $t('views.sensors.history_empty') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getSensorHistoryFn } from '@/api/routes/sensors.js';
import { sensorPropertyLabelKey } from '@/common/sensorDisplay.js';

import type { SensorHistoryEntry } from '@/api/routes/sensors.js';
import type { SensorHistoryProps } from './types.js';

const props = defineProps<SensorHistoryProps>();

const { t, te } = useI18n();

const entries = ref<SensorHistoryEntry[]>([]);
const isLoading = ref(true);

onMounted(async () => {
  try {
    entries.value = await getSensorHistoryFn({ id: props.sensorId });
  } catch {
    entries.value = [];
  } finally {
    isLoading.value = false;
  }
});

function propertyLabel(property: string): string {
  const key = `components.automation_nodes.${sensorPropertyLabelKey(props.sensorType, property)}`;
  return te(key) ? t(key) : property;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '–';
  return String(value);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
</script>
