import { isPicturesMessage } from './uploads.js';

import type { ModelMessage } from '@tanstack/ai';
import type { CompactionStrategy } from '@tanstack/ai-compaction';

const CUT_NOTE = ' […] cut here, ask again for a narrower range to see the rest';
const ESTIMATE_CHARS_PER_TOKEN = 4;
const MARGIN_TOKENS = 16;

export function trimToolResults(options: { maxChars: number }): CompactionStrategy {
  return (messages, ctx) => {
    const next = [...messages];
    const used = next.reduce((sum, message) => sum + ctx.estimate(message), 0);
    let excess = (used - ctx.maxTokens + MARGIN_TOKENS) * ESTIMATE_CHARS_PER_TOKEN;

    // the largest result gives way first and only as far as needed
    for (const index of largestResults(next, options.maxChars)) {
      if (excess <= 0) break;
      const content = next[index].content as string;
      const body = content.endsWith(CUT_NOTE) ? content.slice(0, -CUT_NOTE.length) : content;
      const cut = body.slice(0, Math.max(options.maxChars, content.length - excess - CUT_NOTE.length)) + CUT_NOTE;
      if (cut.length >= content.length) continue;

      excess -= content.length - cut.length;
      next[index] = { ...next[index], content: cut };
    }
    return next.some((message, index) => message !== messages[index]) ? next : null;
  };
}

export function keepQuestion(strategy: CompactionStrategy): CompactionStrategy {
  return async (messages, ctx) => {
    const next = await strategy(messages, ctx);
    const question = messages.findLast((message) => message.role === 'user' && !isPicturesMessage(message));
    if (!next || !question || next.includes(question)) return next;

    // eviction starts at the oldest message, in a run of one question that is the question
    return [next[0], question, ...next.slice(1)];
  };
}

function largestResults(messages: ModelMessage[], minChars: number): number[] {
  return messages
    .map((message, index) => ({ index, size: message.role === 'tool' && typeof message.content === 'string' ? message.content.length : 0 }))
    .filter((entry) => entry.size > minChars)
    .sort((a, b) => b.size - a.size)
    .map((entry) => entry.index);
}
