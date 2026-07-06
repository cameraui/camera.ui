<template>
  <Panel
    v-if="variables.length"
    :header="t('components.automation_nodes.available_variables')"
    toggleable
    collapsed
    :pt="{ root: { class: 'border-0' }, header: { class: 'py-1.5 px-0 text-xs' }, content: { class: 'px-0 py-2' }, headerActions: { class: 'flex' } }"
    :toggle-button-props="{ class: 'w-4 h-4 p-0', text: true, rounded: true, severity: 'secondary' }"
  >
    <div class="flex flex-wrap gap-1">
      <Chip
        v-for="v in variables"
        :key="v.value"
        :label="v.label"
        class="text-[10px] cursor-pointer hover:bg-primary/10 active:bg-primary/20"
        @click="$emit('select', v.value)"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import type { VariableSuggestionsEmits, VariableSuggestionsProps } from '../types.js';

defineProps<VariableSuggestionsProps>();

defineEmits<VariableSuggestionsEmits>();

const { t } = useI18n();
</script>
