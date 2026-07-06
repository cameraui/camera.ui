<template>
  <BaseNode
    :icon="definition!.icon"
    :label="label"
    :subtitle="subtitle"
    :color="definition?.color ?? '#22c55e'"
    :selected="selected"
    :show-input="false"
    :show-output="true"
  />
</template>

<script setup lang="ts">
import { getNodeDefinition } from '../nodeDefinitions.js';
import BaseNode from './BaseNode.vue';

import type { NodeProps } from '@vue-flow/core';
import type { AutomationNodeData } from '../types.js';

const props = defineProps<NodeProps<AutomationNodeData>>();

const { t } = useI18n();

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const subtitle = computed(() => {
  const data = props.data;
  if (data.type === 'trigger-detection' && data.cameraId) return data.cameraId;
  if (data.type === 'trigger-schedule' && data.cron) return data.cron;
  return undefined;
});
</script>
