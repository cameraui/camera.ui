import { CONTEXT_OVERFLOW_CODE, EventType } from '@tanstack/ai';

import { flattenToolHistory } from './history.js';

import type { StreamChunk } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';

type ChatStreamOptions = Parameters<AssistantAdapter['chatStream']>[0];

interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  promptTokensDetails?: { cachedTokens?: number; cacheWriteTokens?: number };
}

const OVERFLOW_SHRINK = 0.6;
const MODEL_OUTPUT = new Set<string>([
  EventType.TEXT_MESSAGE_START,
  EventType.TEXT_MESSAGE_CONTENT,
  EventType.TEXT_MESSAGE_CHUNK,
  EventType.TOOL_CALL_START,
  EventType.TOOL_CALL_CHUNK,
  EventType.REASONING_START,
  EventType.REASONING_MESSAGE_START,
  EventType.REASONING_MESSAGE_CHUNK,
  EventType.RUN_FINISHED,
  EventType.RUN_ERROR,
]);
const RETRY_PROMPT = 'Your previous reply came back empty. Answer the user now, from the conversation and the tool results you already have.';
const TEXT_ONLY_PROMPT =
  'Your replies came back empty and no tool is available anymore. Write the answer now as plain text from what the tools already returned, ' +
  'and say plainly what you could not check. Do not write a tool call or a tool name with arguments into the answer.';

export function withEmptyTurnRetry(adapter: AssistantAdapter, onRetry: () => void): AssistantAdapter {
  let retried = false;

  // eslint-disable-next-line @stylistic/generator-star-spacing
  async function* chatStream(options: ChatStreamOptions): AsyncGenerator<StreamChunk> {
    // a model silent once often stays silent with the same tools, the last try drops them
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
        if (chunk.type === EventType.RUN_ERROR) {
          failed = true;
          // the empty attempts before were billed too
          yield index ? { ...chunk, usage: addUsage(usage, chunk.usage) } : chunk;
          continue;
        }
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

// eslint-disable-next-line @stylistic/generator-star-spacing
export async function* retryOnOverflow(
  start: (budget: number) => AsyncIterable<StreamChunk>,
  budget: number,
  onRetry: (budget: number) => void,
): AsyncIterable<StreamChunk> {
  const held: StreamChunk[] = [];
  let answered = false;
  let overflowed = false;
  for await (const chunk of start(budget)) {
    if (answered) {
      yield chunk;
      continue;
    }
    if (chunk.type === EventType.RUN_ERROR && chunk.code === CONTEXT_OVERFLOW_CODE) {
      overflowed = true;
      break;
    }
    held.push(chunk);
    if (MODEL_OUTPUT.has(chunk.type)) {
      answered = true;
      yield* held;
    }
  }
  if (!overflowed) {
    if (!answered) yield* held;
    return;
  }
  const smaller = Math.floor(budget * OVERFLOW_SHRINK);
  onRetry(smaller);
  yield* start(smaller);
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
  // promptTokens includes the cache parts, they must add up too
  const cachedTokens = (first.promptTokensDetails?.cachedTokens ?? 0) + (second.promptTokensDetails?.cachedTokens ?? 0);
  const cacheWriteTokens = (first.promptTokensDetails?.cacheWriteTokens ?? 0) + (second.promptTokensDetails?.cacheWriteTokens ?? 0);
  return {
    ...second,
    promptTokens: (first.promptTokens ?? 0) + (second.promptTokens ?? 0),
    completionTokens: (first.completionTokens ?? 0) + (second.completionTokens ?? 0),
    totalTokens: (first.totalTokens ?? 0) + (second.totalTokens ?? 0),
    ...(cachedTokens || cacheWriteTokens ? { promptTokensDetails: { ...second.promptTokensDetails, cachedTokens, cacheWriteTokens } } : {}),
  };
}

function isUsage(value: unknown): value is TokenUsage {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && typeof (value as TokenUsage).promptTokens === 'number';
}
