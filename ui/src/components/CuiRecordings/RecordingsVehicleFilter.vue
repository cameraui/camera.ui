<template>
  <div class="flex flex-col gap-3">
    <RecordingsColorSwatches v-model="colors" />
    <div class="flex flex-wrap gap-1">
      <Button
        v-for="type in typeOptions"
        :key="type.value"
        :label="type.label"
        :severity="types.includes(type.value) ? undefined : 'secondary'"
        :outlined="!types.includes(type.value)"
        size="small"
        class="text-xs"
        @click="toggleType(type.value)"
      />
    </div>
    <span class="text-xs text-muted">{{ $t('views.recordings.vehicle_filter_hint') }}</span>
  </div>
</template>

<script setup lang="ts">
import { VEHICLE_TYPES } from '@camera.ui/nvr';

import { vehicleTypeKey } from '@/common/eventLabels.js';
import { toggled } from './filters.js';

const colors = defineModel<string[]>('colors', { required: true });
const types = defineModel<string[]>('types', { required: true });

const { t } = useI18n();

const typeOptions = computed(() => VEHICLE_TYPES.map((type) => ({ label: t(vehicleTypeKey(type)), value: type as string })));

function toggleType(type: string): void {
  types.value = toggled(types.value, type);
}
</script>
