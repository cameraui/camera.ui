<template>
  <div ref="rootRef" class="relative flex h-full min-h-0 flex-col">
    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto px-4" :class="{ 'flex flex-col pb-[8vh]': welcome }" @scroll.passive="onScroll">
      <div v-if="welcome" ref="welcomeRef" class="m-auto w-full max-w-2xl py-6">
        <div class="mb-7 flex flex-col items-center gap-3 text-center">
          <div class="cui-assistant-mark flex h-11 w-11 items-center justify-center rounded-xl">
            <i-mdi:robot-outline class="w-6 h-6 text-color" />
          </div>
          <h1 class="m-0 text-[clamp(24px,4vw,32px)] font-semibold leading-tight tracking-tight text-color">
            {{ greeting }}
            <span class="mt-2 block text-[15px] font-normal tracking-normal text-muted">{{ $t('views.assistant.greeting_sub') }}</span>
          </h1>
        </div>

        <CuiAssistantNotice
          v-if="activeModel?.capabilities?.toolCalling === false"
          class="mb-4"
          :title="$t('views.assistant.notice_tools_title', { model: activeModel.name })"
          :text="$t('views.assistant.notice_tools_text')"
        />

        <CuiAssistantComposer
          ref="composerRef"
          :busy="chat.busy.value"
          :vision-missing="visionMissing"
          :compact="compact"
          :placeholder="$t('views.assistant.composer_placeholder')"
          :tray-open="Boolean(tray)"
          :style="{ '--cui-tray-max': `${trayMax}px` }"
          @send="send"
          @stop="chat.stop()"
        >
          <template #tray>
            <Transition name="cui-assistant-tray" :duration="220">
              <CuiAssistantTray
                v-if="tray"
                v-model:instructions="instructions"
                v-model:disabled-groups="disabledGroups"
                v-model:model-id="modelId"
                v-model:profile-id="profileId"
                :panel="tray"
                :groups="toolGroups"
                :models="models"
                :default-model-id="defaultEntry?._id"
                @close="tray = null"
                @refocus="composerRef?.focus()"
              />
            </Transition>
          </template>
          <template #tools>
            <span class="relative shrink-0">
              <Button
                v-tooltip.top="{ value: $t('views.assistant.tools_title') }"
                type="button"
                severity="secondary"
                text
                rounded
                :disabled="chat.busy.value"
                @click="toggleTray('tools')"
              >
                <template #icon>
                  <i-mdi:tune class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="disabledGroups.length" class="cui-assistant-badge">{{ enabledGroups.length }}</span>
            </span>
            <span class="relative shrink-0">
              <Button v-tooltip.top="{ value: $t('views.assistant.memory_title') }" type="button" severity="secondary" text rounded @click="toggleTray('memory')">
                <template #icon>
                  <i-mdi:brain class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="memory?.length" class="cui-assistant-badge">{{ memory.length }}</span>
            </span>
          </template>
        </CuiAssistantComposer>

        <div v-if="suggestions.length" class="mt-4 flex flex-wrap justify-center gap-2">
          <button
            v-for="suggestion in suggestions"
            :key="suggestion"
            type="button"
            class="cui-assistant-chip cursor-pointer rounded-full px-3.5 py-1.5 text-[13px]"
            @click="send({ text: suggestion, attachments: [] })"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <div v-else ref="contentRef" class="mx-auto flex w-full max-w-[720px] flex-col gap-7 pt-6 pb-4">
        <CuiAssistantMessage
          v-for="row in rows"
          :key="row.message.id"
          :message="row.message"
          :streaming="chat.isLoading.value && row.lastIndex === chat.messages.value.length - 1 && row.message.role === 'assistant'"
          :working="waiting && row.lastIndex === chat.messages.value.length - 1 && row.message.role === 'assistant'"
          :busy="chat.busy.value"
          :continuation="row.continuation"
          :stopped="row.ids.includes(chat.stoppedId.value ?? '')"
          :tool-images="chat.toolImages.value"
          :tool-references="chat.toolReferences.value"
          :tool-cards="chat.toolCards.value"
          :tool-settings="chat.toolSettings.value"
          :tool-notices="chat.toolNotices.value"
          :model-id="activeModel?._id"
          :usage="rowUsage(row)"
          :class="{ '-mt-5': row.continuation }"
          @regenerate="regenerate(row.index)"
          @edit="editMessage(row.index, $event)"
          @delete="deleteExchange(row.index)"
          @branch="branchAt(row.index)"
          @continue="chat.continueAnswer()"
        />

        <CuiAssistantMessage
          v-if="pendingAnswer"
          :message="PENDING_ANSWER"
          working
          busy
          :continuation="isContinueMark(chat.messages.value.at(-1))"
          :class="{ '-mt-5': isContinueMark(chat.messages.value.at(-1)) }"
        />

        <CuiAssistantApproval
          v-for="interrupt in chat.approvals.value"
          :key="interrupt.id"
          :tool-name="interrupt.toolName"
          :args="interrupt.originalArgs"
          :can-resolve="interrupt.canResolve"
          :busy="chat.resuming.value"
          @approve="(edited) => (edited ? interrupt.resolveInterrupt(true, { editedArgs: edited }) : interrupt.resolveInterrupt(true))"
          @reject="interrupt.resolveInterrupt(false)"
        />

        <CuiAssistantQuestion
          v-for="interrupt in chat.questions.value"
          :key="interrupt.id"
          :question="interrupt.payload ?? { toolCallId: interrupt.id, question: '', kind: 'text' }"
          :can-resolve="interrupt.canResolve"
          :busy="chat.resuming.value"
          @answer="interrupt.resolveInterrupt({ answer: $event })"
          @skip="interrupt.cancel()"
        />

        <div v-if="chat.pausedElsewhere.value" class="cui-assistant-note pl-3 text-[13.5px] text-muted">{{ $t('views.assistant.paused_elsewhere') }}</div>

        <div v-if="chat.error.value" class="cui-assistant-note pl-3 text-[13.5px] text-muted">
          <strong class="font-medium text-color-faded">{{ chat.error.value.message }}</strong>
        </div>
      </div>
    </div>

    <div v-if="!welcome" ref="bottomRef" class="relative px-4 pb-3 pt-6">
      <div class="mx-auto w-full max-w-[720px]">
        <div v-if="chat.queue.value.length" class="mb-2 flex flex-col gap-1">
          <div v-for="item in chat.queue.value" :key="item.id" class="cui-assistant-queued flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] text-muted">
            <i-mdi:clock-outline class="w-3.5 h-3.5 shrink-0" />
            <span class="min-w-0 flex-1 truncate">{{ typeof item.content === 'string' ? item.content : $t('views.assistant.queued_attachment') }}</span>
            <Button
              v-tooltip.top="{ value: $t('views.assistant.queue_cancel') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md shrink-0"
              @click="chat.cancelQueued(item.id)"
            >
              <template #icon>
                <i-mdi:close class="w-3.5 h-3.5" />
              </template>
            </Button>
          </div>
        </div>
        <CuiAssistantComposer
          ref="composerRef"
          :busy="chat.busy.value"
          :vision-missing="visionMissing"
          :compact="compact"
          :placeholder="$t('views.assistant.composer_placeholder')"
          :tray-open="Boolean(tray)"
          :style="{ '--cui-tray-max': `${trayMax}px` }"
          @send="send"
          @stop="chat.stop()"
        >
          <template #above>
            <Transition name="cui-assistant-fade">
              <Button
                v-if="!atBottom && !tray"
                v-tooltip.top="{ value: $t('views.assistant.scroll_to_latest') }"
                type="button"
                rounded
                severity="secondary"
                class="cui-assistant-jump mb-2"
                data-keep-keyboard
                @pointerdown.prevent
                @mousedown.prevent
                @click="jumpToBottom"
              >
                <template #icon>
                  <i-mdi:chevron-down class="w-4 h-4" />
                </template>
              </Button>
            </Transition>
          </template>
          <template #tray>
            <Transition name="cui-assistant-tray" :duration="220">
              <CuiAssistantTray
                v-if="tray"
                v-model:instructions="instructions"
                v-model:disabled-groups="disabledGroups"
                v-model:model-id="modelId"
                v-model:profile-id="profileId"
                :panel="tray"
                :groups="toolGroups"
                :models="models"
                :default-model-id="defaultEntry?._id"
                @close="tray = null"
                @refocus="composerRef?.focus()"
              />
            </Transition>
          </template>
          <template #tools>
            <span class="relative shrink-0">
              <Button
                v-tooltip.top="{ value: $t('views.assistant.tools_title') }"
                type="button"
                severity="secondary"
                text
                rounded
                :disabled="chat.busy.value"
                @click="toggleTray('tools')"
              >
                <template #icon>
                  <i-mdi:tune class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="disabledGroups.length" class="cui-assistant-badge">{{ enabledGroups.length }}</span>
            </span>
            <span class="relative shrink-0">
              <Button v-tooltip.top="{ value: $t('views.assistant.memory_title') }" type="button" severity="secondary" text rounded @click="toggleTray('memory')">
                <template #icon>
                  <i-mdi:brain class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="memory?.length" class="cui-assistant-badge">{{ memory.length }}</span>
            </span>
          </template>
        </CuiAssistantComposer>
        <div class="mt-2 text-center text-[11.5px] text-muted">{{ $t('views.assistant.disclaimer') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery, branchAssistantThread, getAssistantThread, replaceAssistantThreadMessages } from '@/api/routes/assistant.js';
import { defaultModel } from '@/common/assistantModels.js';
import { isContinueMark } from '@/components/CuiAssistantMessage/types.js';
import { KEYBOARD_EASING, KEYBOARD_GAP, KEYBOARD_MS, PENDING_ANSWER } from './types.js';

import type CuiAssistantComposer from '@/components/CuiAssistantComposer/CuiAssistantComposer.vue';
import type { ComposerSubmission } from '@/components/CuiAssistantComposer/types.js';
import type { AssistantTrayPanel } from '@/components/CuiAssistantTray/types.js';
import type { AssistantUsageEvent, DBAssistantThread } from '@shared/types';
import type { ContentPart, UIMessage } from '@tanstack/ai';
import type { ConversationRow, CuiAssistantConversationEmits, CuiAssistantConversationProps, ToolGroupOption } from './types.js';

const assistantQuery = new AssistantQuery();

const props = withDefaults(defineProps<CuiAssistantConversationProps>(), {
  initialPrompt: undefined,
  suggestions: () => [],
  approvalTools: () => [],
  tools: () => [],
  compact: false,
});
const emit = defineEmits<CuiAssistantConversationEmits>();

const { t, locale } = useI18n();
const toast = useCuiToast();
const coarsePointer = useMediaQuery('(pointer: coarse)');
const { keyboardInset } = useKeyboardInset();

const { data: memory } = assistantQuery.memoryQuery();
const { data: info } = assistantQuery.getAssistantInfoQuery();

const scrollRef = useTemplateRef<HTMLDivElement>('scrollRef');
const contentRef = useTemplateRef<HTMLDivElement>('contentRef');
const composerRef = useTemplateRef<InstanceType<typeof CuiAssistantComposer>>('composerRef');
const welcomeRef = useTemplateRef<HTMLDivElement>('welcomeRef');
const bottomRef = useTemplateRef<HTMLDivElement>('bottomRef');
const pinnedToBottom = ref(true);
const disabledGroups = ref<string[]>([]);
const instructions = ref('');
const profileId = ref<string | null>(null);
const tray = ref<AssistantTrayPanel | null>(null);
const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const atBottom = ref(true);

let welcomeRest: number | undefined;
let keyboardFlips = 0;

const { top: rootTop } = useElementBounding(rootRef);
const { top: composerTop } = useElementBounding(computed(() => composerRef.value?.$el as HTMLElement | undefined));
const modelId = ref(props.initialModelId ?? null);

const threadId = computed(() => props.threadId);

const chat = useAssistantChat({
  threadId,
  initialMessages: props.initialMessages,
  initialAttachments: props.initialAttachments,
  language: locale,
  disabledGroups,
  instructions,
  modelId,
  approvalTools: props.approvalTools,
  onFinish: () => emit('finished'),
  onError: onChatError,
});

const welcome = computed(() => chat.messages.value.length === 0);
const trayMax = computed(() => Math.max(160, Math.round(composerTop.value - rootTop.value - 12)));

const models = computed(() => info.value?.settings.models ?? []);
const defaultEntry = computed(() => (info.value ? defaultModel(info.value.settings) : undefined));
const activeModel = computed(() => models.value.find((entry) => entry._id === modelId.value) ?? defaultEntry.value);
const visionMissing = computed(() => (activeModel.value?.capabilities?.vision === false ? activeModel.value.name : undefined));
const waiting = computed(() => chat.busy.value && !chat.approvals.value.length && !chat.questions.value.length && !chat.pausedElsewhere.value);
const pendingAnswer = computed(() => waiting.value && chat.messages.value.at(-1)?.role !== 'assistant');

const rows = computed<ConversationRow[]>(() => {
  const list = chat.messages.value;
  const out: ConversationRow[] = [];
  list.forEach((message, index) => {
    if (isContinueMark(message)) return;
    const continuation = message.role === 'assistant' && isContinueMark(list[index - 1]);
    const last = out[out.length - 1];
    if (message.role === 'assistant' && !continuation && last?.message.role === 'assistant' && !last.continuation && last.lastIndex === index - 1) {
      last.message = { ...last.message, parts: [...last.message.parts, ...message.parts] };
      last.ids.push(message.id);
      last.lastIndex = index;
      return;
    }
    out.push({ message, index, lastIndex: index, ids: [message.id], continuation });
  });
  return out;
});

const toolGroups = computed<ToolGroupOption[]>(() => {
  const groups = new Map<string, ToolGroupOption>();
  for (const tool of props.tools) {
    const label =
      tool.group === 'core'
        ? t('views.assistant.tool_group_core')
        : tool.group === 'docs'
          ? t('views.assistant.tool_group_docs')
          : tool.group === 'terminal'
            ? t('views.assistant.tool_group_terminal')
            : tool.source.kind === 'plugin'
              ? tool.source.pluginName
              : tool.source.kind === 'external'
                ? tool.source.serverName
                : tool.group;
    const entry = groups.get(tool.group) ?? { id: tool.group, label, count: 0 };
    entry.count += 1;
    groups.set(tool.group, entry);
  }
  const order = (id: string) => (id === 'core' ? 0 : id === 'docs' ? 1 : id.startsWith('plugin:') ? 2 : 3);
  return Array.from(groups.values()).sort((a, b) => order(a.id) - order(b.id) || a.label.localeCompare(b.label));
});

const enabledGroups = computed({
  get: () => toolGroups.value.filter((group) => !disabledGroups.value.includes(group.id)).map((group) => group.id),
  set: (ids: string[]) => {
    disabledGroups.value = toolGroups.value.filter((group) => !ids.includes(group.id)).map((group) => group.id);
  },
});

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return t('views.assistant.greeting_night');
  if (hour < 11) return t('views.assistant.greeting_morning');
  if (hour < 18) return t('views.assistant.greeting_day');
  return t('views.assistant.greeting_evening');
});

