import { createAnthropicChat } from '@tanstack/ai-anthropic';
import { createGeminiChat } from '@tanstack/ai-gemini';
import { createOllamaChat } from '@tanstack/ai-ollama';
import { createOpenaiChat } from '@tanstack/ai-openai';
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible';
import { createOpenRouterText } from '@tanstack/ai-openrouter';

import type { DBAssistantModel, DBAssistantProvider } from '../api/database/types.js';

export type AssistantAdapter = ReturnType<typeof createOllamaChat>;

const DEFAULT_BASE_URLS: Record<DBAssistantProvider, string | null> = {
  ollama: 'http://127.0.0.1:11434',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
  openai: null,
  anthropic: null,
  gemini: null,
  openrouter: null,
};

const MODELS_TIMEOUT_MS = 10_000;

export function defaultBaseURL(provider: DBAssistantProvider): string | null {
  return DEFAULT_BASE_URLS[provider];
}

export function providerNeedsKey(provider: DBAssistantProvider): boolean {
  return provider === 'openai' || provider === 'anthropic' || provider === 'gemini' || provider === 'openrouter';
}

export function createAdapter(settings: Pick<DBAssistantModel, 'provider' | 'baseURL' | 'model'>, apiKey: string | null): AssistantAdapter {
  const baseURL = nonEmpty(settings.baseURL) ?? DEFAULT_BASE_URLS[settings.provider] ?? undefined;
  const key = apiKey ?? '';

  switch (settings.provider) {
    case 'ollama':
      return createOllamaChat(settings.model, { baseURL });
    case 'openai-compatible':
      return openaiCompatibleText(settings.model, { baseURL: baseURL!, apiKey: key || 'none', api: 'chat-completions' }) as unknown as AssistantAdapter;
    case 'openai':
      return createOpenaiChat(settings.model as never, key, baseURL ? { baseURL } : undefined) as unknown as AssistantAdapter;
    case 'anthropic':
      return createAnthropicChat(settings.model as never, key, baseURL ? { baseURL } : undefined) as unknown as AssistantAdapter;
    case 'gemini':
      return createGeminiChat(settings.model as never, key, baseURL ? { baseURL } : undefined) as unknown as AssistantAdapter;
    case 'openrouter':
      return createOpenRouterText(settings.model as never, key) as unknown as AssistantAdapter;
  }
}

export async function listModels(settings: Pick<DBAssistantModel, 'provider' | 'baseURL'>, apiKey: string | null): Promise<string[]> {
  const baseURL = (nonEmpty(settings.baseURL) ?? DEFAULT_BASE_URLS[settings.provider] ?? '').replace(/\/+$/, '');

  switch (settings.provider) {
    case 'ollama': {
      const data = await fetchJson<{ models?: { name: string }[] }>(`${baseURL}/api/tags`);
      return (data.models ?? []).map((m) => m.name);
    }
    case 'openai-compatible': {
      const data = await fetchJson<{ data?: { id: string }[] }>(`${baseURL}/models`, apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
      return (data.data ?? []).map((m) => m.id);
    }
    case 'openai': {
      const data = await fetchJson<{ data?: { id: string }[] }>(`${baseURL || 'https://api.openai.com/v1'}/models`, { Authorization: `Bearer ${apiKey ?? ''}` });
      return (data.data ?? []).map((m) => m.id).filter((id) => /^(gpt|o\d|chatgpt)/.test(id));
    }
    case 'anthropic': {
      const data = await fetchJson<{ data?: { id: string }[] }>(`${baseURL || 'https://api.anthropic.com'}/v1/models?limit=100`, {
        'x-api-key': apiKey ?? '',
        'anthropic-version': '2023-06-01',
      });
      return (data.data ?? []).map((m) => m.id);
    }
    case 'gemini': {
      const data = await fetchJson<{ models?: { name: string; supportedGenerationMethods?: string[] }[] }>(
        `${baseURL || 'https://generativelanguage.googleapis.com'}/v1beta/models?pageSize=200&key=${encodeURIComponent(apiKey ?? '')}`,
      );
      return (data.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    }
    case 'openrouter': {
      const data = await fetchJson<{ data?: { id: string }[] }>('https://openrouter.ai/api/v1/models', apiKey ? { Authorization: `Bearer ${apiKey}` } : {});
      return (data.data ?? []).map((m) => m.id);
    }
  }
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(MODELS_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}
