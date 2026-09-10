<template>
  <div v-if="message.role === 'user'" class="group flex flex-col items-end">
    <div v-if="editing" class="w-full max-w-[min(82%,54ch)]">
      <Textarea
        ref="editRef"
        v-model="draft"
        auto-resize
        rows="2"
        class="w-full text-[15px] leading-relaxed"
        @keydown.enter.exact.prevent="saveEdit"
        @keydown.esc.prevent="editing = false"
      />
      <div class="mt-1.5 flex justify-end gap-1">
        <Button type="button" size="small" severity="secondary" text :label="$t('components.form.button.cancel')" @click="editing = false" />
        <Button type="button" size="small" :label="$t('views.assistant.edit_send')" :disabled="!draft.trim()" @click="saveEdit" />
      </div>
    </div>
    <div
      v-else
      class="cui-assistant-bubble max-w-[min(82%,54ch)] rounded-2xl rounded-br-[4px] px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-color"
    >
      {{ userText }}
      <div v-if="userImages.length" class="mt-2 flex flex-wrap gap-2">
        <img v-for="src in userImages" :key="src" :src="src" class="h-24 rounded-lg" alt="" />
      </div>
      <div v-if="userMedia.length" class="mt-2 flex flex-wrap gap-2">
        <span v-for="(item, index) in userMedia" :key="index" class="cui-assistant-media inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted">
          <i-mdi:music-note v-if="item.kind === 'audio'" class="w-3.5 h-3.5" />
          <i-mdi:video-outline v-else class="w-3.5 h-3.5" />
          {{ item.kind === 'audio' ? $t('views.assistant.attachment_audio') : $t('views.assistant.attachment_video') }}
        </span>
      </div>
    </div>
    <div v-if="!editing && !busy" class="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <Button
        v-tooltip.top="{ value: $t('views.assistant.edit_message') }"
        type="button"
        severity="secondary"
        text
        rounded
        class="cui-icon-md text-muted"
        @click="startEdit"
      >
        <template #icon>
          <i-mdi:pencil-outline class="w-3.5 h-3.5" />
        </template>
      </Button>
      <Button
        v-tooltip.top="{ value: $t('views.assistant.branch_here') }"
        type="button"
        severity="secondary"
        text
        rounded
        class="cui-icon-md text-muted"
        @click="emit('branch')"
      >
        <template #icon>
          <i-mdi:source-branch class="w-3.5 h-3.5" />
        </template>
      </Button>
      <Button
        v-tooltip.top="{ value: $t('views.assistant.delete_exchange') }"
        type="button"
        severity="secondary"
        text
        rounded
        class="cui-icon-md text-muted"
        @click="emit('delete')"
      >
        <template #icon>
          <i-mdi:delete-outline class="w-3.5 h-3.5" />
        </template>
      </Button>
    </div>
  </div>

  <div v-else class="cui-assistant-answer group flex flex-col">
    <div v-if="!continuation" class="mb-1.5 flex items-center gap-2 text-[12.5px] text-muted">
      <span class="cui-assistant-dot h-1.5 w-1.5 shrink-0 rounded-full" />
      <span>{{ $t('views.assistant.title') }}</span>
    </div>

    <div class="flex min-w-0 flex-col gap-2.5">
      <template v-for="(entry, index) in rows" :key="index">
        <div v-if="entry.kind === 'text'" class="text-[15px] leading-relaxed text-color break-words">
          <CuiMarkdownContent :content="entry.text" class="cui-assistant-markdown" />
          <span v-if="streaming && index === rows.length - 1" class="cui-assistant-caret" />
        </div>
        <CuiAssistantToolCall
          v-else-if="entry.kind === 'tool'"
          :part="entry.part"
          :result="entry.result"
          :extra-images="toolImages?.[entry.part.id]"
          :references="toolReferences?.[entry.part.id]"
          :cards="toolCards?.[entry.part.id]"
          :settings="toolSettings?.[entry.part.id]"
          :inline-attachments="!results"
        />
        <details v-else-if="entry.kind === 'steps'" class="cui-assistant-steps rounded-xl text-sm" :open="streaming">
          <summary class="flex cursor-pointer select-none items-center gap-2 px-3 py-2">
            <ProgressSpinner v-if="stepsRunning(entry)" class="w-4 h-4 m-0 shrink-0" stroke-width="6" />
            <i-mdi:check-circle-outline v-else class="w-4 h-4 shrink-0 text-success" />
            <span class="shrink-0 font-medium text-color">{{ $t('views.assistant.steps', { n: entry.items.length }) }}</span>
            <span class="truncate text-muted">{{ entry.items.map((item) => toolDisplayName(item.part.name)).join(', ') }}</span>
          </summary>
          <div class="flex flex-col gap-2 px-2 pb-2">
            <CuiAssistantToolCall
              v-for="item in entry.items"
              :key="item.part.id"
              :part="item.part"
              :result="item.result"
              :extra-images="toolImages?.[item.part.id]"
              :references="toolReferences?.[item.part.id]"
              :cards="toolCards?.[item.part.id]"
              :settings="toolSettings?.[item.part.id]"
              :inline-attachments="!results"
            />
          </div>
        </details>
        <details v-else-if="entry.kind === 'thinking'" class="text-xs text-muted">
          <summary class="cursor-pointer select-none">{{ $t('views.assistant.thinking') }}</summary>
          <pre class="mt-1 whitespace-pre-wrap break-words">{{ entry.text }}</pre>
        </details>
      </template>

      <span v-if="streaming && !rows.length" class="text-[15px] italic text-muted">{{ $t('views.assistant.thinking') }}<span class="cui-assistant-caret" /></span>

      <template v-if="results">
        <div v-if="results.images.length" class="flex flex-wrap gap-2">
          <button
            v-for="image in results.images"
            :key="image.src"
            type="button"
            class="cui-assistant-thumb cursor-pointer overflow-hidden rounded-lg"
            @click="openImage(image)"
          >
            <img :src="image.src" :alt="image.alt" class="h-32 w-auto object-cover" loading="lazy" />
          </button>
        </div>
        <CuiAssistantCard v-for="(card, index) in results.cards" :key="index" :card="card" :references="results.all" />
        <CuiAssistantSetting v-for="setting in results.settings" :key="setting" :setting="setting" />
        <CuiAssistantReferences v-if="results.references.length" :references="results.references" />
      </template>
    </div>

    <div v-if="stopped && !streaming" class="mt-2 flex items-center gap-2 text-[12.5px] text-muted">
      <span>{{ $t('views.assistant.answer_stopped') }}</span>
      <Button type="button" size="small" severity="secondary" text :label="$t('views.assistant.continue_answer')" :disabled="busy" @click="emit('continue')">
        <template #icon>
          <i-mdi:play-outline class="w-3.5 h-3.5" />
        </template>
      </Button>
    </div>

    <div v-if="!streaming && (answerText || stopped)" class="mt-2 flex items-center gap-2">
      <span v-if="usageLine" v-tooltip.top="{ value: usageDetails }" class="cui-assistant-usage text-[11px] tabular-nums text-muted">{{ usageLine }}</span>
      <div class="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <CuiActionButton
          v-if="answerText"
          v-tooltip.top="{ value: $t('views.assistant.copy_answer') }"
          :action-text="$t('views.assistant.copied')"
          :icon="CopyIcon"
          icon-class="w-3.5 h-3.5"
          :button-props="{ severity: 'secondary', text: true, rounded: true, class: 'cui-icon-md text-muted' }"
          @action="copyAnswer"
        />
        <Button
          v-tooltip.top="{ value: $t('views.assistant.regenerate') }"
          type="button"
          severity="secondary"
          text
          rounded
          class="cui-icon-md text-muted"
          :disabled="busy"
          @click="emit('regenerate')"
        >
          <template #icon>
            <i-mdi:refresh class="w-3.5 h-3.5" />
          </template>
        </Button>
        <Button
          v-tooltip.top="{ value: $t('views.assistant.branch_here') }"
          type="button"
          severity="secondary"
          text
          rounded
          class="cui-icon-md text-muted"
          :disabled="busy"
          @click="emit('branch')"
        >
          <template #icon>
            <i-mdi:source-branch class="w-3.5 h-3.5" />
          </template>
        </Button>
        <Button
          v-tooltip.top="{ value: $t('views.assistant.delete_exchange') }"
          type="button"
          severity="secondary"
          text
          rounded
          class="cui-icon-md text-muted"
          :disabled="busy"
          @click="emit('delete')"
        >
          <template #icon>
            <i-mdi:delete-outline class="w-3.5 h-3.5" />
          </template>
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CopyIcon from '~icons/mdi/content-copy';

