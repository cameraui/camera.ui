import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { ASSISTANT_CARD_EVENT } from './shared.js';

import type { CoreTool, ToolContext } from './shared.js';

const item = zod.object({
  label: zod.string().min(1).max(60),
  value: zod.string().min(1).max(60).describe('The number or state, short'),
  note: zod.string().max(160).optional().describe('One short remark, for example the camera or the time'),
  severity: zod.enum(['ok', 'warn', 'error', 'info']).optional(),
  share: zod.number().min(0).max(1).optional().describe('Fraction of the total for a bar, when the items add up to something'),
  episodeId: zod.string().max(64).optional().describe('Episode id from a tool result, the row then opens that episode'),
  eventId: zod.string().max(64).optional().describe('Event id from a tool result, the row then opens that recording'),
});

const showReport = toolDefinition({
  name: 'show_report',
  description:
    'Show the user a structured card instead of a list in text: a day or week recap (events per camera, notable moments), a system health check ' +
    '(cameras, workers, storage, plugins) or any short list of labelled values. Call it once with all items, then add at most one sentence.',
  inputSchema: zod.object({
    kind: zod.enum(['day_recap', 'system_health', 'list']),
    title: zod.string().min(1).max(80),
    subtitle: zod.string().max(160).optional(),
    items: zod.array(item).min(1).max(12),
    footer: zod.string().max(200).optional(),
  }),
  metadata: { interactive: true },
}).server<ToolContext['context']>((card, ctx) => {
  ctx.emitCustomEvent(ASSISTANT_CARD_EVENT, { toolCallId: ctx.toolCallId ?? null, card });
  return `The card "${card.title}" with ${card.items.length} items is shown to the user. Do not repeat its numbers, add at most one short sentence.`;
});

export const reportTools: CoreTool[] = [showReport];