function rowUsage(row: ConversationRow): AssistantUsageEvent | undefined {
  for (const id of row.ids) if (chat.usage.value[id]) return chat.usage.value[id];
  return undefined;
}

function onScroll(): void {
  const el = scrollRef.value;
  if (!el || keyboardFlips) return;
  pinnedToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  measureBottom();
}

function toggleTray(panel: AssistantTrayPanel): void {
  tray.value = tray.value === panel ? null : panel;
}

function measureBottom(): void {
  const el = scrollRef.value;
  if (!el || keyboardFlips) return;
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
}

function welcomeOffset(): number | undefined {
  const container = scrollRef.value;
  const block = welcomeRef.value;
  if (!container || !block) return undefined;
  return block.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
}

function placeWelcome(): void {
  const container = scrollRef.value;
  const block = welcomeRef.value;
  const composer = composerRef.value?.$el as HTMLElement | undefined;
  if (!container || !block || !composer) return;
  if (!keyboardInset.value || welcomeRest === undefined) {
    block.style.removeProperty('margin-top');
    return;
  }
  const composerBottom = composer.getBoundingClientRect().bottom - block.getBoundingClientRect().top;
  const room = container.clientHeight - composerBottom - KEYBOARD_GAP;
  block.style.marginTop = `${Math.max(0, Math.min(welcomeRest, room))}px`;
  container.scrollTop = 0;
}

