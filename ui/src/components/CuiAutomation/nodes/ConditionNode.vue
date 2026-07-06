<template>
  <BaseNode
    :icon="definition!.icon"
    :label="label"
    :subtitle="subtitle"
    :color="definition?.color ?? '#f59e0b'"
    :selected="selected"
    :show-input="true"
    :show-output="false"
    :max-inputs="1"
  >
    <template #handles>
      <Handle
        type="source"
        :position="Position.Bottom"
        id="true"
        class="!w-3 !h-3 !border-2"
        :style="{ ...handleStyle, backgroundColor: 'var(--text-success-color)', left: '30%' }"
      />
      <Handle
        type="source"
        :position="Position.Bottom"
        id="false"
        class="!w-3 !h-3 !border-2"
        :style="{ ...handleStyle, backgroundColor: 'var(--text-danger-color)', left: '70%' }"
      />
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

import { getNodeDefinition } from '../nodeDefinitions.js';
import BaseNode from './BaseNode.vue';

import type { NodeProps } from '@vue-flow/core';
import type { AutomationNodeData } from '../types.js';

const props = defineProps<NodeProps<AutomationNodeData>>();

const { t } = useI18n();

const handleStyle = {
  borderColor: 'var(--card-background)',
};

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const subtitle = computed(() => {
  const data = props.data;
  if (data.type === 'condition-ifelse') {
    if (data.leftOperand && data.operator) {
      return `${data.leftOperand} ${data.operator} ${data.rightOperand}`;
    }
  }
  return undefined;
});
</script>
