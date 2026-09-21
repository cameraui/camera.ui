import { DISCOVERY_TOOL_NAME } from '@tanstack/ai';

import { CHARS_PER_TOKEN } from './budget.js';
import { isPicturesMessage } from './uploads.js';

import type { ModelMessage } from '@tanstack/ai';
import type { CompactionStrategy } from '@tanstack/ai-compaction';

const CUT_NOTE = ' […] cut here, ask again for a narrower range to see the rest';
const MARGIN_TOKENS = 16;
const FETCHED_NOTE = '[tools fetched, they are in the tool list now]';
const SKILL_TOOL = 'load_skill';

export const PICTURE_TOKENS = 800;

export function estimateMessage(message: ModelMessage): number {
  const parts: unknown[] = Array.isArray(message.content) ? message.content : [message.content ?? ''];
  const pictures = parts.filter(isData).length;
  const text = parts.filter((part) => !isData(part)).map((part) => (typeof part === 'string' ? part : JSON.stringify(part)));
  if (message.toolCalls?.length) text.push(JSON.stringify(message.toolCalls));
  return Math.ceil(text.join('').length / CHARS_PER_TOKEN) + pictures * PICTURE_TOKENS;
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

    // a second load_skill only answers "already loaded", a cleared procedure is gone for the run
    const loaded = callIds(messages, SKILL_TOOL);
    const original = new Map(messages.filter((message) => loaded.has(message.toolCallId ?? '')).map((message) => [message.toolCallId, message]));
    return next.map((message) => (message.role === 'tool' ? (original.get(message.toolCallId) ?? message) : message));
  };
}

export function trimToolResults(options: { maxChars: number }): CompactionStrategy {
  return (messages, ctx) => {
    const next = [...messages];
    const used = next.reduce((sum, message) => sum + ctx.estimate(message), 0);
    let excess = (used - ctx.maxTokens + MARGIN_TOKENS) * CHARS_PER_TOKEN;

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

function isData(part: unknown): boolean {
  return typeof (part as { source?: { value?: unknown } } | null)?.source?.value === 'string';
}

function callIds(messages: readonly ModelMessage[], toolName: string): Set<string> {
  return new Set(messages.flatMap((message) => (message.toolCalls ?? []).filter((call) => call.function.name === toolName).map((call) => call.id)));
}

function largestResults(messages: ModelMessage[], minChars: number): number[] {
  return messages
    .map((message, index) => ({ index, size: message.role === 'tool' && typeof message.content === 'string' ? message.content.length : 0 }))
    .filter((entry) => entry.size > minChars)
    .sort((a, b) => b.size - a.size)
    .map((entry) => entry.index);
}
