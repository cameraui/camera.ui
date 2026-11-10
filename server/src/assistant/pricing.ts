import type { DBAssistantProvider } from '../api/database/types.js';

export interface AssistantUsageTotals {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

type Price = [input: number, cached: number | null, output: number, cacheWrite?: number];

const PRICES: Partial<Record<DBAssistantProvider, Record<string, Price>>> = {
  anthropic: {
    'claude-mythos-5-2': [8, 0.2, 40],
    'claude-mythos-5-1': [10, 0.25, 50],
    'claude-mythos-5': [10, 1, 50],
    'claude-fable-5-2': [8, 0.2, 40],
    'claude-fable-5-1': [10, 0.25, 50],
    'claude-fable-5': [10, 1, 50],
    'claude-opus-5-5': [4, 0.2, 20],
    'claude-opus-5': [5, 0.5, 25],
    'claude-sonnet-5-5': [2, 0.1, 10],
    'claude-sonnet-5': [2, 0.2, 10],
    'claude-opus-4-8': [5, 0.5, 25],
    'claude-opus-4-7': [5, 0.5, 25],
    'claude-opus-4-6': [5, 0.5, 25],
    'claude-opus-4-5': [5, 0.5, 25],
    'claude-opus-4': [15, 1.5, 75],
    'claude-sonnet-4-6': [3, 0.3, 15],
    'claude-sonnet-4-5': [3, 0.3, 15],
    'claude-sonnet-4': [3, 0.3, 15],
    'claude-haiku-5-5': [0.1, 0.01, 0.5],
    'claude-haiku-4-5': [1, 0.1, 5],
    'claude-3-5-haiku': [0.8, 0.08, 4],
  },
  openai: {
    'gpt-6.1-sol': [2, 0.1, 10],
    'gpt-6.1-terra': [1, 0.05, 5],
    'gpt-6-astra': [10, 1, 50],
    'gpt-6-sol': [2, 0.2, 10],
    'gpt-6-luna': [0.1, 0.01, 0.5],
    'gpt-5.6-sol': [4, 0.4, 20],
    'gpt-5.6-terra': [2, 0.2, 12],
    'gpt-5.6-luna': [0.2, 0.02, 1.2],
    'gpt-5.5-pro': [30, null, 180],
    'gpt-5.5': [5, 0.5, 30],
    'gpt-5.4-pro': [30, null, 180],
    'gpt-5.4-mini': [0.75, 0.075, 4.5],
    'gpt-5.4-nano': [0.2, 0.02, 1.25],
    'gpt-5.4': [2.5, 0.25, 15],
    'gpt-5.3-codex': [1.75, 0.175, 14],
    'gpt-5.2-pro': [21, null, 168],
    'gpt-5.2': [1.75, 0.175, 14],
    'gpt-5.1-codex-mini': [0.25, 0.025, 2],
    'gpt-5.1': [1.25, 0.125, 10],
    'gpt-5-pro': [15, null, 120],
    'gpt-5-mini': [0.25, 0.025, 2],
    'gpt-5-nano': [0.05, 0.005, 0.4],
    'gpt-5': [1.25, 0.125, 10],
    'gpt-rosalind-research': [5, 0.5, 25],
    'gpt-chat-latest': [5, 0.5, 30],
    'chat-latest': [5, 0.5, 30],
    'gpt-4.1-mini': [0.4, 0.1, 1.6],
    'gpt-4.1-nano': [0.1, 0.025, 0.4],
    'gpt-4.1': [2, 0.5, 8],
    'gpt-4o-mini': [0.15, 0.075, 0.6],
    'gpt-4o-2024-05-13': [5, null, 15],
    'gpt-4o': [2.5, 1.25, 10],
    'gpt-4-turbo': [10, null, 30],
    'gpt-3.5-turbo': [0.5, null, 1.5],
    'o4-mini-deep-research': [2, 0.5, 8],
    'o4-mini': [1.1, 0.275, 4.4],
    'o3-deep-research': [10, 2.5, 40],
    'o3-pro': [20, null, 80],
    'o3-mini': [1.1, 0.55, 4.4],
    o3: [2, 0.5, 8],
    'o1-pro': [150, null, 600],
    o1: [15, 7.5, 60],
  },
  gemini: {
    'gemini-4-argon': [2, 0.1, 10],
    'gemini-3.8-flash': [0.75, 0.075, 3.75],
    'gemini-3.7-flash': [0.75, 0.075, 3.75],
    'gemini-3.6-flash': [0.75, 0.075, 3.75],
    'gemini-3.5-flash-lite': [0.3, 0.03, 2.5],
    'gemini-3.5-flash': [1.5, 0.15, 9],
    'gemini-3.1-pro': [2, 0.2, 12],
    'gemini-3.1-flash-lite': [0.25, 0.025, 1.5],
    'gemini-3-flash': [0.5, 0.05, 3],
    'gemini-omni-1.1-flash': [1.5, null, 9],
    'gemini-2.5-pro': [1.25, 0.125, 10],
    'gemini-2.5-flash-lite': [0.1, 0.01, 0.4],
    'gemini-2.5-flash': [0.3, 0.03, 2.5],
  },
};

const LONG_PROMPT: Partial<Record<DBAssistantProvider, Record<string, { above: number; price: Price }>>> = {
  anthropic: {
    'claude-haiku-5-5': { above: 100_000, price: [0.5, 0.05, 2.5] },
  },
  openai: {
    'gpt-6.1-sol': { above: 272_000, price: [4, 0.2, 15] },
    'gpt-6.1-terra': { above: 272_000, price: [2, 0.1, 7.5] },
    'gpt-6-astra': { above: 272_000, price: [20, 2, 75] },
    'gpt-6-sol': { above: 272_000, price: [4, 0.4, 15] },
    'gpt-6-luna': { above: 272_000, price: [0.2, 0.02, 0.75] },
    'gpt-5.6-sol': { above: 272_000, price: [8, 0.8, 30] },
    'gpt-5.6-terra': { above: 272_000, price: [4, 0.4, 18] },
    'gpt-5.6-luna': { above: 272_000, price: [0.4, 0.04, 1.8] },
    'gpt-5.5-pro': { above: 272_000, price: [60, null, 270] },
    'gpt-5.5': { above: 272_000, price: [10, 1, 45] },
    'gpt-5.4-pro': { above: 272_000, price: [60, null, 270] },
    'gpt-5.4': { above: 272_000, price: [5, 0.5, 22.5] },
  },
  gemini: {
    'gemini-3.1-pro': { above: 200_000, price: [4, 0.4, 18] },
    'gemini-2.5-pro': { above: 200_000, price: [2.5, 0.25, 15] },
  },
};

const RAISED: Partial<Record<DBAssistantProvider, Record<string, { from: number; price: Price }>>> = {
  gemini: {
    'gemini-4-argon': { from: Date.UTC(2026, 11, 1), price: [4, 0.2, 20] },
    'gemini-3.8-flash': { from: Date.UTC(2027, 0, 1), price: [1.5, 0.15, 7.5] },
    'gemini-3.7-flash': { from: Date.UTC(2027, 0, 1), price: [1.5, 0.15, 7.5] },
    'gemini-3.6-flash': { from: Date.UTC(2027, 0, 1), price: [1.5, 0.15, 7.5] },
  },
};

const ANTHROPIC_CACHE_WRITE = 1.25;

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_TTL_MS = 6 * 60 * 60_000;

let openrouterPrices: { at: number; prices: Record<string, Price> } | undefined;
let openrouterLoading: Promise<void> | undefined;

export function estimateCost(provider: DBAssistantProvider, model: string, calls: AssistantUsageTotals[], webSearches = 0): number | null {
  if (!priceOf(provider, model, 0)) return null;
  let cost = webSearches * searchPrice(provider, model) * 1_000_000;
  for (const usage of calls) {
    const price = priceOf(provider, model, usage.promptTokens);
    if (!price) return null;
    const [input, cached, output, cacheWrite] = price;
    const written = cacheWrite ?? (provider === 'anthropic' ? input * ANTHROPIC_CACHE_WRITE : input);
    const uncached = Math.max(0, usage.promptTokens - usage.cachedTokens - usage.cacheWriteTokens);
    cost += uncached * input + usage.cachedTokens * (cached ?? input) + usage.cacheWriteTokens * written + usage.completionTokens * output;
  }
  return Math.round(cost) / 1_000_000;
}

export function warmPrices(provider: DBAssistantProvider): void {
  if (provider !== 'openrouter' || openrouterLoading || (openrouterPrices && Date.now() - openrouterPrices.at < OPENROUTER_TTL_MS)) return;
  openrouterLoading = fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(10_000) })
    .then(async (response) => {
      if (!response.ok) return;
      const data = (await response.json()) as {
        data?: { id: string; pricing?: { prompt?: string; completion?: string; input_cache_read?: string; input_cache_write?: string } }[];
      };
      const prices: Record<string, Price> = {};
      for (const entry of data.data ?? []) {
        const input = Number(entry.pricing?.prompt);
        const output = Number(entry.pricing?.completion);
        if (!Number.isFinite(input) || !Number.isFinite(output)) continue;
        const cached = perMillion(entry.pricing?.input_cache_read);
        const cacheWrite = perMillion(entry.pricing?.input_cache_write);
        prices[entry.id] = [input * 1_000_000, cached ?? null, output * 1_000_000, ...(cacheWrite === undefined ? [] : [cacheWrite])] as Price;
      }
      openrouterPrices = { at: Date.now(), prices };
    })
    .catch(() => undefined)
    .finally(() => (openrouterLoading = undefined));
}

