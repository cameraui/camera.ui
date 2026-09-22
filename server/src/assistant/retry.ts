import { EventType } from '@tanstack/ai';

import { flattenToolHistory } from './history.js';

import type { StreamChunk } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';

type ChatStreamOptions = Parameters<AssistantAdapter['chatStream']>[0];

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

const RETRY_PROMPT = 'Your previous reply came back empty. Answer the user now, from the conversation and the tool results you already have.';
const TEXT_ONLY_PROMPT =
  'Your replies came back empty and no tool is available anymore. Write the answer now as plain text from what the tools already returned, ' +
  'and say plainly what you could not check. Do not write a tool call or a tool name with arguments into the answer.';

export function withEmptyTurnRetry(adapter: AssistantAdapter, onRetry: () => void): AssistantAdapter {
  let retried = false;

  // eslint-disable-next-line @stylistic/generator-star-spacing
  async function* chatStream(options: ChatStreamOptions): AsyncGenerator<StreamChunk> {
    // a model that stays silent once often stays silent with the same tools, the last try takes them away so it has to write
    const attempts = [
      options,
      { ...options, systemPrompts: [...(options.systemPrompts ?? []), RETRY_PROMPT] },
      { ...options, messages: flattenToolHistory(options.messages), tools: [], systemPrompts: [...(options.systemPrompts ?? []), TEXT_ONLY_PROMPT] },
    ];

    let usage: unknown;
    for (const [index, attempt] of attempts.entries()) {
      let finish: StreamChunk | undefined;
      let answered = false;
      let failed = false;
      for await (const chunk of adapter.chatStream(attempt) as AsyncIterable<StreamChunk>) {
        if (chunk.type === EventType.RUN_FINISHED) {
          finish = chunk;
          continue;
        }
        if (chunk.type === EventType.RUN_ERROR) failed = true;
        if ((chunk.type === EventType.TEXT_MESSAGE_CONTENT && chunk.delta.trim()) || chunk.type === EventType.TOOL_CALL_START) answered = true;
        yield chunk;
      }

      if (finish?.type === EventType.RUN_FINISHED) {
        usage = index ? addUsage(usage, finish.usage) : finish.usage;
        finish = { ...finish, usage } as StreamChunk;
      }
      const stopped = finish?.type === EventType.RUN_FINISHED && (finish.finishReason === 'stop' || !finish.finishReason);
      const last = index === attempts.length - 1 || (index === 0 && retried);
      if (!finish || answered || failed || last || !stopped || options.request?.signal?.aborted) {
        if (finish) yield finish;
        return;
      }

      retried = true;
      if (index === 0) onRetry();
    }
  }

  return wrapChatStream(adapter, chatStream);
}

export function wrapChatStream(adapter: AssistantAdapter, chatStream: (options: ChatStreamOptions) => AsyncGenerator<StreamChunk>): AssistantAdapter {
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
