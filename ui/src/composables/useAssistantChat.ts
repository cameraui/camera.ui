import { ASK_USER_INTERRUPT, ASSISTANT_CLIENT_TOOLS, ASSISTANT_PAGES } from '@shared/types';
import { toolDefinition } from '@tanstack/ai';
import { fetchServerSentEvents, useChat } from '@tanstack/ai-vue';

import { cancelAssistantRun, hydrateAssistantThread } from '@/api/routes/assistant.js';
import { CONTINUE_MARK } from '@/components/CuiAssistantMessage/types.js';
import { ASSISTANT_SETTING_KEYS } from '@/components/CuiAssistantSetting/types.js';
import { fetchAuthHeaders } from '@/connection/fetchAuth.js';
import { getConnection } from '@/connection/instance.js';

import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { ToolResultImage } from '@/components/CuiAssistantToolCall/types.js';
import type { AssistantQuestion, AssistantSettingKey, AssistantToolInfo, AssistantUsageEvent, DBAssistantAttachment, DBAssistantCard } from '@shared/types';
import type { JSONSchema } from '@tanstack/ai';
import type { UIMessage } from '@tanstack/ai-vue';
import type { Ref } from 'vue';

export interface AssistantQuestionInterrupt {
  id: string;
  payload: AssistantQuestion | undefined;
  canResolve: boolean;
  resolveInterrupt: (response: { answer: string }) => void;
  cancel: () => void;
}

export interface AssistantApproval {
  id: string;
  toolName: string;
  originalArgs: unknown;
  canResolve: boolean;
  resolveInterrupt: (approved: boolean, extra?: { editedArgs?: Record<string, unknown> }) => void;
}

export interface UseAssistantChatOptions {
  threadId: Ref<string>;
  initialMessages?: UIMessage[];
  initialAttachments?: Record<string, DBAssistantAttachment>;
  language: Ref<string>;
  disabledGroups?: Ref<string[]>;
  instructions?: Ref<string>;
  approvalTools?: AssistantToolInfo[];
  onFinish?: () => void;
  onError?: (error: Error) => void;
}

function isSettingKey(value: unknown): value is AssistantSettingKey {
  return typeof value === 'string' && (ASSISTANT_SETTING_KEYS as string[]).includes(value);
}

async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  for (const [key, value] of Object.entries(await fetchAuthHeaders())) headers.set(key, value);
  headers.set('X-Cui-Timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
  return fetch(input, { ...init, headers });
}

function chatUrl(): string {
  const target = getConnection().target.value;
  const origin = (target?.endpoint.url ?? window.location.origin).replace(/\/+$/, '');
  return `${origin}/api/assistant/chat`;
}

async function navigate(
  router: ReturnType<typeof useRouter>,
  actions: ReturnType<typeof useAssistantActions>,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string; actions?: { name: string; description: string }[] }> {
  const camera = typeof args.camera === 'string' ? args.camera.trim() : '';
  switch (name) {
    case 'open_camera':
      if (!camera) return { ok: false, message: 'camera name is missing' };
      await router.push(`/cameras/${encodeURIComponent(camera)}`);
      return { ok: true };
    case 'open_recording': {
      const time = Date.parse(String(args.time ?? ''));
      if (!camera || Number.isNaN(time)) return { ok: false, message: 'camera name or time is missing' };
      await router.push({ path: `/cameras/${encodeURIComponent(camera)}`, query: { startTs: String(time) } });
      return { ok: true, message: `showing ${camera} at ${new Date(time).toLocaleString()}` };
    }
    case 'open_camview':
      await router.push('/camview');
      return { ok: true };
    case 'open_page': {
      const page = ASSISTANT_PAGES[String(args.page ?? '')];
      if (!page) return { ok: false, message: 'unknown page' };
      await router.push(page.path);
      return { ok: true };
    }
    case 'open_settings': {
      const page = String(args.page ?? '');
      if (!page) return { ok: false, message: 'page is missing' };
      await router.push({ name: `Settings${page.charAt(0).toUpperCase()}${page.slice(1)}` });
      return { ok: true };
    }
    case 'ui_actions': {
      const list = actions.list();
      return list.length ? { ok: true, actions: list } : { ok: true, message: 'this page offers no actions', actions: [] };
    }
    case 'ui_action': {
      try {
        const message = await actions.run(String(args.name ?? ''), (args.args ?? {}) as Record<string, unknown>);
        return { ok: true, message };
      } catch (error: any) {
        return { ok: false, message: error?.message ?? String(error) };
      }
    }
    default:
      return { ok: false, message: 'unknown tool' };
  }
}

