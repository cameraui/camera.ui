import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import type { AssistantManager } from '../manager.js';
import type { CoreTool, ToolContext } from './shared.js';

const remember = toolDefinition({
  name: 'remember',
  description: 'Remember a fact about the user for future conversations: names of people and pets, which camera watches what, how they want answers. Not for events.',
  inputSchema: zod.object({ fact: zod.string().min(3).max(200).describe('One short statement, third person') }),
}).server<ToolContext['context']>(async ({ fact }, ctx) => {
  const added = await container.resolve<AssistantManager>('assistantManager').memory.add(ctx.context.userId, [fact], ctx.context.threadId);
  return added ? 'Remembered.' : 'Already known.';
});

const forget = toolDefinition({
  name: 'forget_memory',
  lazy: true,
  description: 'Forget remembered facts that match the text.',
  inputSchema: zod.object({ text: zod.string().min(2).max(200).describe('The fact or a distinctive part of it') }),
}).server<ToolContext['context']>(async ({ text }, ctx) => {
  const removed = await container.resolve<AssistantManager>('assistantManager').memory.removeMatching(ctx.context.userId, [text]);
  return removed ? `Forgot ${removed} fact(s).` : 'Nothing matched.';
});

export const memoryTools: CoreTool[] = [remember, forget];
