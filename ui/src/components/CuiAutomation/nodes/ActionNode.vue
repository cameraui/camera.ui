<template>
  <div>
    <BaseNode
      :icon="definition!.icon"
      :label="label"
      :subtitle="subtitle"
      :color="definition?.color ?? '#3b82f6'"
      :selected="selected"
    :warning="nodeWarning"
      :show-input="true"
      :show-output="true"
    />
    <Card v-if="type === 'action-output' && outputEntries.length" class="cui-card mt-1" :pt="{ body: { class: 'p-0' } }" style="min-width: 180px">
      <template #content>
        <div
          v-for="(entry, i) in outputEntries"
          :key="i"
          class="flex justify-between gap-3 px-3 py-1.5 text-[11px]"
          :class="{ 'border-t border-surface-100 dark:border-surface-800': i > 0 }"
        >
          <span class="text-muted font-medium truncate">{{ entry[0] }}</span>
          <span class="text-color font-semibold text-right">{{ entry[1] }}</span>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useCameraNames } from '../config/useCameraOptions.js';
import { useNodeIssues } from '../config/flowValidation.js';
import { getNodeDefinition } from '../nodeDefinitions.js';
import { getNodeSummary } from '../utils.js';
import BaseNode from './BaseNode.vue';

import type { NodeProps } from '@vue-flow/core';
import type { AutomationNodeData } from '../types.js';

const props = defineProps<NodeProps<AutomationNodeData>>();

const { t } = useI18n();

const automationsStore = useAutomationsStore();
const { lastOutput } = storeToRefs(automationsStore);

const nodeWarning = useNodeIssues(() => props.id);

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const { cameraName } = useCameraNames();
const subtitle = computed(() => {
  const data = props.data as unknown as Record<string, unknown>;
  const alias = data.alias as string | undefined;
  let text = getNodeSummary(props.data, cameraName);
  if (data.type === 'action-plugin' && data.repeat && (data.repeat as number) > 1) text = text ? `${text} (${data.repeat}x)` : `${data.repeat}x`;

  if (alias && text) return `[${alias}] ${text}`;
  if (alias) return `[${alias}]`;
  return text;
});

const outputEntries = computed(() => {
  if (props.type !== 'action-output' || !lastOutput.value) return [];
  return Object.entries(lastOutput.value);
});
</script>
