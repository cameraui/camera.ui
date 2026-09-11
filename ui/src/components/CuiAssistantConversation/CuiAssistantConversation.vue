<template>
  <div class="relative flex h-full min-h-0 flex-col">
    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto px-4" :class="{ 'flex items-center justify-center pb-[8vh]': welcome }" @scroll.passive="onScroll">
      <div v-if="welcome" class="w-full max-w-2xl py-6">
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
          @send="send"
          @stop="chat.stop()"
        >
          <template #tools>
            <span class="relative shrink-0">
              <Button
                v-tooltip.top="{ value: $t('views.assistant.tools_title') }"
                type="button"
                severity="secondary"
                text
                rounded
                :disabled="chat.busy.value"
                @click="toolsPopover?.toggle($event)"
              >
                <template #icon>
                  <i-mdi:tune class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="disabledGroups.length" class="cui-assistant-badge">{{ enabledGroups.length }}</span>
            </span>
            <span class="relative shrink-0">
              <Button v-tooltip.top="{ value: $t('views.assistant.memory_title') }" type="button" severity="secondary" text rounded @click="openMemory($event)">
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

      <div v-else class="mx-auto flex w-full max-w-[720px] flex-col gap-7 pt-6 pb-4">
        <CuiAssistantMessage
          v-for="row in rows"
          :key="row.message.id"
          :message="row.message"
          :streaming="chat.isLoading.value && row.lastIndex === chat.messages.value.length - 1 && row.message.role === 'assistant'"
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

    <div v-if="!welcome" class="cui-assistant-dock px-4 pb-3 pt-6">
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
          @send="send"
          @stop="chat.stop()"
        >
          <template #tools>
            <span class="relative shrink-0">
              <Button
                v-tooltip.top="{ value: $t('views.assistant.tools_title') }"
                type="button"
                severity="secondary"
                text
                rounded
                :disabled="chat.busy.value"
                @click="toolsPopover?.toggle($event)"
              >
                <template #icon>
                  <i-mdi:tune class="w-4 h-4" />
                </template>
              </Button>
              <span v-if="disabledGroups.length" class="cui-assistant-badge">{{ enabledGroups.length }}</span>
            </span>
            <span class="relative shrink-0">
              <Button v-tooltip.top="{ value: $t('views.assistant.memory_title') }" type="button" severity="secondary" text rounded @click="openMemory($event)">
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

    <Popover ref="toolsPopover">
      <div class="flex w-72 flex-col gap-3">
        <span class="text-sm font-medium text-color">{{ $t('views.assistant.tools_title') }}</span>
        <div class="flex flex-col gap-1">
          <label for="assistantInstructions" class="text-xs text-muted">{{ $t('views.assistant.instructions_label') }}</label>
          <Textarea
            id="assistantInstructions"
            v-model="instructions"
            rows="2"
            auto-resize
            class="text-sm"
            :placeholder="$t('views.assistant.instructions_placeholder')"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label for="assistantTools" class="text-xs text-muted">{{ $t('views.assistant.tools_label') }}</label>
          <MultiSelect
            v-model="enabledGroups"
            input-id="assistantTools"
            :options="toolGroups"
            option-label="label"
            option-value="id"
            :max-selected-labels="2"
            :selected-items-label="$t('views.assistant.tools_selected', { n: enabledGroups.length })"
            :placeholder="$t('views.assistant.tools_none')"
            class="min-w-0"
          >
            <template #option="{ option }">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <span class="truncate">{{ option.label }}</span>
                <span class="ml-auto shrink-0 text-xs text-muted">{{ $t('views.assistant.tools_count', { n: option.count }) }}</span>
              </div>
            </template>
          </MultiSelect>
        </div>
        <div v-if="models.length > 1" class="flex flex-col gap-1">
          <label for="assistantModel" class="text-xs text-muted">{{ $t('views.assistant.model_label') }}</label>
          <Select v-model="modelId" input-id="assistantModel" :options="models" option-label="name" option-value="_id" class="min-w-0" :placeholder="defaultEntry?.name">
            <template #option="{ option }">
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <span class="truncate">{{ option.name }}</span>
                <span class="ml-auto flex shrink-0 gap-1">
                  <Tag
                    v-for="tag in warningTags(option)"
                    :key="tag.key"
                    :severity="tag.severity"
                    :value="$t(`views.settings.assistant_capability_${tag.key}`)"
                    class="text-[10px]"
                  />
                </span>
              </div>
            </template>
          </Select>
        </div>
        <div class="flex flex-col gap-1">
          <label for="assistantProfile" class="text-xs text-muted">{{ $t('views.assistant.profiles_label') }}</label>
          <InputGroup>
            <Select
              v-model="profileId"
              input-id="assistantProfile"
              :options="profiles ?? []"
              option-label="name"
              option-value="_id"
              show-clear
              class="min-w-0"
              :placeholder="$t('views.assistant.profile_none')"
              @update:model-value="applyProfile"
            >
              <template #option="{ option }">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <span class="truncate">{{ option.name }}</span>
                  <span class="ml-auto flex shrink-0 gap-1">
                    <Tag
                      v-for="tag in warningTags(profileModel(option))"
                      :key="tag.key"
                      :severity="tag.severity"
                      :value="$t(`views.settings.assistant_capability_${tag.key}`)"
                      class="text-[10px]"
                    />
                  </span>
                </div>
              </template>
            </Select>
            <InputGroupAddon class="!p-0">
              <Button
                v-tooltip.top="{ value: profileId ? $t('views.assistant.profile_update') : $t('views.assistant.profile_save') }"
                type="button"
                severity="secondary"
                text
                class="h-full rounded-none"
                :loading="createProfileMutation.isPending.value || patchProfileMutation.isPending.value"
                @click="profileId ? updateProfile() : (namingProfile = true)"
              >
                <template #icon>
                  <i-mdi:content-save-outline class="w-4 h-4" />
                </template>
              </Button>
            </InputGroupAddon>
            <InputGroupAddon v-if="profileId" class="!p-0">
              <Button
                v-tooltip.top="{ value: $t('views.assistant.profile_delete') }"
                type="button"
                severity="secondary"
                text
                class="h-full rounded-none"
                :loading="deleteProfileMutation.isPending.value"
                @click="deleteProfile"
              >
                <template #icon>
                  <i-mdi:delete-outline class="w-4 h-4" />
                </template>
              </Button>
            </InputGroupAddon>
          </InputGroup>
          <div v-if="namingProfile" class="mt-1 flex items-center gap-1">
            <InputText
              v-model="profileName"
              class="flex-1 min-w-0"
              size="small"
              :placeholder="$t('views.assistant.profile_name_placeholder')"
              @keydown.enter.prevent="createProfile"
              @keydown.esc="namingProfile = false"
            />
            <Button type="button" size="small" :label="$t('components.form.button.save')" :disabled="!profileName.trim()" @click="createProfile" />
          </div>
        </div>
      </div>
    </Popover>

    <Popover ref="memoryPopover">
      <div class="flex w-72 flex-col gap-3">
        <div class="flex items-baseline gap-2">
          <span class="text-sm font-medium text-color">{{ $t('views.assistant.memory_title') }}</span>
          <span v-if="memory?.length" class="ml-auto text-xs tabular-nums text-muted">{{ memory.length }}</span>
        </div>
        <div v-if="!memory?.length" class="text-xs text-muted">{{ $t('views.assistant.memory_empty') }}</div>
        <div v-else class="flex max-h-64 flex-col overflow-y-auto">
          <div v-for="fact in memory" :key="fact._id" class="cui-assistant-fact flex items-center gap-2 py-1.5 text-[13px] text-color">
            <span class="min-w-0 flex-1 leading-snug">{{ fact.text }}</span>
            <Button
              v-tooltip.top="{ value: $t('views.assistant.memory_forget') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md shrink-0 text-muted"
              :loading="deleteMemoryFactMutation.isPending.value"
              @click="deleteMemoryFactMutation.mutate(fact._id)"
            >
              <template #icon>
                <i-mdi:close class="w-3 h-3" />
              </template>
            </Button>
          </div>
        </div>
        <Button
          v-if="memory?.length"
          type="button"
          size="small"
          severity="secondary"
          outlined
          class="w-full"
          :label="$t('views.assistant.memory_forget_all')"
          :loading="deleteMemoryMutation.isPending.value"
          @click="deleteMemoryMutation.mutate()"
        />
      </div>
    </Popover>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery, branchAssistantThread, replaceAssistantThreadMessages } from '@/api/routes/assistant.js';
