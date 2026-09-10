import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import type { AssistantManager } from '../manager.js';
import type { CoreTool, ToolContext } from './shared.js';

const remember = toolDefinition({
  name: 'remember',
  description:
    'Store a durable fact about the user for future conversations when they ask you to remember something ("merk dir", "remember that"): ' +
    'names of people and pets, which camera watches what, how they want answers. Not for events or anything temporary.',
  inputSchema: zod.object({ fact: zod.string().min(3).max(200).describe('One short statement in the user language, third person') }),
}).server<ToolContext['context']>(async ({ fact }, ctx) => {
  const added = await container.resolve<AssistantManager>('assistantManager').memory.add(ctx.context.userId, [fact], ctx.context.threadId);
  return added ? 'Remembered.' : 'Already known.';
});

const forget = toolDefinition({
  name: 'forget_memory',
  description: 'Remove remembered facts about the user that match the given text, when they ask you to forget something.',
  inputSchema: zod.object({ text: zod.string().min(2).max(200).describe('The fact or a distinctive part of it') }),
}).server<ToolContext['context']>(async ({ text }, ctx) => {
  const removed = await container.resolve<AssistantManager>('assistantManager').memory.removeMatching(ctx.context.userId, [text]);
  return removed ? `Forgot ${removed} fact(s).` : 'Nothing matched.';
});

export const memoryTools: CoreTool[] = [remember, forget];
