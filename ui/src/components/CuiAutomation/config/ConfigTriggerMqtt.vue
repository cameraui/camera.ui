<template>
  <div class="flex flex-col gap-4">
    <div class="cui-banner cui-banner-info">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.trigger_mqtt_desc') }}</span>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_topic') }}</label>
      <InputText :model-value="data.topic" placeholder="shellies/button/relay/0" class="font-mono text-xs" @update:model-value="update('topic', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.mqtt_topic_hint') }}</Message>
    </div>

    <div v-if="recentTopics.length" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_recent_topics') }}</label>
      <div class="flex flex-wrap gap-1.5">
        <Button v-for="topic in recentTopics" :key="topic" severity="secondary" outlined size="small" :label="topic" class="font-mono" @click="update('topic', topic)" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_match_mode') }}</label>
      <Select
        :model-value="matchMode"
        :options="matchModeOptions"
        option-label="label"
        option-value="value"
        class="w-full"
        @update:model-value="update('matchMode', $event)"
      />
    </div>

    <div v-if="matchMode === 'exact'" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_payload_filter') }}</label>
      <InputText :model-value="data.payloadFilter" placeholder="on" class="font-mono text-xs" @update:model-value="update('payloadFilter', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.mqtt_payload_filter_hint') }}</Message>
    </div>

    <template v-else-if="matchMode === 'json'">
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ t('components.automation_nodes.mqtt_json_path') }}</label>
        <InputText :model-value="data.jsonPath" placeholder="output" class="font-mono text-xs" @update:model-value="update('jsonPath', $event)" />
        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.mqtt_json_path_hint') }}</Message>
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ t('components.automation_nodes.mqtt_json_value') }}</label>
        <InputText :model-value="data.jsonValue" placeholder="true" class="font-mono text-xs" @update:model-value="update('jsonValue', $event)" />
        <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.mqtt_json_value_hint') }}</Message>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { MqttQuery } from '@/api/routes/mqtt.js';

import type { ConfigNodeUpdateEmits, ConfigTriggerMqttProps } from '../types.js';

const mqttQuery = new MqttQuery();

const props = defineProps<ConfigTriggerMqttProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

const { data: recentTopicsData } = mqttQuery.getMqttTopicsQuery();

const recentTopics = computed(() => (recentTopicsData.value ?? []).slice(0, 15));

const matchModeOptions = computed(() => [
  { label: t('components.automation_nodes.mqtt_match_any'), value: 'any' },
  { label: t('components.automation_nodes.mqtt_match_exact'), value: 'exact' },
  { label: t('components.automation_nodes.mqtt_match_json'), value: 'json' },
]);

const matchMode = computed(() => props.data.matchMode ?? 'any');

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