import { copyToClipboard } from '@/common/utils.js';
import { resultContentParts, resultImages, toolDisplayName } from '@/components/CuiAssistantToolCall/types.js';
import { ATTACHMENT_PREFIX, messageText } from './types.js';

import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { ToolResultImage } from '@/components/CuiAssistantToolCall/types.js';
import type { AssistantSettingKey, DBAssistantCard } from '@shared/types';
import type { ToolCallPart, ToolResultPart } from '@tanstack/ai';
import type { CuiAssistantMessageEmits, CuiAssistantMessageProps } from './types.js';

type ToolEntry = { kind: 'tool'; part: ToolCallPart; result?: ToolResultPart };
type Entry = { kind: 'text'; text: string } | ToolEntry | { kind: 'thinking'; text: string };
type Row = Entry | { kind: 'steps'; items: ToolEntry[] };

const props = defineProps<CuiAssistantMessageProps>();
const emit = defineEmits<CuiAssistantMessageEmits>();

const { t } = useI18n();
const { openImageDialog } = useCuiDialog();

const RUNNING_STATES = ['awaiting-input', 'input-streaming', 'input-complete', 'approval-responded'];
const MAX_RESULT_REFERENCES = 6;

const editRef = useTemplateRef<{ $el: HTMLTextAreaElement }>('editRef');
const editing = ref(false);
const draft = ref('');

