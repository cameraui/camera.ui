import { toolDefinition } from '@tanstack/ai';
import * as zod from 'zod';

import { ASSISTANT_CARD_EVENT, toolError } from './shared.js';

import type { CoreTool, ToolContext } from './shared.js';

const DATA_FREE_TOOLS = new Set(['show_report', 'docs_search', 'docs_read', 'api_search', 'ask_user']);

const clipped = (max: number) => zod.string().transform((text) => (text.length > max ? `${text.slice(0, max - 1)}…` : text));

const item = zod.object({
  label: clipped(80).pipe(zod.string().min(1)).describe('What the row is about, for a moment what happened, at most 80 characters'),
  value: clipped(60).optional().describe('The number, state or time, short'),
  note: clipped(160).optional().describe('One short remark, e.g. camera or time'),
  severity: zod.enum(['ok', 'warn', 'error', 'info']).optional(),
  share: zod.number().min(0).max(1).optional().describe('Share of the total for a bar'),
  episodeId: zod.string().max(64).optional().describe('Episode id, the row opens it'),
  eventId: zod.string().max(64).optional().describe('Event id, the row opens the recording'),
});

const showReport = toolDefinition({
  name: 'show_report',
  description:
    'Show a card instead of a text list: a day or week recap, a system health check or any short list of labelled values. ' +
    'Call it once with all items, then add at most one sentence.',
  inputSchema: zod.object({
    kind: zod.enum(['day_recap', 'system_health', 'list']),
    title: clipped(80).pipe(zod.string().min(1)),
    subtitle: clipped(160).optional(),
    items: zod
      .array(item)
      .min(1)
      .transform((items) => items.slice(0, 12))
      .describe('At most 12'),
    footer: clipped(200).optional(),
  }),
  metadata: { interactive: true },
}).server<ToolContext['context']>((card, ctx) => {
  const called = ctx.context.calledTools;
  if (called?.every((name) => DATA_FREE_TOOLS.has(name))) {
    // prettier-ignore
    return toolError(
      'The card was not shown, no data was fetched in this run yet. Fetch it first: for a recap call the summarize_day tool of the NVR plugin per day, ' +
      'for system health get_metrics, then call show_report again with the real moments and numbers. Do not tell the user that nothing was found.',
    );
  }
  ctx.emitCustomEvent(ASSISTANT_CARD_EVENT, { toolCallId: ctx.toolCallId ?? null, card });
  return `The card "${card.title}" with ${card.items.length} items is shown to the user. Do not repeat its numbers, add at most one short sentence.`;
});

export const reportTools: CoreTool[] = [showReport];
