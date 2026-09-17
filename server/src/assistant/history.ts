import type { ModelMessage } from '@tanstack/ai';

const INTERRUPTED_RESULT = 'No result: the previous run ended before this tool answered.';

function hasContent(message: ModelMessage): boolean {
  const content = message.content;
  if (typeof content === 'string') return content.trim().length > 0;
  return Array.isArray(content) && content.length > 0;
}

export function repairHistory(messages: readonly ModelMessage[]): ModelMessage[] {
  const out: ModelMessage[] = [];

  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role === 'tool') continue;
    if (message.role !== 'assistant') {
      if (hasContent(message)) out.push(message);
      continue;
    }

    const calls = message.toolCalls ?? [];
    if (!calls.length) {
      if (hasContent(message) || message.structuredOutput) out.push(message);
      continue;
    }

    out.push(message);
    const callIds = new Set(calls.map((call) => call.id));
    const answered = new Set<string>();
    let next = index + 1;
    for (; next < messages.length && messages[next].role === 'tool'; next++) {
      const result = messages[next];
      const id = result.toolCallId;
      if (!id || !callIds.has(id) || answered.has(id)) continue;
      answered.add(id);
      out.push(result);
    }
    for (const call of calls) {
      if (answered.has(call.id)) continue;
      out.push({ role: 'tool', toolCallId: call.id, name: call.function.name, content: INTERRUPTED_RESULT });
    }
    index = next - 1;
  }

  return out;
}