const userText = computed(() => messageText(props.message));

const userImages = computed(() =>
  props.message.parts
    .filter((part) => part.type === 'image')
    .map((part) => {
      if (part.type !== 'image') return '';
      if (part.source.type === 'url') {
        return part.source.value.startsWith(ATTACHMENT_PREFIX)
          ? (props.toolImages?.[part.source.value.slice(ATTACHMENT_PREFIX.length)]?.[0]?.src ?? '')
          : part.source.value;
      }
      return `data:${part.source.mimeType ?? 'image/jpeg'};base64,${part.source.value}`;
    })
    .filter(Boolean),
);

const userMedia = computed(() => props.message.parts.filter((part) => part.type === 'audio' || part.type === 'video').map((part) => ({ kind: part.type })));

const entries = computed<Entry[]>(() => {
  const results = new Map<string, ToolResultPart>();
  for (const part of props.message.parts) {
    if (part.type === 'tool-result') results.set(part.toolCallId, part);
  }

  const out: Entry[] = [];
  for (const part of props.message.parts) {
    if (part.type === 'text') {
      const last = out[out.length - 1];
      if (last?.kind === 'text') last.text += part.content;
      else if (part.content.trim()) out.push({ kind: 'text', text: part.content });
    } else if (part.type === 'tool-call') {
      out.push({ kind: 'tool', part, result: results.get(part.id) });
    } else if (part.type === 'thinking' && part.content.trim()) {
      out.push({ kind: 'thinking', text: part.content });
    }
  }
  return [...out.filter((entry) => entry.kind !== 'text'), ...out.filter((entry) => entry.kind === 'text')];
});

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  for (const entry of entries.value) {
    const last = out[out.length - 1];
    if (entry.kind === 'tool' && last?.kind === 'tool') out[out.length - 1] = { kind: 'steps', items: [last, entry] };
    else if (entry.kind === 'tool' && last?.kind === 'steps') last.items.push(entry);
    else out.push(entry);
  }
  return out;
});

const answerText = computed(() =>
  entries.value
    .filter((entry) => entry.kind === 'text')
    .map((entry) => (entry.kind === 'text' ? entry.text : ''))
    .join('\n\n')
    .trim(),
);

