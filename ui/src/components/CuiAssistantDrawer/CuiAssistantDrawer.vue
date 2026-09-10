<template>
  <Drawer v-model:visible="drawer.visible.value" v-bind="drawerProps" :class="mini ? '' : 'border-0 md:border-l-[1px]'">
    <template #container="{ closeCallback }">
      <div class="cui-assistant-drawer flex h-full w-full flex-col p-safe !pb-0 md:!pl-0 non-draggable-region">
        <div class="flex shrink-0 items-center gap-2 border-b border-color px-3 py-2">
          <div class="cui-assistant-drawer-mark flex h-8 w-8 items-center justify-center rounded-lg">
            <i-tabler:sparkles class="w-4.5 h-4.5 text-color" />
          </div>
          <span class="text-sm font-semibold text-color">{{ $t('views.assistant.title') }}</span>

          <div class="ml-auto flex items-center gap-0.5">
            <Button
              v-tooltip.bottom="{ value: $t('views.assistant.conversations') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md"
              :class="{ 'cui-assistant-drawer-active': view === 'history' }"
              @click="view = view === 'history' ? 'chat' : 'history'"
            >
              <template #icon>
                <i-mdi:history width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-tooltip.bottom="{ value: $t('views.assistant.new_conversation') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md"
              @click="startNew"
            >
              <template #icon>
                <i-mdi:plus width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-if="!smBreakpoint"
              v-tooltip.bottom="{ value: $t(mini ? 'views.assistant.drawer_panel' : 'views.assistant.drawer_minimize') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md"
              @click="drawer.mini.value = !drawer.mini.value"
            >
              <template #icon>
                <i-mdi:dock-right v-if="mini" width="100%" height="100%" />
                <i-mdi:picture-in-picture-bottom-right v-else width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-tooltip.bottom="{ value: $t('views.assistant.open_full_view') }"
              type="button"
              severity="secondary"
              text
              rounded
              class="cui-icon-md"
              @click="openFullView(closeCallback)"
            >
              <template #icon>
                <i-mdi:arrow-expand width="100%" height="100%" />
              </template>
            </Button>
            <Button type="button" severity="secondary" text rounded class="cui-icon-md" @click="closeCallback">
              <template #icon>
                <i-mdi:close width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </div>

        <div v-if="state !== 'ready'" class="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <i-mdi:robot-off-outline class="w-8 h-8 text-muted" />
          <div class="text-sm text-muted">{{ $t(isAdmin ? 'views.assistant.setup_hint_admin' : 'views.assistant.setup_hint_user') }}</div>
          <Button v-if="isAdmin" class="cui-button-small" :label="$t('views.assistant.open_settings')" @click="openSettings(closeCallback)" />
        </div>

        <div v-else-if="view === 'history'" class="flex-1 min-h-0 overflow-y-auto pb-safe">
          <div v-if="threadsLoading" class="flex items-center justify-center py-8">
            <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
          </div>
          <div v-else-if="!threads?.length" class="px-4 py-8 text-center text-sm text-muted">{{ $t('views.assistant.no_conversations') }}</div>
          <button
            v-for="thread in threads"
            v-else
            :key="thread.id"
            type="button"
            class="cui-assistant-drawer-thread flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left"
            :class="{ 'cui-assistant-drawer-thread-active': thread.id === drawer.threadId.value }"
            :disabled="loadingThreadId !== null"
            @click="selectThread(thread.id)"
          >
            <span class="min-w-0 flex-1 truncate text-[13.5px] text-color">{{ thread.title }}</span>
            <span class="shrink-0 text-xs text-muted">{{ formatDate(thread.updatedAt) }}</span>
          </button>
        </div>

        <CuiAssistantConversation
          v-else
          :key="drawer.threadId.value"
          :thread-id="drawer.threadId.value"
          :initial-messages="drawer.initialMessages.value"
          :initial-attachments="drawer.initialAttachments.value"
          :initial-prompt="drawer.initialPrompt.value"
          :suggestions="suggestions"
          :approval-tools="approvalTools"
          :tools="info?.tools ?? []"
          :compact="mini"
          class="flex-1 min-h-0"
        />
      </div>
    </template>
  </Drawer>
</template>

<script setup lang="ts">
import { AssistantQuery, getAssistantThread } from '@/api/routes/assistant.js';

import { CUI_ASSISTANT_DRAWER_MINI_PROPS, CUI_ASSISTANT_DRAWER_PROPS } from './types.js';

const assistantQuery = new AssistantQuery();

const router = useRouter();
const { t, locale } = useI18n();
const drawer = useCuiAssistantDrawer();
const { smBreakpoint } = useSharedCuiBreakpoint();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const { data: info } = assistantQuery.getAssistantInfoQuery();
const { data: threads, isLoading: threadsLoading } = assistantQuery.listThreadsQuery();

const view = ref<'chat' | 'history'>('chat');
const loadingThreadId = ref<string | null>(null);

const mini = computed(() => drawer.mini.value && !smBreakpoint.value);
const drawerProps = computed(() => (mini.value ? CUI_ASSISTANT_DRAWER_MINI_PROPS : CUI_ASSISTANT_DRAWER_PROPS));
const state = computed(() => info.value?.status.state ?? 'disabled');
const isAdmin = computed(() => user.value?.role === 'admin' || user.value?.role === 'master');
const approvalTools = computed(() => (info.value?.tools ?? []).filter((tool) => tool.approval));

const suggestions = computed(() => [t('views.assistant.suggestion_today'), t('views.assistant.suggestion_offline'), t('views.assistant.suggestion_sensors')]);

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(locale.value, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function startNew(): void {
  drawer.reset();
  view.value = 'chat';
}

async function selectThread(threadId: string): Promise<void> {
  loadingThreadId.value = threadId;
  try {
    drawer.load(await getAssistantThread(threadId));
    view.value = 'chat';
  } finally {
    loadingThreadId.value = null;
  }
}

function openFullView(closeCallback: () => void): void {
  closeCallback();
  router.push({ name: 'Assistant', query: { thread: drawer.threadId.value } });
}

function openSettings(closeCallback: () => void): void {
  closeCallback();
  router.push('/settings/assistant');
}

onMounted(async () => {
  if (!drawer.visible.value) return;
  drawer.visible.value = false;
  if (!mini.value) return;
  const thread = await getAssistantThread(drawer.threadId.value).catch(() => undefined);
  if (thread) drawer.load(thread);
  drawer.visible.value = true;
});
</script>

<style>
.cui-assistant-drawer-mini {
  align-self: flex-end;
  width: 400px !important;
  height: min(640px, calc(100vh - 2rem)) !important;
  margin: 0 1rem 1rem 0;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
</style>

<style scoped>
.cui-assistant-drawer {
  background: var(--card-background);
}

.cui-assistant-drawer-active {
  color: var(--p-primary-color);
}

.cui-assistant-drawer-thread:hover {
  background: var(--card-inner-background);
}

.cui-assistant-drawer-thread-active {
  background: color-mix(in srgb, var(--p-primary-color) 10%, transparent);
}

.cui-assistant-drawer-mark {
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-primary-color) 28%, transparent);
}
</style>
