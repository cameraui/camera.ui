import type { DBAssistantReasoning } from '../api/database/types.js';
import type { AssistantSettings } from './types.js';

type Level = Exclude<DBAssistantReasoning, 'default'>;

const ANTHROPIC_BUDGET: Record<Level, number> = { off: 0, low: 2048, high: 12_000 };
const GEMINI_BUDGET: Record<Level, number> = { off: 0, low: 1024, high: 8192 };
// the claude 4.0, 4.1 and 4.5 generation and everything before it only knows a thinking budget, newer ones think adaptively
const ANTHROPIC_BUDGET_ONLY = /^claude-(?:opus-4(?:-[015])?|sonnet-4(?:-5)?|haiku-4-5)(?:-\d{8})?$|^claude-3-/;
// families that accept the ollama think flag, everything else keeps its default
const OLLAMA_THINKERS = /qwen3|deepseek-r1|gpt-oss|magistral|qwq|cogito|smollm3|glm|nemotron|phi4-reasoning|granite3\.[3-9]|granite4/i;

export function modelOptionsFor(settings: Pick<AssistantSettings, 'provider' | 'model' | 'reasoning'>): Record<string, unknown> | undefined {
  const level = settings.reasoning;
  if (level === 'default') return undefined;
  const model = settings.model.trim();

  switch (settings.provider) {
    case 'anthropic':
      return anthropic(model, level);
    case 'openai':
      return openai(model, level);
    case 'gemini':
      return gemini(model, level);
    case 'ollama':
      return ollama(model, level);
    case 'openrouter':
      return level === 'off' ? { reasoning: { enabled: false } } : { reasoning: { effort: level } };
    case 'openai-compatible':
      return level === 'off' ? undefined : { reasoning_effort: level };
  }
}

function anthropic(model: string, level: Level): Record<string, unknown> {
  if (level === 'off') return { thinking: { type: 'disabled' } };
  if (ANTHROPIC_BUDGET_ONLY.test(model)) return { thinking: { type: 'enabled', budget_tokens: ANTHROPIC_BUDGET[level] } };
  return { thinking: { type: 'adaptive', display: 'summarized' }, effort: level };
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
  // the o-series and the gpt-5 family reason, the chat variants and everything older reject the parameter
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

function ollama(model: string, level: Level): Record<string, unknown> | undefined {
  if (level === 'off') return OLLAMA_THINKERS.test(model) ? { think: false } : undefined;
  return { think: /gpt-oss/i.test(model) ? level : true };
}