function followKeyboard(): () => void {
  const moving = [welcomeRef.value, bottomRef.value, contentRef.value].filter((el): el is HTMLDivElement => Boolean(el));
  const before = moving.map((el) => el.getBoundingClientRect().top);
  if (!keyboardInset.value) welcomeRest = welcomeOffset();
  return () => {
    if (welcome.value) placeWelcome();
    else if (pinnedToBottom.value) scrollToBottom();
    const flips = moving.flatMap((el, index) => {
      const shift = before[index] - el.getBoundingClientRect().top;
      if (Math.abs(shift) < 1) return [];
      return [
        el
          .animate([{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }], { duration: KEYBOARD_MS, easing: KEYBOARD_EASING })
          .finished.catch(() => undefined),
      ];
    });
    if (!flips.length) return;
    keyboardFlips++;
    Promise.all(flips).then(() => {
      keyboardFlips--;
      if (pinnedToBottom.value && !welcome.value) scrollToBottom();
      measureBottom();
    });
  };
}

function jumpToBottom(): void {
  pinnedToBottom.value = true;
  scrollToBottom();
  measureBottom();
}

function scrollToBottom(): void {
  const el = scrollRef.value;
  if (!el || keyboardFlips) return;
  el.scrollTop = el.scrollHeight;
}

