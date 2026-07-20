<template>
  <BaseNode
    :icon="definition!.icon"
    :label="label"
    :subtitle="subtitle"
    :color="definition?.color ?? '#f59e0b'"
    :selected="selected"
    :warning="nodeWarning"
    :show-input="true"
    :show-output="false"
    :max-inputs="1"
  >
    <template #handles>
      <Handle
        v-for="(caseValue, index) in cases"
        :id="caseHandleId(caseValue)"
        :key="caseHandleId(caseValue)"
        type="source"
        :position="Position.Bottom"
        class="!w-5 !h-5 !border-2"
        :style="{ ...handleStyle, left: `${((index + 1) / (cases.length + 1)) * 100}%` }"
      >
        <div class="absolute top-5 left-1/2 -translate-x-1/2 text-[10px] text-muted whitespace-nowrap pointer-events-none">{{ caseValue }}</div>
      </Handle>
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

import { caseHandleId } from '../caseHandle.js';
import { useNodeIssues } from '../config/flowValidation.js';
import { getNodeDefinition } from '../nodeDefinitions.js';
import BaseNode from './BaseNode.vue';

import type { NodeProps } from '@vue-flow/core';
import type { AutomationNodeData } from '../types.js';

const props = defineProps<NodeProps<AutomationNodeData>>();

const { t } = useI18n();

const handleStyle = {
  backgroundColor: '#f59e0b',
  borderColor: 'var(--card-background)',
};

const nodeWarning = useNodeIssues(() => props.id);

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const cases = computed(() => (props.data.type === 'condition-switch' && Array.isArray(props.data.cases) ? props.data.cases : []));
const subtitle = computed(() => (props.data.type === 'condition-switch' && props.data.variable ? props.data.variable : undefined));
</script>
