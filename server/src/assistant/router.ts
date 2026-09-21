import { chat, renderLazyCatalogEntry } from '@tanstack/ai';
import * as zod from 'zod';

import { estimateTokens } from './budget.js';

import type { ChatMiddleware, ModelMessage, UIMessage } from '@tanstack/ai';
import type { AssistantAdapter } from './providers.js';
import type { CoreTool } from './tools/shared.js';

export const ROUTE_TIMEOUT_MS = 20_000;
const MAX_PICKS = 4;
const QUESTION_CHARS = 1_000;
const CATALOG_SHARE = 0.25;
const ACTIONS = /Actions: .*$/s;

export const ROUTED_TOOLS = ['docs_read', 'api_search', 'api_get', 'api_call'];

// prettier-ignore
const ROUTER_PROMPT =
  'You choose the tools an assistant of a camera system needs for one question. The assistant answers afterwards, you only choose. ' +
  'Pick every tool the question needs, at most four, the most important first. Pick nothing when none of them fits.';

export async function routeTools(
  adapter: AssistantAdapter,
  question: string,
  hidden: CoreTool[],
  window: number,
  middleware: ChatMiddleware<never>[],
  onError: (message: string) => void,
): Promise<string[] | null> {
  const names = hidden.map((tool) => tool.name);
  if (!names.length || !question.trim()) return [];

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ROUTE_TIMEOUT_MS);
  try {
    const output = await (chat({
      adapter,
      systemPrompts: [ROUTER_PROMPT, catalog(hidden, window)],
      messages: [{ role: 'user', content: question }],
      outputSchema: zod.object({ tools: zod.array(zod.enum(names as [string, ...string[]])).max(MAX_PICKS) }),
      middleware,
      abortController: abort,
    } as never) as unknown as Promise<{ tools?: unknown }>);
    const picks = Array.isArray(output.tools) ? output.tools : [];
    return picks.filter((name): name is string => typeof name === 'string' && names.includes(name)).slice(0, MAX_PICKS);
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

function catalog(tools: CoreTool[], window: number): string {
  const names = `Tools: ${tools.map((tool) => tool.name).join(', ')}`;
  const described = tools.map((tool) => renderLazyCatalogEntry(tool.name, tool.description ?? '', 'first-sentence'));
  // a tool that bundles actions is only recognisable by them
  const detailed = described.map((entry, index) => [entry, ACTIONS.exec(tools[index].description ?? '')?.[0]].filter(Boolean).join(' '));

  const limit = window * CATALOG_SHARE;
  return [detailed, described].map((entries) => `Tools:\n${entries.join('\n')}`).find((text) => estimateTokens(text) <= limit) ?? names;
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
