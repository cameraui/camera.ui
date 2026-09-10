import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { ASSISTANT_QUESTION_KINDS } from '../interrupts.js';
import { toolError } from './shared.js';

import type { CoreTool, ToolContext } from './shared.js';

const askUser = toolDefinition({
  name: 'ask_user',
  description:
    'Ask the user one short question with concrete options when the request is ambiguous (which camera, which time range, which of several matches). ' +
    'The chat shows a small form instead of a text question; the answer comes back as text. Ask at most one question per turn.',
  inputSchema: zod.object({
    question: zod.string().min(1).max(300),
    kind: zod
      .enum(ASSISTANT_QUESTION_KINDS)
      .default('choice')
      .describe('choice: pick one option, camera: pick a camera, time_range: pick a start and an end, text: free answer'),
    options: zod.array(zod.string().max(80)).max(8).optional().describe('Concrete choices for choice and camera'),
  }),
  metadata: { interactive: true },
}).server<ToolContext['context']>((_input, ctx) => {
  const answer = ctx.toolCallId ? ctx.context.answers?.get(ctx.toolCallId) : undefined;
  if (!answer) return toolError('The user did not answer. Continue with a sensible assumption and say which one you took.');
  return { answer };
});

export const askTools: CoreTool[] = [askUser];
