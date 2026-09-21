import { chat } from '@tanstack/ai';
import * as zod from 'zod';

import type { ChatMiddleware, ModelMessage, UIMessage } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';
import type { CoreTool } from './tools/shared.js';

export const ROUTE_TIMEOUT_MS = 20_000;
const MAX_PICKS = 4;
const QUESTION_CHARS = 1_000;

// prettier-ignore
const ROUTER_PROMPT =
  'You choose the tools an assistant of a camera system needs for one question. The assistant answers afterwards, you only choose. ' +
  'Pick every tool the question needs, at most four, the most important first. Pick nothing when none of them fits.';

export async function routeTools(
  adapter: AssistantAdapter,
  question: string,
  hidden: CoreTool[],
  middleware: ChatMiddleware<never>[],
  onError: (message: string) => void,
): Promise<string[]> {
  const names = hidden.map((tool) => tool.name);
  if (!names.length || !question.trim()) return [];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ROUTE_TIMEOUT_MS);
  try {
    const output = await (chat({
      adapter,
      systemPrompts: [ROUTER_PROMPT, `Tools: ${names.join(', ')}`],
      messages: [{ role: 'user', content: question }],
      outputSchema: zod.object({ tools: zod.array(zod.enum(names as [string, ...string[]])).max(MAX_PICKS) }),
      middleware,
      abortController: abort,
    } as never) as unknown as Promise<{ tools?: unknown }>);
    const picks = Array.isArray(output.tools) ? output.tools : [];
    return picks.filter((name): name is string => typeof name === 'string' && names.includes(name)).slice(0, MAX_PICKS);
  } catch (error: unknown) {
    // routing is an aid, a run without it still has the catalog
    onError(error instanceof Error ? error.message : String(error));
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export function questionText(messages: readonly (UIMessage | ModelMessage)[]): string {
  const asked = messages
    .filter((message) => message.role === 'user')
    .slice(-2)
    .map(textOf);
  return asked
    .filter((text) => text !== '')
    .join('\n')
    .slice(-QUESTION_CHARS);
}

function textOf(message: UIMessage | ModelMessage): string {
  const parts: unknown = 'parts' in message ? message.parts : message.content;
  if (typeof parts === 'string') return parts.trim();
  if (!Array.isArray(parts)) return '';
  return parts
    .flatMap((part: { type?: string; content?: unknown; text?: unknown }) => {
      const text = part.content ?? part.text;
      return part.type === 'text' && typeof text === 'string' ? [text] : [];
    })
    .join('\n')
    .trim();
}