function priceOf(provider: DBAssistantProvider, model: string, promptTokens: number): Price | undefined {
  if (provider === 'openrouter') return openrouterPrices?.prices[model];
  const raised = longestPrefix(RAISED[provider], model);
  const price = raised && Date.now() >= raised.from ? raised.price : longestPrefix(PRICES[provider], model);
  const long = longestPrefix(LONG_PROMPT[provider], model);
  return long && price && promptTokens > long.above ? long.price : price;
}

function searchPrice(provider: DBAssistantProvider, model: string): number {
  if (provider === 'anthropic' || provider === 'openai') return 0.01;
  // the free monthly allowance is not known here, every search counts
  if (provider === 'gemini') return model.startsWith('gemini-2.') ? 0.035 : 0.014;
  return 0;
}

function perMillion(value: string | undefined): number | undefined {
  const price = Number(value);
  return value && Number.isFinite(price) ? price * 1_000_000 : undefined;
}

function longestPrefix<T>(table: Record<string, T> | undefined, model: string): T | undefined {
  if (!table) return undefined;
  let best: string | undefined;
  for (const name of Object.keys(table)) {
    if (model.startsWith(name) && samePricing(model.slice(name.length)) && (!best || name.length > best.length)) best = name;
  }
  return best ? table[best] : undefined;
}

function samePricing(suffix: string): boolean {
  if (/^-(?:pro|mini|nano|lite|fast)\b/i.test(suffix)) return false;
  return suffix === '' || /^-\d{8}$/.test(suffix) || /^-\d{4}-\d{2}-\d{2}$/.test(suffix) || /^-[a-z]/i.test(suffix);
}
