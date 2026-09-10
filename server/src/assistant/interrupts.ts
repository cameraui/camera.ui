import { defineInterrupt } from '@tanstack/ai';
import * as zod from 'zod';

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
