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

export function flattenToolHistory(messages: readonly ModelMessage[]): ModelMessage[] {
  const names = new Map<string, string>();
  const out: ModelMessage[] = [];

  for (const message of messages) {
    if (message.role === 'assistant' && message.toolCalls?.length) {
      for (const call of message.toolCalls) names.set(call.id, call.function.name);
      const calls = message.toolCalls.map((call) => `Earlier in this run I used the tool ${call.function.name} with ${call.function.arguments}.`);
      out.push({ role: 'assistant', content: [textOf(message), ...calls].filter((line) => line !== '').join('\n') });
      continue;
    }
    if (message.role !== 'tool') {
      out.push(message);
      continue;
    }

    const label = `The tool ${names.get(message.toolCallId ?? '') ?? 'you used'} returned:`;
    if (typeof message.content === 'string' || !message.content) out.push({ role: 'user', content: `${label} ${message.content ?? ''}` });
    else out.push({ role: 'user', content: [{ type: 'text', content: label }, ...message.content] });
  }

  return out;
}

function textOf(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content;
  return (message.content ?? []).flatMap((part) => (part.type === 'text' ? [part.content] : [])).join('\n');
}