const results = computed(() => {
  if (props.streaming || !answerText.value) return null;
  const images: ToolResultImage[] = [];
  const cards: DBAssistantCard[] = [];
  const references: AssistantReference[] = [];
  const settings: AssistantSettingKey[] = [];
  const seen = new Set<string>();
  for (const entry of entries.value) {
    if (entry.kind !== 'tool') continue;
    const own = [...(props.toolImages?.[entry.part.id] ?? []), ...resultImages(resultContentParts(entry.result), toolDisplayName(entry.part.name))];
    for (const image of own) if (!seen.has(image.src) && seen.add(image.src)) images.push(image);
    cards.push(...(props.toolCards?.[entry.part.id] ?? []));
    for (const setting of props.toolSettings?.[entry.part.id] ?? []) if (!settings.includes(setting)) settings.push(setting);
    for (const reference of props.toolReferences?.[entry.part.id] ?? []) {
      const key = `${reference.kind}:${reference.id}`;
      if (!seen.has(key) && seen.add(key)) references.push(reference);
    }
  }
  const linked = new Set(cards.flatMap((card) => card.items.flatMap((item) => [item.episodeId, item.eventId].filter(Boolean))));
  const rest = references.filter((reference) => !linked.has(reference.id)).slice(0, MAX_RESULT_REFERENCES);
  return images.length || cards.length || rest.length || settings.length ? { images, cards, settings, references: rest, all: references } : null;
});

const usageLine = computed(() => {
  const usage = props.usage;
  if (!usage) return '';
  const seconds = usage.durationMs / 1000;
  const parts = [
    t('views.assistant.usage_tokens', { input: compactNumber(usage.promptTokens), output: compactNumber(usage.completionTokens) }),
    `${seconds.toFixed(1)} s`,
  ];
  if (usage.completionTokens && seconds > 0) parts.push(t('views.assistant.usage_speed', { n: Math.round(usage.completionTokens / seconds) }));
  if (usage.costUsd !== null) parts.push(t('views.assistant.usage_cost', { cost: formatCost(usage.costUsd) }));
  return parts.join(' · ');
});

const usageDetails = computed(() => {
  const usage = props.usage;
  if (!usage) return '';
  return t('views.assistant.usage_details', {
    model: usage.model,
    turns: usage.iterations,
    tools: usage.toolCalls,
    cached: compactNumber(usage.cachedTokens),
    reasoning: compactNumber(usage.reasoningTokens),
  });
});

function compactNumber(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;
}

function stepsRunning(entry: { items: ToolEntry[] }): boolean {
  return entry.items.some((item) => !item.result && RUNNING_STATES.includes(item.part.state));
}

async function startEdit(): Promise<void> {
  draft.value = userText.value;
  editing.value = true;
  await nextTick();
  editRef.value?.$el.focus();
}

function saveEdit(): void {
  const text = draft.value.trim();
  if (!text) return;
  editing.value = false;
  if (text !== userText.value) emit('edit', text);
}

function openImage(image: ToolResultImage): void {
  openImageDialog({ data: { title: image.alt, src: image.src, hideConfirmButton: true, hideCancelButton: true } });
}

async function copyAnswer(): Promise<void> {
  await copyToClipboard(answerText.value);
}
</script>

<style scoped>
.cui-assistant-steps {
  background: var(--card-background);
  border: 1px solid var(--border-color);
}

.cui-assistant-steps > summary::-webkit-details-marker {
  display: none;
}

.cui-assistant-steps > summary {
  list-style: none;
}

.cui-assistant-usage {
  opacity: 0.75;
}

.cui-assistant-thumb {
  border: 1px solid var(--border-color);
}

.cui-assistant-bubble {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.cui-assistant-dot {
  background: var(--p-primary-color);
}

.cui-assistant-caret {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.14em;
  background: var(--p-primary-color);
  animation: cui-assistant-blink 1.05s steps(1) infinite;
}

@keyframes cui-assistant-blink {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .cui-assistant-caret {
    animation: none;
  }
}
</style>
