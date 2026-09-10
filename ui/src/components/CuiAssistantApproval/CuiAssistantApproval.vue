<template>
  <div class="cui-assistant-approval rounded-xl px-4 py-3 text-sm flex flex-col gap-3">
    <div class="flex items-start gap-2">
      <i-mdi:shield-alert-outline class="w-5 h-5 shrink-0 text-warning mt-0.5" />
      <div class="min-w-0 flex-1">
        <div class="font-medium text-color">{{ $t('views.assistant.approval_title', { tool: displayName }) }}</div>
        <div class="text-muted">{{ $t('views.assistant.approval_hint') }}</div>
        <pre v-if="argsText && !editing" class="cui-assistant-pre mt-2 max-h-40 overflow-auto rounded-lg p-2 text-xs whitespace-pre-wrap break-words font-mono">{{
          argsText
        }}</pre>
        <div v-if="editing" class="mt-2 flex flex-col gap-1">
          <Textarea v-model="draft" auto-resize rows="4" class="w-full font-mono text-xs" />
          <Message v-if="draftError" severity="warn" variant="simple" size="small">{{ $t('views.assistant.approval_invalid_json') }}</Message>
          <Message v-else severity="secondary" variant="simple" size="small">{{ $t('views.assistant.approval_edit_hint') }}</Message>
        </div>
      </div>
    </div>

    <div class="flex justify-end gap-2">
      <Button
        v-if="argsText"
        type="button"
        severity="secondary"
        text
        class="cui-button-small mr-auto"
        :disabled="!canResolve || busy"
        :label="editing ? $t('components.form.button.cancel') : $t('views.assistant.approval_edit')"
        @click="toggleEdit"
      />
      <Button
        type="button"
        severity="secondary"
        outlined
        class="cui-button-small"
        :disabled="!canResolve || busy"
        :label="$t('views.assistant.reject')"
        @click="emit('reject')"
      />
      <Button
        type="button"
        class="cui-button-small"
        :disabled="!canResolve || busy || draftError"
        :loading="busy"
        :label="$t('views.assistant.approve')"
        @click="approve"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { toolDisplayName } from '@/components/CuiAssistantToolCall/types.js';

import type { CuiAssistantApprovalEmits, CuiAssistantApprovalProps } from './types.js';

const props = defineProps<CuiAssistantApprovalProps>();
const emit = defineEmits<CuiAssistantApprovalEmits>();

const editing = ref(false);
const draft = ref('');

const displayName = computed(() => toolDisplayName(props.toolName));

const argsText = computed(() => {
  if (props.args === undefined || props.args === null) return '';
  if (typeof props.args === 'object' && Object.keys(props.args as object).length === 0) return '';
  try {
    return JSON.stringify(props.args, null, 2);
  } catch {
    return String(props.args);
  }
});

const draftError = computed(() => {
  if (!editing.value) return false;
  try {
    const parsed: unknown = JSON.parse(draft.value);
    return !parsed || typeof parsed !== 'object' || Array.isArray(parsed);
  } catch {
    return true;
  }
});

function toggleEdit(): void {
  editing.value = !editing.value;
  if (editing.value) draft.value = argsText.value;
}

function approve(): void {
  if (!editing.value) {
    emit('approve');
    return;
  }
  if (draftError.value) return;
  const edited = JSON.parse(draft.value) as Record<string, unknown>;
  emit('approve', argsText.value === draft.value ? undefined : edited);
}
</script>

<style scoped>
.cui-assistant-approval {
  background: color-mix(in srgb, var(--warning-color) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--warning-color) 45%, transparent);
}

.cui-assistant-pre {
  background: var(--card-inner-background);
  color: var(--text-color);
}
</style>