function exchangeEnd(index: number): number {
  const list = chat.messages.value;
  let end = index + 1;
  while (end < list.length && (list[end].role !== 'user' || isContinueMark(list[end]))) end++;
  return end;
}

function exchangeStart(index: number): number {
  const list = chat.messages.value;
  let start = index;
  while (start > 0 && (list[start].role !== 'user' || isContinueMark(list[start]))) start--;
  return start;
}

async function regenerate(index: number): Promise<void> {
  pinnedToBottom.value = true;
  chat.setMessages(chat.messages.value.slice(0, index));
  await chat.reload();
}

async function editMessage(index: number, text: string): Promise<void> {
  pinnedToBottom.value = true;
  const media = chat.messages.value[index].parts.filter((part) => part.type === 'image' || part.type === 'audio' || part.type === 'video') as unknown as ContentPart[];
  chat.setMessages(chat.messages.value.slice(0, index));
  if (!media.length) await chat.sendMessage(text);
  else await chat.sendMessage({ content: [{ type: 'text', content: text }, ...media] });
}

async function deleteExchange(index: number): Promise<void> {
  const list = chat.messages.value;
  const next = [...list.slice(0, exchangeStart(index)), ...list.slice(exchangeEnd(index))];
  chat.setMessages(next as UIMessage[]);
  if (!next.length) {
    emit('emptied');
    return;
  }
  try {
    await replaceAssistantThreadMessages(props.threadId, next as UIMessage[]);
  } catch (error: any) {
    // a conversation that never ran is not stored yet, the local list is all there is
    if (error?.response?.status !== 404) toast.add({ severity: 'error', detail: error.message, life: 5000 });
  }
}

