import type { AssistantToolInfo, DBAssistantAttachment, DBAssistantThread } from '@shared/types';
import type { UIMessage } from '@tanstack/ai';

export interface CuiAssistantConversationProps {
  threadId: string;
  initialMessages: UIMessage[];
  initialAttachments?: Record<string, DBAssistantAttachment>;
  initialPrompt?: string;
  suggestions?: string[];
  approvalTools?: AssistantToolInfo[];
  tools?: AssistantToolInfo[];
  compact?: boolean;
}

export interface CuiAssistantConversationEmits {
  (e: 'finished'): void;
  (e: 'branched', thread: DBAssistantThread): void;
  (e: 'emptied'): void;
}

export interface ToolGroupOption {
  id: string;
  label: string;
  count: number;
}

export interface ConversationRow {
  message: UIMessage;
  index: number;
  lastIndex: number;
  ids: string[];
  continuation: boolean;
}
