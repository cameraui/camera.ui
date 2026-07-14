<template>
  <div class="flex flex-col gap-4">
    <div class="cui-banner cui-banner-info">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.trigger_webhook_desc') }}</span>
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.webhook_url') }}</label>
      <InputGroup>
        <InputText :model-value="webhookUrl" readonly class="font-mono text-xs" />
        <InputGroupAddon>
          <CuiActionButton
            :action-text="t('components.automation_nodes.webhook_secret_copied')"
            :icon="CopyIcon"
            :button-props="{ severity: 'secondary', text: true }"
            @action="copy(webhookUrl)"
          />
        </InputGroupAddon>
      </InputGroup>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.webhook_url_hint') }}</Message>
    </div>

    <div v-if="data.webhookSecret" class="flex flex-col field-gap">
      <label class="cui-label">{{ t('components.automation_nodes.webhook_secret') }}</label>
      <InputGroup>
        <InputText :model-value="data.webhookSecret" readonly class="font-mono text-xs" />
        <InputGroupAddon>
          <CuiActionButton
            :action-text="t('components.automation_nodes.webhook_secret_copied')"
            :icon="CopyIcon"
            :button-props="{ severity: 'secondary', text: true }"
            @action="copy(data.webhookSecret!)"
          />
        </InputGroupAddon>
      </InputGroup>
      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ t('components.automation_nodes.webhook_secret_hint') }}</Message>
    </div>
    <div v-else class="cui-banner cui-banner-warn">
      <i-mdi:information-outline class="w-5 h-5 shrink-0" />
      <span>{{ t('components.automation_nodes.webhook_secret_save_hint') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/carbon/copy';

import { copyToClipboard } from '@/common/utils.js';

import type { ConfigTriggerWebhookProps } from '../types.js';

const props = defineProps<ConfigTriggerWebhookProps>();

const { t } = useI18n();

const webhookUrl = computed(() => {
  const origin = window.location.origin;
  return `${origin}/api/automations/webhook/${props.data.webhookId}`;
});

function copy(text: string) {
  copyToClipboard(text);
}
</script>