async function branchAt(index: number): Promise<void> {
  try {
    const thread = await branchAssistantThread(props.threadId, exchangeEnd(index) - 1);
    emit('branched', thread);
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.status === 404 ? t('views.assistant.branch_unsaved') : error.message, life: 5000 });
  }
}

async function send(submission: ComposerSubmission): Promise<void> {
  pinnedToBottom.value = true;
  if (!submission.attachments.length) {
    await chat.sendMessage(submission.text);
    return;
  }
  const content: ContentPart[] = submission.text ? [{ type: 'text', content: submission.text }] : [];
  for (const item of submission.attachments) {
    content.push({ type: item.kind, source: { type: 'data', value: item.data, mimeType: item.mimeType } });
  }
  await chat.sendMessage({ content });
}

function onChatError(error: Error): void {
  if (error.message.includes('status: 409')) {
    reloadThread();
    return;
  }
  toast.add({ severity: 'error', detail: error.message, life: 5000 });
}

async function reloadThread(): Promise<void> {
  const thread = await getAssistantThread(props.threadId).catch(() => undefined);
  if (!thread) return;
  chat.replaceFromStore(thread.messages as UIMessage[], thread.attachments);
  toast.add({ severity: 'info', detail: t('views.assistant.thread_reloaded'), life: 5000 });
}

