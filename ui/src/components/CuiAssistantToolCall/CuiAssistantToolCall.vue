<template>
  <div class="cui-assistant-tool rounded-xl text-sm">
    <button type="button" class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left" @click="expanded = !expanded">
      <ProgressSpinner v-if="running" class="w-4 h-4 m-0 shrink-0" stroke-width="6" />
      <i-mdi:alert-circle-outline v-else-if="failed" class="w-4 h-4 shrink-0 text-danger" />
      <i-mdi:shield-alert-outline v-else-if="awaitingApproval" class="w-4 h-4 shrink-0 text-warning" />
      <i-mdi:close-circle-outline v-else-if="rejected || unfinished" class="w-4 h-4 shrink-0 text-muted" />
      <i-mdi:check-circle-outline v-else class="w-4 h-4 shrink-0 text-success" />

      <span class="font-medium truncate text-color">{{ displayName }}</span>
      <span class="text-muted truncate">{{ statusLabel }}</span>

      <span class="ml-auto shrink-0 text-muted">
        <i-mdi:chevron-up v-if="expanded" class="w-4 h-4" />
        <i-mdi:chevron-down v-else class="w-4 h-4" />
      </span>
    </button>

    <div v-if="inlineAttachments && images.length" class="flex flex-wrap gap-2 px-3 pb-2">
      <button v-for="image in images" :key="image.src" type="button" class="cui-assistant-thumb cursor-pointer overflow-hidden rounded-lg" @click="openImage(image)">
        <img :src="image.src" :alt="image.alt" class="h-24 w-auto object-cover" loading="lazy" />
      </button>
    </div>

    <div v-if="inlineAttachments && cards?.length" class="flex flex-col gap-2 px-3 pb-2">
      <CuiAssistantCard v-for="(card, index) in cards" :key="index" :card="card" :references="references" />
    </div>

    <div v-if="inlineAttachments && (settings?.length || notices?.length)" class="flex flex-col gap-2 px-3 pb-2">
      <CuiAssistantSetting v-for="setting in settings" :key="setting" :setting="setting" :model-id="modelId" />
      <CuiAssistantNotice
        v-for="notice in notices"
        :key="`${notice.capability}:${notice.model}`"
        :title="$t(`views.assistant.notice_${notice.capability}_title`, { model: notice.model })"
        :text="$t(`views.assistant.notice_${notice.capability}_text`)"
      />
    </div>

    <div v-if="inlineAttachments && references?.length" class="px-3 pb-2">
      <CuiAssistantReferences :references="references" />
    </div>

    <div v-if="expanded" class="cui-assistant-tool-details px-3 py-2 flex flex-col gap-2">
      <div v-if="argsText">
        <span class="text-xs uppercase tracking-wide text-muted">{{ $t('views.assistant.tool_arguments') }}</span>
        <pre class="cui-assistant-pre mt-1 max-h-64 overflow-auto rounded-lg p-2 text-xs whitespace-pre-wrap break-words font-mono">{{ argsText }}</pre>
      </div>
      <div v-if="resultText">
        <span class="text-xs uppercase tracking-wide text-muted">{{ $t('views.assistant.tool_result') }}</span>
        <pre class="cui-assistant-pre mt-1 max-h-64 overflow-auto rounded-lg p-2 text-xs whitespace-pre-wrap break-words font-mono">{{ resultText }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { resultContentParts, resultImages, safeParseJson, toolDisplayName } from './types.js';

import type { CuiAssistantToolCallProps, ToolResultImage } from './types.js';

const props = withDefaults(defineProps<CuiAssistantToolCallProps>(), { inlineAttachments: true, busy: true });

const { t } = useI18n();
const { openImageDialog } = useCuiDialog();

const expanded = ref(false);

const displayName = computed(() => toolDisplayName(props.part.name));

const started = computed(() => ['awaiting-input', 'input-streaming', 'input-complete', 'approval-responded'].includes(props.part.state) && !props.result);
const running = computed(() => started.value && props.busy);
const unfinished = computed(() => started.value && !props.busy);
const awaitingApproval = computed(() => props.part.state === 'approval-requested');
const rejected = computed(() => props.part.approval?.needsApproval === true && props.part.approval.approved === false);
const failed = computed(() => props.part.state === 'error' || props.result?.state === 'error' || Boolean(props.result?.error));

const statusLabel = computed(() => {
  if (running.value) return t('views.assistant.tool_running');
  if (unfinished.value) return t('views.assistant.tool_unfinished');
  if (awaitingApproval.value) return t('views.assistant.tool_waiting_approval');
  if (rejected.value) return t('views.assistant.tool_rejected');
  if (failed.value) return t('views.assistant.tool_failed');
  return '';
});

const argsText = computed(() => {
  const input = props.part.input ?? safeParseJson(props.part.arguments);
  if (input === undefined || input === null) return '';
  if (typeof input === 'object' && Object.keys(input as object).length === 0) return '';
  return pretty(input);
});

const resultParts = computed(() => resultContentParts(props.result));

const resultText = computed(() => {
  if (props.result?.error) return props.result.error;
  const content = props.result?.content;
  if (content === undefined) return '';
  if (typeof content === 'string' && !resultParts.value) return pretty(safeParseJson(content) ?? content);
  return (resultParts.value ?? [])
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('\n');
});

const images = computed<ToolResultImage[]>(() => [...(props.extraImages ?? []), ...resultImages(resultParts.value, displayName.value)]);

function pretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function openImage(image: ToolResultImage): void {
  openImageDialog({ data: { title: displayName.value, src: image.src, hideConfirmButton: true, hideCancelButton: true } });
}
</script>

<style scoped>
.cui-assistant-tool {
  background: var(--card-background);
  border: 1px solid var(--border-color);
}

.cui-assistant-tool-details {
  border-top: 1px solid var(--border-color);
}

.cui-assistant-thumb {
  border: 1px solid var(--border-color);
}

.cui-assistant-pre {
  background: var(--card-inner-background);
  color: var(--text-color);
}
</style>
