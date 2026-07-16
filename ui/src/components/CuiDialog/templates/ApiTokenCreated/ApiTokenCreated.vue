<template>
  <div class="flex flex-col gap-6">
    <Message severity="warn">{{ $t('views.settings.api_tokens.created_warning') }}</Message>

    <div class="token-box">
      <span class="token-value">{{ token }}</span>
      <Button v-tooltip="{ value: $t('components.form.button.copy') }" text rounded class="cui-icon-md shrink-0" @click="onCopy">
        <template #icon>
          <CopyIcon width="100%" height="100%" />
        </template>
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/fluent/copy-16-filled';

import { copyToClipboard } from '@/common/utils.js';

import type { ApiTokenCreatedProps } from './types.js';

const props = defineProps<ApiTokenCreatedProps>();

const toast = useCuiToast();
const { t } = useI18n();

const { token } = toRefs(props);

async function onCopy(): Promise<void> {
  const ok = await copyToClipboard(token.value);
  if (ok) {
    toast.add({ severity: 'success', detail: t('components.toast.copied'), life: 1500 });
  } else {
    toast.add({ severity: 'error', detail: t('components.toast.copy_failed'), life: 3000 });
  }
}

async function onConfirm(): Promise<void> {
  // just close
}

defineExpose({
  onConfirm,
});
</script>

<style scoped>
.token-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--p-form-field-background);
  border: 1px solid var(--border-color);
}

.token-value {
  font-family: monospace;
  font-size: 0.875rem;
  word-break: break-all;
  flex: 1;
}
</style>
