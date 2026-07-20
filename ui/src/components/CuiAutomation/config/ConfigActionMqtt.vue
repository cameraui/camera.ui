<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_topic') }}</label>
      <VariableInput :model-value="data.topic" :node-id="nodeId" placeholder="home/notify/doorbell" @update:model-value="update('topic', $event)" />
    </div>

    <div v-if="recentTopics.length" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_recent_topics') }}</label>
      <div class="flex flex-wrap gap-1.5">
        <Button
          v-for="topic in recentTopics"
          :key="topic"
          severity="secondary"
          outlined
          size="small"
          :label="topic"
          class="font-mono"
          @click="update('topic', topic)"
        />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_payload') }}</label>
      <Textarea
        :model-value="data.payload"
        :placeholder="'{&quot;event&quot;: &quot;{{event.label}}&quot;}'"
        rows="4"
        class="w-full font-mono text-xs"
        @update:model-value="update('payload', $event)"
      />
      <VariableSuggestions :variables="availableVars" @select="insertVariable($event)" />
    </div>

    <div class="flex items-center gap-4 cui-toggle-switch">
      <div class="flex flex-col field-switch-gap">
        <label class="cui-label-switch">{{ t('components.automation_nodes.mqtt_retain') }}</label>
        <Message severity="secondary" variant="simple" size="small" class="cui-input-switch-hint">{{ t('components.automation_nodes.mqtt_retain_hint') }}</Message>
      </div>
      <ToggleSwitch :model-value="data.retain" class="ml-auto shrink-0" @update:model-value="update('retain', $event)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { MqttQuery } from '@/api/routes/mqtt.js';
import { useFlowVariables } from './flowSchema.js';
import VariableInput from './VariableInput.vue';
import VariableSuggestions from './VariableSuggestions.vue';

import type { ConfigActionMqttProps, ConfigNodeUpdateEmits } from '../types.js';

const mqttQuery = new MqttQuery();

const props = defineProps<ConfigActionMqttProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const { options: availableVars } = useFlowVariables(() => props.nodeId);

const { data: recentTopicsData } = mqttQuery.getMqttTopicsQuery();

const recentTopics = computed(() => (recentTopicsData.value ?? []).slice(0, 15));

function insertVariable(variable: string) {
  const current = props.data.payload ?? '';
  emit('update:data', { payload: current + variable });
}

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
