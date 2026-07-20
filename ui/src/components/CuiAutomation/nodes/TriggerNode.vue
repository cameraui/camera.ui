<template>
  <BaseNode
    :icon="definition!.icon"
    :label="label"
    :subtitle="subtitle"
    :color="definition?.color ?? '#22c55e'"
    :selected="selected"
    :warning="nodeWarning"
    :show-input="false"
    :show-output="true"
  />
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
const { cameraName } = useCameraNames();

const nodeWarning = useNodeIssues(() => props.id);

const definition = computed(() => getNodeDefinition(props.type));
const label = computed(() => (definition.value ? t(definition.value.labelKey) : props.type));
const subtitle = computed(() => getNodeSummary(props.data, cameraName));
</script>
