<template>
  <div>
    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t('views.assistant.title') }}</span>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
      <Button id="assistant-sidebar-toggle" severity="secondary" class="cui-button p-2 text-color" text rounded @click="toggleSidebar">
        <template #icon>
          <i-mdi:history width="100%" height="100%" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="right">
      <Button severity="secondary" class="cui-button p-2 text-color" text rounded :disabled="state !== 'ready'" @click="startNewThread">
        <template #icon>
          <i-mdi:plus width="100%" height="100%" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiAssistantSidebar
      v-if="state === 'ready'"
      :threads="threads ?? []"
      :active-id="activeThreadId"
      :loading="threadsLoading"
      :is-open="sidebarOpen"
      :is-overlay="sidebarIsOverlay"
      @select="selectThread"
      @create="startNewThread"
      @delete="removeThread"
      @delete-all="removeAllThreads"
      @close="closeSidebar"
    />

    <Teleport to="#container" defer>
      <div v-if="sidebarOpen && sidebarIsOverlay" class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-1" @click="closeSidebar" />
    </Teleport>

    <main class="relative w-full h-full" :style="{ paddingLeft: mainPaddingLeft, transition: layoutReady ? 'padding-left 200ms' : undefined }">
      <div class="w-full h-full relative">
        <div v-if="!smBreakpoint" class="w-full flex flex-row h-[calc(40px+1rem)] py-2 items-center fixed z-10">
          <div class="ml-2" />

          <Button
            v-if="!sidebarOpen && state === 'ready'"
            id="assistant-sidebar-toggle"
            v-tooltip.bottom="{ value: $t('views.assistant.show_sidebar') }"
            severity="secondary"
            class="mr-2 cui-icon-lg relative z-2"
            text
            rounded
            @click="toggleSidebar"
          >
            <template #icon>
              <i-mdi:dock-left width="100%" height="100%" />
            </template>
          </Button>

          <h1 class="relative z-2 page-title !m-0">
            {{ $t('views.assistant.title') }}
          </h1>
          <span v-if="activeTitle" class="relative z-2 ml-3 truncate text-[13.5px] text-muted max-w-[46ch]">{{ activeTitle }}</span>

          <div class="gradient-blur rotate-180 !h-[70px]">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>

        <div v-if="!smBreakpoint && state === 'ready'" class="fixed right-0 z-10 h-[calc(40px+1rem)] py-2 pr-2 flex items-center">
          <Button
            v-tooltip.bottom="{ value: $t('views.assistant.new_conversation') }"
            severity="secondary"
            text
            rounded
            class="cui-icon-lg relative z-2"
            @click="startNewThread"
          >
            <template #icon>
              <i-mdi:plus width="100%" height="100%" />
            </template>
          </Button>
        </div>

        <div class="h-full w-full flex flex-col" :class="{ 'pt-2': smBreakpoint, 'pt-[calc(40px+2rem)]': !smBreakpoint }">
          <div v-if="infoLoading || threadLoading" class="flex flex-1 items-center justify-center">
            <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
          </div>

          <div v-else-if="state !== 'ready'" class="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            <div class="cui-assistant-hero-icon flex h-16 w-16 items-center justify-center rounded-full">
              <i-mdi:robot-outline class="w-8 h-8 text-muted" />
            </div>
            <div class="max-w-md">
              <div class="text-lg font-semibold text-color">{{ $t(state === 'disabled' ? 'views.assistant.disabled_title' : 'views.assistant.unconfigured_title') }}</div>
              <div class="mt-1 text-sm text-muted">{{ $t(isAdmin ? 'views.assistant.setup_hint_admin' : 'views.assistant.setup_hint_user') }}</div>
            </div>
            <Button v-if="isAdmin" class="cui-button-medium" :label="$t('views.assistant.open_settings')" @click="$router.push('/settings/assistant')" />
          </div>

          <CuiAssistantConversation
            v-else
            ref="conversationRef"
            :key="activeThreadId"
            :thread-id="activeThreadId"
            :initial-messages="initialMessages"
            :initial-attachments="initialAttachments"
            :initial-prompt="initialPrompt"
            :suggestions="suggestions"
            :approval-tools="approvalTools"
            :tools="info?.tools ?? []"
            class="flex-1 min-h-0"
            @finished="onFinished"
            @branched="onBranched"
            @emptied="removeThread(activeThreadId)"
          />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { AssistantQuery, getAssistantThread } from '@/api/routes/assistant.js';
import { randomId } from '@/common/utils.js';
import { ASSISTANT_SIDEBAR_WIDTH } from '@/components/CuiAssistantSidebar/types.js';

import type CuiAssistantConversation from '@/components/CuiAssistantConversation/CuiAssistantConversation.vue';
import type { DBAssistantAttachment, DBAssistantThread } from '@shared/types';
import type { UIMessage } from '@tanstack/ai';

const assistantQuery = new AssistantQuery();

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { smBreakpoint, mdBreakpoint, xlBreakpoint } = useSharedCuiBreakpoint();
const { openTextDialog } = useCuiDialog();
const notificationsSocket = useSocket('/notifications');

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { data: info, isLoading: infoLoading } = assistantQuery.getAssistantInfoQuery();
const { data: threads, isLoading: threadsLoading } = assistantQuery.listThreadsQuery();
const deleteThreadMutation = assistantQuery.deleteThreadMutation();
const deleteAllMutation = assistantQuery.deleteAllThreadsMutation();