export function useAssistantChat(options: UseAssistantChatOptions) {
  const router = useRouter();
  const actions = useAssistantActions();

  const tools = [
    ...(options.approvalTools ?? [])
      .filter((tool) => tool.approval && tool.inputSchema)
      .map((tool) => toolDefinition({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema!, needsApproval: true })),
    ...ASSISTANT_CLIENT_TOOLS.map((spec) =>
      toolDefinition({ name: spec.name, description: spec.description, inputSchema: spec.inputSchema as unknown as JSONSchema }).client((args: unknown) =>
        navigate(router, actions, spec.name, (args ?? {}) as Record<string, unknown>),
      ),
    ),
  ];

  const forwardedProps: Record<string, unknown> = {
    language: options.language.value,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const toolImages = ref<Record<string, ToolResultImage[]>>({});
  const toolReferences = ref<Record<string, AssistantReference[]>>({});
  const toolCards = ref<Record<string, DBAssistantCard[]>>({});
  const toolSettings = ref<Record<string, AssistantSettingKey[]>>({});
  const usage = ref<Record<string, AssistantUsageEvent>>({});
  const stoppedId = ref<string | null>(null);

  function syncForwarded(): void {
    forwardedProps.disabledGroups = [...(options.disabledGroups?.value ?? [])];
    forwardedProps.instructions = options.instructions?.value?.trim() || undefined;
  }

  function seedAttachments(attachments: Record<string, DBAssistantAttachment>): void {
    for (const [key, entry] of Object.entries(attachments)) {
      if (entry.images.length) toolImages.value[key] = entry.images.map((image) => ({ src: `data:${image.mimeType};base64,${image.data}`, alt: image.caption ?? '' }));
      if (entry.references.length) toolReferences.value[key] = entry.references.map((reference) => ({ ...reference }));
      if (entry.cards?.length) toolCards.value[key] = entry.cards.map((card) => ({ ...card }));
      if (entry.settings?.length) toolSettings.value[key] = entry.settings.filter(isSettingKey);
    }
    toolImages.value = { ...toolImages.value };
    toolReferences.value = { ...toolReferences.value };
    toolCards.value = { ...toolCards.value };
    toolSettings.value = { ...toolSettings.value };
  }

  seedAttachments(options.initialAttachments ?? {});

  const transport = fetchServerSentEvents(chatUrl, { fetchClient: authedFetch });
  const connection = {
    ...transport,
    hydrate: async (threadId: string) => {
      const result = await hydrateAssistantThread(threadId);
      seedAttachments(result.attachments);
      return result;
    },
  };

  const chat = useChat({
    connection,
    persistence: true,
    tools,
    interrupts: [ASK_USER_INTERRUPT],
    queue: { whenBusy: 'queue', maxSize: 5 },
    threadId: options.threadId.value,
    initialMessages: options.initialMessages,
    forwardedProps,
    onFinish: options.onFinish,
    onError: options.onError,
    onCustomEvent: (eventType, data, context) => {
      if (eventType === 'assistant.usage') {
        const answer = chat.messages.value.findLast((message) => message.role === 'assistant');
        if (answer) usage.value = { ...usage.value, [answer.id]: data as AssistantUsageEvent };
        return;
      }
      const payload = data as { toolCallId?: string | null };
      const key = context.toolCallId ?? payload.toolCallId;
      if (!key) return;

      if (eventType === 'assistant.image') {
        const image = data as { data?: string; mimeType?: string; caption?: string | null };
        if (!image.data) return;
        const list = toolImages.value[key] ?? [];
        list.push({ src: `data:${image.mimeType ?? 'image/jpeg'};base64,${image.data}`, alt: image.caption ?? '' });
        toolImages.value = { ...toolImages.value, [key]: list };
      } else if (eventType === 'assistant.card') {
        const card = (data as { card?: DBAssistantCard }).card;
        if (!card) return;
        toolCards.value = { ...toolCards.value, [key]: [...(toolCards.value[key] ?? []), card] };
      } else if (eventType === 'assistant.setting') {
        const setting = (data as { setting?: string }).setting;
        if (!isSettingKey(setting)) return;
        toolSettings.value = { ...toolSettings.value, [key]: [...(toolSettings.value[key] ?? []), setting] };
      } else if (eventType === 'assistant.reference') {
        const reference = data as AssistantReference;
        if (!reference.id || !reference.kind) return;
        const list = toolReferences.value[key] ?? [];
        list.push(reference);
        toolReferences.value = { ...toolReferences.value, [key]: list };
      }
    },
  });

  const approvals = computed(
    () => (chat.interrupts.value as readonly { kind: string }[]).filter((interrupt) => interrupt.kind === 'tool-approval') as unknown as AssistantApproval[],
  );

  const questions = computed(
    () =>
      (chat.interrupts.value as readonly { kind: string; definitionId?: string }[]).filter(
        (interrupt) => interrupt.kind === 'generic' && interrupt.definitionId === 'ask-user',
      ) as unknown as AssistantQuestionInterrupt[],
  );

  const pausedElsewhere = computed(() => (chat.interrupts.value as readonly { kind: string }[]).some((interrupt) => interrupt.kind === 'unbound'));

  const busy = computed(() => chat.isLoading.value || chat.resuming.value);

  async function sendMessage(content: Parameters<typeof chat.sendMessage>[0]): Promise<void> {
    stoppedId.value = null;
    syncForwarded();
    await chat.sendMessage(content);
  }

  async function reload(): Promise<void> {
    stoppedId.value = null;
    syncForwarded();
    await chat.reload();
  }

  function stop(): void {
    const runId = chat.runId.value;
    if (runId) cancelAssistantRun(runId).catch(() => undefined);
    chat.stop();
    const last = chat.messages.value.at(-1);
    stoppedId.value = last?.role === 'assistant' ? last.id : null;
  }

  async function continueAnswer(): Promise<void> {
    await sendMessage(CONTINUE_MARK);
  }

  function replaceFromStore(messages: UIMessage[], attachments: Record<string, DBAssistantAttachment>): void {
    seedAttachments(attachments);
    chat.setMessages(messages);
  }

  return {
    ...chat,
    sendMessage,
    reload,
    stop,
    continueAnswer,
    replaceFromStore,
    approvals,
    questions,
    pausedElsewhere,
    busy,
    toolImages,
    toolReferences,
    toolCards,
    toolSettings,
    usage,
    stoppedId,
  };
}
