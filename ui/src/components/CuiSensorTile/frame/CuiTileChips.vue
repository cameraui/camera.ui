<template>
  <div class="flex flex-col gap-2 w-full">
    <span class="text-xs font-medium text-muted">{{ label }}</span>
    <div class="flex flex-wrap gap-2">
      <Button
        v-for="option in shown"
        :key="option.value"
        :label="option.label"
        :severity="option.value === selected ? undefined : 'secondary'"
        :outlined="option.value !== selected"
        size="small"
        rounded
        :disabled
        @click="emit('select', option.value)"
      />
    </div>
    <Select
      v-if="rest.length"
      :model-value="null"
      :options="rest"
      option-label="label"
      option-value="value"
      :placeholder="t('components.sensor_tile.more_count', { count: rest.length })"
      filter
      :filter-placeholder="t('components.sensor_tile.search')"
      size="small"
      fluid
      :disabled
      @update:model-value="(value: string | null) => value && emit('select', value)"
    />
  </div>
</template>

<script setup lang="ts">
import type { CuiTileChipsEmits, CuiTileChipsProps } from './types.js';

const props = withDefaults(defineProps<CuiTileChipsProps>(), {
  limit: Infinity,
});
const emit = defineEmits<CuiTileChipsEmits>();

const { t } = useI18n();

const shown = computed(() => props.options.slice(0, props.limit));
const rest = computed(() => props.options.slice(props.limit));
</script>
