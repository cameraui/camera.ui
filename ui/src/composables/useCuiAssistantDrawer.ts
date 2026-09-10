import { randomId } from '@/common/utils.js';

import type { DBAssistantAttachment, DBAssistantThread } from '@shared/types';
import type { UIMessage } from '@tanstack/ai';

export const useCuiAssistantDrawer = createSharedComposable(() => {
  const visible = useLocalStorage('cui-assistant-drawer-open', false);
  const mini = useLocalStorage('cui-assistant-drawer-mini', false);
  const threadId = useLocalStorage('cui-assistant-drawer-thread', randomId());
  const initialMessages = ref<UIMessage[]>([]);
  const initialAttachments = ref<Record<string, DBAssistantAttachment>>({});
  const initialPrompt = ref<string | undefined>();

  function open(prompt?: string): void {
    initialPrompt.value = prompt;
    visible.value = true;
  }

  function close(): void {
    visible.value = false;
  }

  function toggle(): void {
    visible.value = !visible.value;
  }

  function reset(): void {
    initialPrompt.value = undefined;
    initialMessages.value = [];
    initialAttachments.value = {};
    threadId.value = randomId();
  }

  function load(thread: DBAssistantThread): void {
    initialPrompt.value = undefined;
    initialMessages.value = thread.messages as UIMessage[];
    initialAttachments.value = thread.attachments;
    threadId.value = thread._id;
  }

  return { visible, mini, threadId, initialMessages, initialAttachments, initialPrompt, open, close, toggle, reset, load };
});
