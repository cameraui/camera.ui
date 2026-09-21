import { EventType } from '@tanstack/ai';

import { wrapChatStream } from './retry.js';

import type { StreamChunk } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';

type ChatStreamOptions = Parameters<AssistantAdapter['chatStream']>[0];

export function withToolNameRepair(adapter: AssistantAdapter, onRepair: (from: string, to: string) => void): AssistantAdapter {
  // eslint-disable-next-line @stylistic/generator-star-spacing
  async function* chatStream(options: ChatStreamOptions): AsyncGenerator<StreamChunk> {
    const known = (options.tools ?? []).map((tool) => tool.name);
    for await (const chunk of adapter.chatStream(options) as AsyncIterable<StreamChunk>) {
      if (chunk.type !== EventType.TOOL_CALL_START || known.includes(chunk.toolCallName)) {
        yield chunk;
        continue;
      }
      const repaired = known.filter((name) => chunk.toolCallName.startsWith(name)).sort((a, b) => b.length - a.length)[0] ?? sameLetters(known, chunk.toolCallName);
      if (!repaired) {
        yield chunk;
        continue;
      }
      onRepair(chunk.toolCallName, repaired);
      yield { ...chunk, toolCallName: repaired, toolName: repaired };
    }
  }

  return wrapChatStream(adapter, chatStream);
}

// small models drop or double an underscore: nvr_query_events, __lazy_tool__discovery__
function sameLetters(known: string[], called: string): string | undefined {
  const matches = known.filter((name) => letters(name) === letters(called));
  return matches.length === 1 ? matches[0] : undefined;
}

function letters(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}
