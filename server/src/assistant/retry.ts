import { EventType } from '@tanstack/ai';

import type { StreamChunk } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';

type ChatStreamOptions = Parameters<AssistantAdapter['chatStream']>[0];

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const RETRY_PROMPT = 'Your previous reply came back empty. Answer the user now, from the conversation and the tool results you already have.';

export function withEmptyTurnRetry(adapter: AssistantAdapter, onRetry: () => void): AssistantAdapter {
  let retried = false;

  // eslint-disable-next-line @stylistic/generator-star-spacing
  async function* chatStream(options: ChatStreamOptions): AsyncGenerator<StreamChunk> {
    let finish: StreamChunk | undefined;
    let answered = false;
    let failed = false;
    for await (const chunk of adapter.chatStream(options) as AsyncIterable<StreamChunk>) {
      if (chunk.type === EventType.RUN_FINISHED) {
        finish = chunk;
        continue;
      }
      if (chunk.type === EventType.RUN_ERROR) failed = true;
      if ((chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta.trim()) || chunk.type === EventType.TOOL_CALL_START) answered = true;
      yield chunk;
    }

    const stopped = finish?.type === EventType.RUN_FINISHED && (finish.finishReason === 'stop' || !finish.finishReason);
    if (!finish || answered || failed || retried || !stopped || options.request?.signal?.aborted) {
      if (finish) yield finish;
      return;
    }

    retried = true;
    onRetry();
    const firstUsage = finish.type === EventType.RUN_FINISHED ? finish.usage : undefined;
    for await (const chunk of adapter.chatStream({ ...options, systemPrompts: [...(options.systemPrompts ?? []), RETRY_PROMPT] }) as AsyncIterable<StreamChunk>) {
      yield chunk.type === EventType.RUN_FINISHED ? { ...chunk, usage: addUsage(firstUsage, chunk.usage) } : chunk;
    }
  }

  return new Proxy(adapter, {
    get(target, property, receiver) {
      if (property === 'chatStream') return chatStream;
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
}

function addUsage<T>(first: unknown, second: T): T {
  if (!isUsage(first) || !isUsage(second)) return second ?? (first as T);
  return {
    ...second,
    promptTokens: (first.promptTokens ?? 0) + (second.promptTokens ?? 0),
    completionTokens: (first.completionTokens ?? 0) + (second.completionTokens ?? 0),
    totalTokens: (first.totalTokens ?? 0) + (second.totalTokens ?? 0),
  };
}

function isUsage(value: unknown): value is TokenUsage {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as TokenUsage).promptTokens === 'number';
}
