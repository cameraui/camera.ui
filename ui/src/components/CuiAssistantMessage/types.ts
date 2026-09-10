import type { AssistantReference } from '@/components/CuiAssistantReferences/types.js';
import type { ToolResultImage } from '@/components/CuiAssistantToolCall/types.js';
import type { AssistantSettingKey, AssistantUsageEvent, DBAssistantCard } from '@shared/types';
import type { UIMessage } from '@tanstack/ai';

export const ATTACHMENT_PREFIX = 'attachment:';
export const CONTINUE_MARK = '[continue]';

export interface CuiAssistantMessageProps {
  message: UIMessage;
  streaming?: boolean;
  busy?: boolean;
  continuation?: boolean;
  stopped?: boolean;
  toolImages?: Record<string, ToolResultImage[]>;
  toolReferences?: Record<string, AssistantReference[]>;
  toolCards?: Record<string, DBAssistantCard[]>;
  toolSettings?: Record<string, AssistantSettingKey[]>;
  usage?: AssistantUsageEvent;
}

export interface CuiAssistantMessageEmits {
  (e: 'regenerate'): void;
  (e: 'edit', text: string): void;
  (e: 'delete'): void;
  (e: 'branch'): void;
  (e: 'continue'): void;
}

export function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('\n')
    .trim();
}

export function isContinueMark(message: UIMessage | undefined): boolean {
  return message?.role === 'user' && messageText(message) === CONTINUE_MARK;
}