const conversationRef = useTemplateRef<InstanceType<typeof CuiAssistantConversation>>('conversationRef');
const activeThreadId = ref(newThreadId());
const initialMessages = ref<UIMessage[]>([]);
const initialAttachments = ref<Record<string, DBAssistantAttachment>>({});
const initialPrompt = ref<string | undefined>(typeof route.query.prompt === 'string' ? route.query.prompt : undefined);
const threadLoading = ref(false);
const sidebarState = ref<'opened' | 'closed'>(xlBreakpoint.value ? 'opened' : 'closed');
const layoutReady = ref(false);

const state = computed(() => info.value?.status.state ?? 'disabled');
const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'master');
const approvalTools = computed(() => (info.value?.tools ?? []).filter((tool) => tool.approval));

const sidebarOpen = computed(() => sidebarState.value === 'opened');

const activeTitle = computed(() => threads.value?.find((thread) => thread.id === activeThreadId.value)?.title ?? '');

const sidebarIsOverlay = computed(() => mdBreakpoint.value);

const mainPaddingLeft = computed(() => {
  if (mdBreakpoint.value || state.value !== 'ready') return '0px';
  return sidebarOpen.value ? `${ASSISTANT_SIDEBAR_WIDTH}px` : '0px';
});

const suggestions = computed(() => [
  t('views.assistant.suggestion_today'),
  t('views.assistant.suggestion_week'),
  t('views.assistant.suggestion_offline'),
  t('views.assistant.suggestion_sensors'),
  t('views.assistant.suggestion_tools'),
]);

function newThreadId(): string {
  return randomId();
}

function toggleSidebar(): void {
  sidebarState.value = sidebarState.value === 'opened' ? 'closed' : 'opened';
}

function closeSidebar(): void {
  sidebarState.value = 'closed';
}

function startNewThread(): void {
  initialMessages.value = [];
  initialAttachments.value = {};
  initialPrompt.value = undefined;
  activeThreadId.value = newThreadId();
  if (sidebarIsOverlay.value) closeSidebar();
}

async function selectThread(threadId: string): Promise<void> {
  if (sidebarIsOverlay.value) closeSidebar();
  if (threadId === activeThreadId.value) return;

  threadLoading.value = true;
  try {
    const thread = await getAssistantThread(threadId);
    initialMessages.value = thread.messages as UIMessage[];
    initialAttachments.value = thread.attachments;
    initialPrompt.value = undefined;
    activeThreadId.value = threadId;
  } finally {
    threadLoading.value = false;
  }
}

async function removeThread(threadId: string): Promise<void> {
  await deleteThreadMutation.mutateAsync(threadId).catch(() => undefined);
  if (threadId === activeThreadId.value) startNewThread();
}

async function onBranched(thread: DBAssistantThread): Promise<void> {
  initialMessages.value = thread.messages as UIMessage[];
  initialAttachments.value = thread.attachments;
  initialPrompt.value = undefined;
  activeThreadId.value = thread._id;
  await assistantQuery.queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
}

function removeAllThreads(): void {
  openTextDialog({
    data: {
      title: t('views.assistant.delete_all_conversations'),
      contentText: t('views.assistant.delete_all_confirm'),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: { severity: 'danger' },
    },
    onConfirm: async () => {
      await deleteAllMutation.mutateAsync();
      startNewThread();
    },
  });
}

async function openRequestedThread(threadId: string): Promise<void> {
  try {
    await selectThread(threadId);
  } catch {
    activeThreadId.value = threadId;
  }
}

async function onFinished(): Promise<void> {
  await assistantQuery.queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
}

async function onThreadPosted(payload: { threadId: string }): Promise<void> {
  await assistantQuery.queryClient.refetchQueries({ queryKey: ['assistant', 'threads'], exact: true });
  if (payload.threadId !== activeThreadId.value) return;
  const thread = await getAssistantThread(payload.threadId).catch(() => undefined);
  if (thread) conversationRef.value?.refreshFromStore(thread);
}

function syncThreadQuery(): void {
  const stored = threads.value?.some((thread) => thread.id === activeThreadId.value);
  const query = { ...route.query, thread: stored ? activeThreadId.value : undefined };
  if (query.thread !== route.query.thread) router.replace({ query });
}

watch([activeThreadId, threads], syncThreadQuery);

onMounted(async () => {
  notificationsSocket.on<{ threadId: string }>('assistant-thread', (payload) => onThreadPosted(payload));
  const requested = typeof route.query.thread === 'string' ? route.query.thread : undefined;
  if (route.query.prompt !== undefined) {
    router.replace({ query: { ...route.query, prompt: undefined } });
  }
  if (requested && !initialPrompt.value) await openRequestedThread(requested);
  await nextTick();
  layoutReady.value = true;
});
</script>

<style scoped>
.cui-assistant-hero-icon {
  background: var(--chip-background);
}
</style>
