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
        type="source"
        :position="Position.Bottom"
        id="true"
        class="!w-5 !h-5 !border-2"
        :style="{ ...handleStyle, backgroundColor: 'var(--text-success-color)', left: '30%' }"
      />
      <Handle
        type="source"
        :position="Position.Bottom"
        id="false"
        class="!w-5 !h-5 !border-2"
        :style="{ ...handleStyle, backgroundColor: 'var(--text-danger-color)', left: '70%' }"
      />
    </template>
  </BaseNode>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';

import { useCameraNames } from '../config/useCameraOptions.js';
import { useNodeIssues } from '../config/flowValidation.js';
import { getNodeDefinition } from '../nodeDefinitions.js';
import { getNodeSummary } from '../utils.js';
import BaseNode from './BaseNode.vue';

import type { NodeProps } from '@vue-flow/core';
import type { AutomationNodeData } from '../types.js';

const props = defineProps<NodeProps<AutomationNodeData>>();

const { t } = useI18n();

const handleStyle = {
  borderColor: 'var(--card-background)',
};

const nodeWarning = useNodeIssues(() => props.id);

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const { cameraName } = useCameraNames();
const subtitle = computed(() => getNodeSummary(props.data, cameraName));
</script>
