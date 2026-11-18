import type { FetchWrapper } from '@tanstack/ai';
import type { DBAssistantReasoning } from '../api/database/types.js';
import type { AssistantSettings } from './types.js';

type Level = Exclude<DBAssistantReasoning, 'default'>;
type AnthropicThinking = { type: 'disabled' } | { type: 'enabled'; budget_tokens: number } | { type: 'adaptive'; display: 'summarized' };

export interface ReasoningOptions {
  reasoning?: Level;
  modelOptions?: Record<string, unknown>;
  wrapFetch?: FetchWrapper;
}

const ANTHROPIC_BUDGET: Record<Level, number> = { off: 0, low: 2048, high: 12_000 };
const GEMINI_BUDGET: Record<Level, number> = { off: 0, low: 1024, high: 8192 };
// these claude models only know a thinking budget, newer ones think adaptively
const ANTHROPIC_BUDGET_ONLY = /^claude-(?:opus-4(?:-[015])?|sonnet-4(?:-5)?|haiku-4-5)(?:-\d{8})?$|^claude-3-/;
const INTERLEAVED_THINKING_BETA = 'interleaved-thinking-2025-05-14';
// for a model without a declared window
const ASSUMED_HEADROOM_TOKENS = 16_384;
// ollama reserves memory for the whole window up front
const OLLAMA_DEFAULT_WINDOW = 32_768;
const OLLAMA_THINKERS = /qwen3|deepseek-r1|gpt-oss|magistral|qwq|cogito|smollm3|glm|nemotron|phi4-reasoning|granite3\.[3-9]|granite4/i;

export function reasoningFor(settings: Pick<AssistantSettings, 'provider' | 'model' | 'reasoning' | 'contextTokens'>): ReasoningOptions {
  const level = settings.reasoning;
  const model = settings.model.trim();

  if (settings.provider === 'ollama') {
    const { modelOptions } = contextFor(settings);
    if (level === 'default' || (level === 'off' && !OLLAMA_THINKERS.test(model))) return { modelOptions };
    return { reasoning: level, modelOptions };
  }

  if (level === 'default') return {};

  switch (settings.provider) {
    case 'anthropic':
      return { reasoning: level, wrapFetch: anthropicFallback(model, level) };
    case 'openai':
      return { reasoning: level, modelOptions: openai(model, level) };
    case 'gemini':
      return { reasoning: level, modelOptions: gemini(model, level) };
    case 'openrouter':
      return { reasoning: level, modelOptions: level === 'off' ? { reasoning: { enabled: false } } : { reasoning: { effort: level } } };
    case 'openai-compatible':
      return level === 'off' ? {} : { modelOptions: { reasoning_effort: level } };
    default:
      return {};
  }
}

export function contextFor(settings: Pick<AssistantSettings, 'provider' | 'contextTokens'>): { modelOptions?: Record<string, unknown> } {
  if (settings.provider !== 'ollama') return {};
  // ollama loads the model again whenever num_ctx changes, every call of one model asks for the same window
  return { modelOptions: { options: { num_ctx: settings.contextTokens } } };
}

export function defaultWindow(provider: string, contextBudget: number): number {
  const window = contextBudget + ASSUMED_HEADROOM_TOKENS;
  return provider === 'ollama' ? Math.min(window, OLLAMA_DEFAULT_WINDOW) : window;
}

function anthropicFallback(model: string, level: Level): FetchWrapper {
  const thinking = anthropicThinking(model, level);
  return (next) => async (input, init) => {
    const body = jsonBody(init?.body);
    if (!body || !Array.isArray(body.messages) || 'thinking' in body || forcesOutput(body)) return next(input, init);

    const patched: Record<string, unknown> = { ...body, thinking };
    let headers = init?.headers;
    if (thinking.type === 'adaptive') patched.output_config = { ...(body.output_config as object | undefined), effort: level };
    if (thinking.type === 'enabled') {
      patched.max_tokens = Math.max(Number(body.max_tokens) || 0, thinking.budget_tokens + 1);
      headers = withBeta(headers, INTERLEAVED_THINKING_BETA);
    }
    return next(input, { ...init, headers, body: JSON.stringify(patched) });
  };
}

function anthropicThinking(model: string, level: Level): AnthropicThinking {
  if (level === 'off') return { type: 'disabled' };
  if (ANTHROPIC_BUDGET_ONLY.test(model)) return { type: 'enabled', budget_tokens: ANTHROPIC_BUDGET[level] };
  return { type: 'adaptive', display: 'summarized' };
}

function forcesOutput(body: Record<string, unknown>): boolean {
  const choice = (body.tool_choice as { type?: string } | undefined)?.type;
  return choice === 'tool' || choice === 'any' || (body.output_config as { format?: unknown } | undefined)?.format !== undefined;
}

function jsonBody(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function withBeta(headers: HeadersInit | undefined, beta: string): Headers {
  const result = new Headers(headers);
  const current = result.get('anthropic-beta');
  const betas = current ? current.split(',').map((entry) => entry.trim()) : [];
  if (!betas.includes(beta)) result.set('anthropic-beta', [...betas, beta].join(','));
  return result;
}

function openai(model: string, level: Level): Record<string, unknown> | undefined {
  if (!openaiReasons(model)) return undefined;
  if (level !== 'off') return { reasoning: { effort: level, summary: 'auto' } };
  // 'none' exists from gpt-5.1 on, gpt-5 knows 'minimal', the o-series cannot go lower than 'low'
  if (/^gpt-5\.[1-9]/.test(model)) return { reasoning: { effort: 'none' } };
  if (model.startsWith('gpt-5')) return { reasoning: { effort: 'minimal' } };
  return { reasoning: { effort: 'low' } };
}

function openaiReasons(model: string): boolean {
  // the o-series and gpt-5 reason, chat variants and older models reject the parameter
  if (/^o\d/.test(model)) return true;
  return model.startsWith('gpt-5') && !model.endsWith('-chat-latest');
}

function gemini(model: string, level: Level): Record<string, unknown> | undefined {
  if (/gemini-(3|[4-9])/.test(model)) {
    const flash = model.includes('flash');
    const thinkingLevel = level === 'off' ? (flash ? 'MINIMAL' : 'LOW') : level.toUpperCase();
    return { thinkingConfig: { includeThoughts: level !== 'off', thinkingLevel } };
  }
  if (model.includes('gemini-2.5')) {
    // 2.5 pro cannot switch thinking off, 128 is its floor
    const budget = level === 'off' && model.includes('pro') ? 128 : GEMINI_BUDGET[level];
    return { thinkingConfig: { includeThoughts: level !== 'off', thinkingBudget: budget } };
  }
  return undefined;
}
