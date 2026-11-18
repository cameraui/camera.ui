import { defineInterrupt } from '@tanstack/ai';
import * as zod from 'zod';

import type { ModelMessage } from '@tanstack/ai';

export const ASSISTANT_QUESTION_KINDS = ['choice', 'camera', 'time_range', 'text'] as const;

export type AssistantQuestionKind = (typeof ASSISTANT_QUESTION_KINDS)[number];

export interface AssistantQuestion {
  toolCallId: string;
  question: string;
  kind: AssistantQuestionKind;
  options?: string[];
}

export const ASK_USER_INTERRUPT = defineInterrupt({
  id: 'ask-user',
  payloadSchema: zod.object({
    toolCallId: zod.string(),
    question: zod.string(),
    kind: zod.enum(ASSISTANT_QUESTION_KINDS),
    options: zod.array(zod.string()).optional(),
  }),
  responseSchema: zod.object({ answer: zod.string() }),
});

export function pendingQuestions(messages: readonly ModelMessage[]): AssistantQuestion[] {
  const last = [...messages].reverse().find((message) => message.role === 'assistant') as
    { toolCalls?: { id: string; function: { name: string; arguments: string } }[] } | undefined;
  const questions: AssistantQuestion[] = [];
  for (const call of last?.toolCalls ?? []) {
    if (call.function.name !== 'ask_user') continue;
    try {
      const args = JSON.parse(call.function.arguments || '{}') as Partial<AssistantQuestion>;
      if (!args.question) continue;
      // an interrupt payload must be plain json, a key holding undefined fails the whole run
      const options = Array.isArray(args.options) ? args.options.slice(0, 8) : undefined;
      questions.push({ toolCallId: call.id, question: args.question, kind: args.kind ?? 'choice', ...(options && { options }) });
    } catch {
      // unparsable arguments fail in the tool itself
    }
  }
  return questions;
}
