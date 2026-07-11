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

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.mqtt_payload_filter') }}</label>
      <InputText :model-value="data.payloadFilter" placeholder="on" class="font-mono text-xs" @update:model-value="update('payloadFilter', $event)" />
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.mqtt_payload_filter_hint') }}</Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConfigNodeUpdateEmits, ConfigTriggerMqttProps } from '../types.js';

defineProps<ConfigTriggerMqttProps>();

const emit = defineEmits<ConfigNodeUpdateEmits>();

const { t } = useI18n();

function update(key: string, value: unknown) {
  emit('update:data', { [key]: value });
}
</script>
