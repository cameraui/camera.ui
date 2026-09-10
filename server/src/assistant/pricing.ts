import type { DBAssistantProvider } from '../api/database/types.js';

export interface AssistantUsageTotals {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
}

type Price = [input: number, cached: number | null, output: number];

const PRICES: Partial<Record<DBAssistantProvider, Record<string, Price>>> = {
  anthropic: {
    'claude-fable-5-1': [10, 0.25, 50],
    'claude-fable-5': [10, 1, 50],
    'claude-opus-5-fast': [10, 1, 50],
    'claude-opus-5': [5, 0.5, 25],
    'claude-sonnet-5': [3, 0.3, 15],
    'claude-opus-4-8': [5, 0.5, 25],
    'claude-opus-4-7': [5, 0.5, 25],
    'claude-opus-4-6': [5, 0.5, 25],
    'claude-opus-4-5': [15, 1.5, 75],
    'claude-opus-4-1': [15, 1.5, 75],
    'claude-opus-4': [15, 1.5, 75],
    'claude-sonnet-4-6': [3, 0.3, 15],
    'claude-sonnet-4-5': [3, 0.3, 15],
    'claude-sonnet-4': [3, 0.3, 15],
    'claude-haiku-4-5': [1, 0.1, 5],
    'claude-3-5-haiku': [0.8, 0.08, 4],
  },
  openai: {
    'gpt-5.2-pro': [21, null, 168],
    'gpt-5.2': [1.75, 0.175, 14],
    'gpt-5.1-codex-mini': [0.25, 0.025, 2],
    'gpt-5.1': [1.25, 0.125, 10],
    'gpt-5-pro': [15, null, 120],
    'gpt-5-mini': [0.25, 0.025, 2],
    'gpt-5-nano': [0.05, 0.005, 0.4],
    'gpt-5': [1.25, 0.125, 10],
    'gpt-4.1-mini': [0.4, 0.1, 1.6],
    'gpt-4.1-nano': [0.1, 0.025, 0.4],
    'gpt-4.1': [2, 0.5, 8],
    'gpt-4o-mini': [0.15, 0.075, 0.6],
    'gpt-4o': [2.5, 1.25, 10],
    'chatgpt-4o-latest': [5, null, 15],
    'o4-mini': [1.1, 0.275, 4.4],
    'o3-pro': [20, null, 80],
    'o3-mini': [1.1, 0.55, 4.4],
    o3: [2, 0.5, 8],
    'o1-pro': [150, null, 600],
    o1: [15, 7.5, 60],
  },
  gemini: {
    'gemini-3.8-flash': [0.75, 0.075, 3.75],
    'gemini-3.7-flash': [0.75, 0.075, 3.75],
    'gemini-3.6-flash': [1.5, 0.15, 7.5],
    'gemini-3.5-flash-lite': [0.3, 0.03, 2.5],
    'gemini-3.5-flash': [1.5, 0.15, 9],
    'gemini-3.1-pro': [2.5, null, 15],
    'gemini-3.1-flash-lite': [0.25, null, 1.5],
    'gemini-3-flash': [0.5, null, 3],
    'gemini-2.5-pro': [2.5, null, 15],
    'gemini-2.5-flash-lite': [0.1, null, 0.4],
    'gemini-2.5-flash': [1, null, 2.5],
  },
};

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_TTL_MS = 6 * 60 * 60_000;

let openrouterPrices: { at: number; prices: Record<string, Price> } | undefined;
let openrouterLoading: Promise<void> | undefined;

export function estimateCost(provider: DBAssistantProvider, model: string, usage: AssistantUsageTotals): number | null {
  const price = provider === 'openrouter' ? openrouterPrices?.prices[model] : longestPrefix(PRICES[provider], model);
  if (!price) return null;
  const [input, cached, output] = price;
  const uncached = Math.max(0, usage.promptTokens - usage.cachedTokens);
  const cost = (uncached * input + usage.cachedTokens * (cached ?? input) + usage.completionTokens * output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export function warmPrices(provider: DBAssistantProvider): void {
  if (provider !== 'openrouter' || openrouterLoading || (openrouterPrices && Date.now() - openrouterPrices.at < OPENROUTER_TTL_MS)) return;
  openrouterLoading = fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as { data?: { id: string; pricing?: { prompt?: string; completion?: string; input_cache_read?: string } }[] };
      const prices: Record<string, Price> = {};
      for (const entry of data.data ?? []) {
        const input = Number(entry.pricing?.prompt);
        const output = Number(entry.pricing?.completion);
        if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
        const cached = Number(entry.pricing?.input_cache_read);
        prices[entry.id] = [input * 1_000_000, Number.isFinite(cached) && entry.pricing?.input_cache_read ? cached * 1_000_000 : null, output * 1_000_000];
      }
      openrouterPrices = { at: Date.now(), prices };
    })
    .catch(() => undefined)
    .finally(() => (openrouterLoading = undefined));
}

function longestPrefix(table: Record<string, Price> | undefined, model: string): Price | undefined {
  if (!table) return undefined;
  let best: string | undefined;
  for (const name of Object.keys(table)) {
    if (model.startsWith(name) && (!best || name.length > best.length)) best = name;
  }
  return best ? table[best] : undefined;
}