import { capabilityTags, defaultModel } from '@/common/assistantModels.js';
import { isContinueMark } from '@/components/CuiAssistantMessage/types.js';

import type { AssistantCapabilityTag } from '@/common/assistantModels.js';
import type CuiAssistantComposer from '@/components/CuiAssistantComposer/CuiAssistantComposer.vue';
import type { ComposerSubmission } from '@/components/CuiAssistantComposer/types.js';
import type { AssistantModelView, AssistantUsageEvent, DBAssistantProfile, DBAssistantThread } from '@shared/types';
import type { ContentPart, UIMessage } from '@tanstack/ai';
import type Popover from 'primevue/popover';
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

const { data: profiles } = assistantQuery.listProfilesQuery();
const createProfileMutation = assistantQuery.createProfileMutation();
const patchProfileMutation = assistantQuery.patchProfileMutation();
const deleteProfileMutation = assistantQuery.deleteProfileMutation();
const { data: memory, refetch: refetchMemory } = assistantQuery.memoryQuery();
const deleteMemoryFactMutation = assistantQuery.deleteMemoryFactMutation();
const deleteMemoryMutation = assistantQuery.deleteMemoryMutation();
const { data: info } = assistantQuery.getAssistantInfoQuery();

const scrollRef = useTemplateRef<HTMLDivElement>('scrollRef');
const composerRef = useTemplateRef<InstanceType<typeof CuiAssistantComposer>>('composerRef');
const toolsPopover = useTemplateRef<InstanceType<typeof Popover>>('toolsPopover');
const memoryPopover = useTemplateRef<InstanceType<typeof Popover>>('memoryPopover');
const pinnedToBottom = ref(true);
const disabledGroups = ref<string[]>([]);
const instructions = ref('');
const profileId = ref<string | null>(null);
const namingProfile = ref(false);
const profileName = ref('');
const modelId = ref<string | null>(null);

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
  onError: (error) => toast.add({ severity: 'error', detail: error.message, life: 5000 }),
});

