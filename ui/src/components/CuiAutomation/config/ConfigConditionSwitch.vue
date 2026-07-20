<template>
  <div class="flex flex-col gap-4">
    <div v-if="sourceLabel" class="cui-banner cui-banner-info">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.condition_source_info', { source: sourceLabel }) }}</span>
    </div>
    <div v-else class="cui-banner cui-banner-warn">
      <i-mdi:alert-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.condition_no_source') }}</span>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.condition_variable') }}</label>
      <VariableInput
        :model-value="data.variable"
        :node-id="nodeId"
        :placeholder="t('components.automation_nodes.condition_variable_placeholder')"
        @update:model-value="update('variable', $event)"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.switch_cases') }}</label>
      <AutoComplete
        :model-value="data.cases"
        multiple
        :typeahead="false"
        :placeholder="t('components.automation_nodes.switch_cases_placeholder')"
        @update:model-value="updateCases($event)"
      />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.switch_cases_hint') }}</Message>
      <div v-if="suggestedCases.length" class="flex flex-col gap-2 mt-1">
        <span class="text-muted text-xs">{{ t('components.automation_nodes.switch_cases_suggested') }}</span>
        <div class="flex flex-wrap gap-2">
          <Button v-for="option in suggestedCases" :key="option.value" severity="secondary" outlined size="small" :label="option.label" @click="addCase(option.value)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSensorsByType } from '@camera.ui/browser';
import { SensorType } from '@camera.ui/sdk';

import { getObservableSensorProperties } from '@shared/types';
import { getNodeDefinition } from '../nodeDefinitions.js';
import { findFlowVariable, flowValueOptions, useFlowVariables } from './flowSchema.js';
import VariableInput from './VariableInput.vue';

import type { AutomationFlow, ConfigConditionSwitchProps, ConfigNodeUpdateEmits } from '../types.js';
import type { FlowVariableOption } from './flowSchema.js';

interface SensorTriggerData {
  cameraId?: string;
  sensorType?: string;
  sensorName?: string;
  sensorPluginId?: string;
  properties?: string[];
}

const props = defineProps<ConfigConditionSwitchProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const store = useAutomationsStore();

const { variables } = useFlowVariables(() => props.nodeId);

const sourceNode = computed(() => store.getDraftSourceNode(props.nodeId));

const sourceLabel = computed(() => {
  if (!sourceNode.value?.type) return '';
  const def = getNodeDefinition(sourceNode.value.type);
  return def ? t(def.labelKey) : sourceNode.value.type;
});

const selectedVariable = computed(() => findFlowVariable(store.draft as AutomationFlow | null, props.nodeId, props.data.variable));

const sensorTrigger = computed<SensorTriggerData | undefined>(() => {
  let node = store.getDraftSourceNode(props.nodeId);
  for (let hops = 0; node && hops < 10; hops++) {
    if (node.type === 'trigger-sensor') return node.data as SensorTriggerData;
    node = store.getDraftSourceNode(node.id);
  }
  return undefined;
});

const { sensors } = useSensorsByType(
  () => sensorTrigger.value?.cameraId || undefined,
  () => (sensorTrigger.value?.sensorType as SensorType) || SensorType.Contact,
);

const watchedProperties = computed(() => {
  const trigger = sensorTrigger.value;
  if (!trigger?.sensorType) return [];
  return trigger.properties?.length ? trigger.properties : getObservableSensorProperties(trigger.sensorType);
});

const liveSensorValues = computed(() => {
  if (selectedVariable.value?.template !== '{{sensor.value}}') return [];
  const trigger = sensorTrigger.value;
  if (!trigger?.sensorName) return [];

  const sensor = sensors.value.find((s) => s.name === trigger.sensorName && s.pluginId === trigger.sensorPluginId);
  if (!sensor) return [];

  const watched = trigger.properties?.length ? trigger.properties : Object.keys(sensor.properties);
  const values = new Set<string>();
  for (const property of watched) {
    const value = sensor.getProperty(property);
    if (typeof value === 'boolean') {
      values.add('true');
      values.add('false');
    } else if (typeof value === 'string' && value) {
      values.add(value);
    }
  }

  return [...values].map((value) => ({ label: value, value }));
});

const suggestedCases = computed<FlowVariableOption[]>(() => {
  const merged = new Map<string, FlowVariableOption>();
  for (const option of flowValueOptions(selectedVariable.value, t)) merged.set(option.value, option);
  for (const option of liveSensorValues.value) {
    if (!merged.has(option.value)) merged.set(option.value, option);
  }
  return [...merged.values()].filter((option) => !props.data.cases.includes(option.value));
});

function addCase(value: string) {
  updateCases([...props.data.cases, value]);
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}

function updateCases(value: string[]) {
  update('cases', [...new Set(value)]);
}

watchEffect(() => {
  if (props.data.variable) return;
  if (watchedProperties.value.length > 1) {
    if (variables.value.some((v) => v.template === '{{sensor.property}}')) update('variable', '{{sensor.property}}');
    return;
  }
  const sensorValue = variables.value.find((v) => v.template === '{{sensor.value}}');
  if (sensorValue) update('variable', sensorValue.template);
});
</script>
