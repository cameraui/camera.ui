import { DISCOVERY_TOOL_NAME } from '@tanstack/ai';

import { estimateTokens } from './budget.js';
import { isPicturesMessage } from './uploads.js';

import type { ModelMessage } from '@tanstack/ai';
import type { CompactionStrategy } from '@tanstack/ai-compaction';

const CUT_NOTE = ' […] cut here, ask again for a narrower range to see the rest';
const MARGIN_TOKENS = 16;
const FETCHED_NOTE = '[tools fetched, they are in the tool list now]';
const SKILL_TOOL = 'load_skill';
const PROCEDURES_LEAD = 'Procedures loaded earlier in this run, they still apply:';

export const PICTURE_TOKENS = 800;

export function estimateMessage(message: ModelMessage): number {
  const parts: unknown[] = Array.isArray(message.content) ? message.content : [message.content ?? ''];
  const pictures = parts.filter(isData).length;
  const text = parts.filter((part) => !isData(part)).map((part) => (typeof part === 'string' ? part : JSON.stringify(part)));
  if (message.toolCalls?.length) text.push(JSON.stringify(message.toolCalls));
  return estimateTokens(text.join('')) + pictures * PICTURE_TOKENS;
}

export function clearDiscoveryResults(): CompactionStrategy {
  return (messages) => {
    const fetched = callIds(messages, DISCOVERY_TOOL_NAME);
    const stale = (message: ModelMessage): boolean => message.role === 'tool' && fetched.has(message.toolCallId ?? '') && message.content !== FETCHED_NOTE;
    return messages.some(stale) ? messages.map((message) => (stale(message) ? { ...message, content: FETCHED_NOTE } : message)) : null;
  };
}

export function keepSkills(strategy: CompactionStrategy): CompactionStrategy {
  return async (messages, ctx) => {
    const next = await strategy(messages, ctx);
    if (!next) return next;

    // a second load_skill only answers "already loaded", a procedure that left the history is gone for the run
    const loaded = callIds(messages, SKILL_TOOL);
    const original = new Map(messages.filter((message) => loaded.has(message.toolCallId ?? '')).map((message) => [message.toolCallId, message]));
    const restored = next.map((message) => (message.role === 'tool' ? (original.get(message.toolCallId) ?? message) : message));

    const evicted = [...original.values()].filter((message) => !restored.includes(message) && typeof message.content === 'string');
    if (!evicted.length) return restored;
    const procedures: ModelMessage = { role: 'user', content: `${PROCEDURES_LEAD}\n${evicted.map((message) => message.content as string).join('\n\n')}` };
    return [restored[0], procedures, ...restored.slice(1)];
  };
}

export function trimToolResults(options: { maxTokens: number }): CompactionStrategy {
  return (messages, ctx) => {
    const next = [...messages];
    let excess = next.reduce((sum, message) => sum + ctx.estimate(message), 0) - ctx.maxTokens + MARGIN_TOKENS;

    // the largest result gives way first and only as far as needed
    for (const { index, tokens } of largestResults(next, options.maxTokens)) {
      if (excess <= 0) break;
      const content = next[index].content as string;
      const body = content.endsWith(CUT_NOTE) ? content.slice(0, -CUT_NOTE.length) : content;
      const keepTokens = Math.max(options.maxTokens, tokens - excess);
      const cut = body.slice(0, Math.floor((body.length * keepTokens) / tokens)) + CUT_NOTE;
      if (cut.length >= content.length) continue;

      excess -= tokens - estimateTokens(cut);
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

function isData(part: unknown): boolean {
  return typeof (part as { source?: { value?: unknown } } | null)?.source?.value === 'string';
}

function callIds(messages: readonly ModelMessage[], toolName: string): Set<string> {
  return new Set(messages.flatMap((message) => (message.toolCalls ?? []).filter((call) => call.function.name === toolName).map((call) => call.id)));
}

function largestResults(messages: ModelMessage[], minTokens: number): { index: number; tokens: number }[] {
  return messages
    .map((message, index) => ({ index, tokens: message.role === 'tool' && typeof message.content === 'string' ? estimateTokens(message.content) : 0 }))
    .filter((entry) => entry.tokens > minTokens)
    .sort((a, b) => b.tokens - a.tokens);
}