const welcome = computed(() => chat.messages.value.length === 0);

const models = computed(() => info.value?.settings.models ?? []);
const defaultEntry = computed(() => (info.value ? defaultModel(info.value.settings) : undefined));
const activeModel = computed(() => models.value.find((entry) => entry._id === modelId.value) ?? defaultEntry.value);
const visionMissing = computed(() => (activeModel.value?.capabilities?.vision === false ? activeModel.value.name : undefined));

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
  if (!el) return;
  pinnedToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

function scrollToBottom(): void {
  const el = scrollRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

function openMemory(event: Event): void {
  memoryPopover.value?.toggle(event);
  refetchMemory();
}

function applyProfile(id: string | null): void {
  const profile = profiles.value?.find((entry) => entry._id === id);
  if (!profile) return;
  disabledGroups.value = [...profile.disabledGroups];
  instructions.value = profile.instructions;
  modelId.value = models.value.some((entry) => entry._id === profile.modelId) ? profile.modelId : null;
}

function profileModel(profile: DBAssistantProfile): AssistantModelView | undefined {
  return models.value.find((entry) => entry._id === profile.modelId) ?? defaultEntry.value;
}

function warningTags(entry: AssistantModelView | undefined): AssistantCapabilityTag[] {
  return entry ? capabilityTags(entry).filter((tag) => tag.severity !== 'success') : [];
}

async function createProfile(): Promise<void> {
  const name = profileName.value.trim();
  if (!name) return;
  const profile = await createProfileMutation.mutateAsync({
    name,
    modelId: activeModel.value?._id ?? '',
    disabledGroups: [...disabledGroups.value],
    instructions: instructions.value.trim(),
  });
  profileId.value = profile._id;
  namingProfile.value = false;
  profileName.value = '';
}

async function updateProfile(): Promise<void> {
  if (!profileId.value) return;
  await patchProfileMutation.mutateAsync({
    profileId: profileId.value,
    patch: { modelId: activeModel.value?._id ?? '', disabledGroups: [...disabledGroups.value], instructions: instructions.value.trim() },
  });
}

async function deleteProfile(): Promise<void> {
  if (!profileId.value) return;
  await deleteProfileMutation.mutateAsync(profileId.value);
  profileId.value = null;
}

// the drawer stays in place while the page behind it scrolls, the popovers are placed against the page and would drift off their button
function realignPopovers(): void {
  for (const popover of [toolsPopover.value, memoryPopover.value] as unknown as ({ visible: boolean; alignOverlay: () => void } | null)[]) {
    if (popover?.visible) popover.alignOverlay();
  }
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

watch(welcome, async () => {
  await nextTick();
  composerRef.value?.focus();
});

useEventListener(window, 'scroll', realignPopovers, { capture: true, passive: true });

onMounted(async () => {
  await nextTick();
  scrollToBottom();
  composerRef.value?.focus();
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

.cui-assistant-dock {
  background: linear-gradient(to top, rgba(var(--ground-background-val), 1) 62%, rgba(var(--ground-background-val), 0));
}
</style>
