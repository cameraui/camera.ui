import { chat, renderLazyCatalogEntry } from '@tanstack/ai';
import * as zod from 'zod';

import { rankTools } from './tool-rank.js';

import type { ChatMiddleware, ModelMessage, UIMessage } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';
import type { CoreTool } from './tools/shared.js';

export const ROUTE_TIMEOUT_MS = 20_000;
export const ROUTED_TOOLS = ['docs_read', 'api_search', 'api_get', 'api_call'];

const SHORTLIST = 6;
const MAX_PICKS = 3;
const QUESTION_CHARS = 1_000;

// prettier-ignore
const SEARCH_PROMPT =
  'You prepare a question about a camera system for a search. ' +
  'Write the question in English and name in a few words what data or action answers it.';

// prettier-ignore
const PICK_PROMPT =
  'You choose the tools an assistant of a camera system needs for one question. The assistant answers afterwards, you only choose. ' +
  'Pick only the tools the question needs, the most important first, at most three. Pick nothing when none of them fits.';

// a small model names what a question needs but cannot map that onto fifty tool names: the ranking narrows them down, the model picks among a few
export async function routeTools(
  adapter: AssistantAdapter,
  question: string,
  hidden: CoreTool[],
  middleware: ChatMiddleware<never>[],
  onError: (message: string) => void,
): Promise<string[] | null> {
  if (!hidden.length || !question.trim()) return [];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ROUTE_TIMEOUT_MS);
  const ask = <T>(systemPrompts: string[], outputSchema: zod.ZodType<T>): Promise<T> =>
    chat({ adapter, systemPrompts, messages: [{ role: 'user', content: question }], outputSchema, middleware, abortController: abort } as never) as unknown as Promise<T>;

  try {
    const search = await ask([SEARCH_PROMPT], zod.object({ english: zod.string(), need: zod.string() }));
    const shortlist = rankTools(`${search.english} ${search.need}`, hidden).slice(0, SHORTLIST);
    if (!shortlist.length) return [];

    const names = shortlist.map((tool) => tool.name);
    const catalog = shortlist.map((tool) => renderLazyCatalogEntry(tool.name, tool.description ?? '', 'first-sentence')).join('\n');
    const picked = await ask([PICK_PROMPT, `Tools:\n${catalog}`], zod.object({ tools: zod.array(zod.enum(names as [string, ...string[]])).max(MAX_PICKS) }));
    return picked.tools.filter((name) => names.includes(name)).slice(0, MAX_PICKS);
  } catch (error: unknown) {
    onError(error instanceof Error ? error.message : String(error));
    return null;
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
