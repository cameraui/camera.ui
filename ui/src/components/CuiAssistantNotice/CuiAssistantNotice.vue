<template>
  <Message :severity="severity" size="small" class="cui-assistant-notice">
    <div class="flex items-center gap-3">
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="text-sm font-medium">{{ title }}</span>
        <span class="text-xs">{{ text }}</span>
      </div>
      <slot />
    </div>
  </Message>
</template>

<script setup lang="ts">
import type { CuiAssistantNoticeProps } from './types.js';

withDefaults(defineProps<CuiAssistantNoticeProps>(), { severity: 'warn' });
</script>

<style scoped>
.cui-assistant-notice :deep(.p-message-text) {
  width: 100%;
}
</style>