function refreshFromStore(thread: DBAssistantThread): boolean {
  if (chat.busy.value) return false;
  chat.replaceFromStore(thread.messages as UIMessage[], thread.attachments);
  return true;
}

watch(
  () => chat.messages.value,
  async () => {
    if (!pinnedToBottom.value) return;
    await nextTick();
    scrollToBottom();
  },
  { deep: true },
);

watch(
  () => chat.approvals.value.length + chat.questions.value.length,
  async (pending, before) => {
    if (pending <= before) return;
    pinnedToBottom.value = true;
    await nextTick();
    scrollToBottom();
  },
);

watch(welcome, async (isWelcome) => {
  if (!isWelcome) welcomeRest = undefined;
  if (coarsePointer.value) return;
  await nextTick();
  composerRef.value?.focus();
});

useResizeObserver([scrollRef, contentRef, welcomeRef], () => {
  if (welcome.value) placeWelcome();
  else if (pinnedToBottom.value) scrollToBottom();
  measureBottom();
});

onBeforeUnmount(onKeyboardInsetTransition(followKeyboard));

onMounted(async () => {
  await nextTick();
  scrollToBottom();
  if (!coarsePointer.value) composerRef.value?.focus();
  if (props.initialPrompt) await send({ text: props.initialPrompt, attachments: [] });
});

defineExpose({ refreshFromStore });
</script>

<style scoped>
.cui-assistant-queued {
  background: var(--card-background);
  border: 1px dashed var(--border-color-inner);
}

.cui-assistant-fact + .cui-assistant-fact {
  border-top: 1px solid var(--border-color-inner);
}

.cui-assistant-badge {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  pointer-events: none;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  font-size: 9px;
  line-height: 14px;
  text-align: center;
  color: var(--p-primary-contrast-color);
  background: var(--p-primary-color);
}

.cui-assistant-mark {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

.cui-assistant-chip {
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  color: var(--text-color-faded);
  transition:
    border-color 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.cui-assistant-chip:hover {
  border-color: var(--p-primary-color);
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 9%, transparent);
}

.cui-assistant-note {
  border-left: 2px solid var(--border-color-inner);
}

.cui-assistant-fade-enter-active,
.cui-assistant-fade-leave-active {
  transition: opacity 150ms ease;
}

.cui-assistant-fade-enter-from,
.cui-assistant-fade-leave-to {
  opacity: 0;
}

.cui-assistant-tray-enter-active,
.cui-assistant-tray-leave-active {
  transition: opacity 220ms ease;
}

.cui-assistant-tray-enter-from,
.cui-assistant-tray-leave-to {
  opacity: 0;
}

.cui-assistant-jump {
  border: 1px solid var(--border-color);
  background: var(--card-background);
  box-shadow: var(--shadow-sm);
}
</style>
