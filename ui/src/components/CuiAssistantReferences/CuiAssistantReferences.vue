<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="(reference, index) in references"
      :key="`${reference.kind}:${reference.id}:${index}`"
      type="button"
      class="cui-assistant-ref flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs"
      :disabled="busy === reference.id"
      @click="open(reference)"
    >
      <i-mdi:video-outline v-if="reference.kind === 'camera'" class="w-3.5 h-3.5 shrink-0" />
      <i-mdi:download-outline v-else-if="reference.kind === 'download'" class="w-3.5 h-3.5 shrink-0" />
      <i-mdi:play-circle-outline v-else class="w-3.5 h-3.5 shrink-0" />
      <span class="truncate max-w-[16rem]">{{ reference.label || fallbackLabel(reference) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { AssistantReference, CuiAssistantReferencesProps } from './types.js';

defineProps<CuiAssistantReferencesProps>();

const { t } = useI18n();
const { busy, open } = useAssistantReferences();

function fallbackLabel(reference: AssistantReference): string {
  if (reference.kind === 'camera') return t('views.assistant.open_camera');
  if (reference.kind === 'episode') return t('views.assistant.open_episode');
  if (reference.kind === 'download') return t('views.assistant.download_clip');
  return t('views.assistant.open_recording');
}
</script>

<style scoped>
.cui-assistant-ref {
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  color: var(--text-color-faded);
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.cui-assistant-ref:hover:enabled {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
}

.cui-assistant-ref:disabled {
  opacity: 0.6;
}
</style>
