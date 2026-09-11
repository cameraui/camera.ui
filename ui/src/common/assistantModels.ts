import type { AssistantMaskedSettings, AssistantModelInput, AssistantModelView, DBAssistantProvider } from '@shared/types';

export interface AssistantCapabilityTag {
  key: 'tools' | 'no_tools' | 'vision' | 'no_vision' | 'untested' | 'failed';
  severity: 'success' | 'warn' | 'danger' | 'secondary';
}

export const ASSISTANT_PROVIDERS: { label: string; value: DBAssistantProvider }[] = [
  { label: 'Ollama (local)', value: 'ollama' },
  { label: 'OpenAI-compatible server (LM Studio, vLLM, LiteLLM, …)', value: 'openai-compatible' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google Gemini', value: 'gemini' },
  { label: 'OpenRouter', value: 'openrouter' },
];

export const ASSISTANT_DEFAULT_BASE_URLS: Record<DBAssistantProvider, string> = {
  ollama: 'http://127.0.0.1:11434',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  gemini: 'https://generativelanguage.googleapis.com',
  openrouter: 'https://openrouter.ai/api/v1',
};

export const ASSISTANT_KEY_PROVIDERS: DBAssistantProvider[] = ['openai', 'anthropic', 'gemini', 'openrouter'];

export function capabilityTags(entry: Pick<AssistantModelView, 'capabilities'>): AssistantCapabilityTag[] {
  const capabilities = entry.capabilities;
  if (!capabilities) return [{ key: 'untested', severity: 'secondary' }];
  if (capabilities.error) return [{ key: 'failed', severity: 'danger' }];
  const tags: AssistantCapabilityTag[] = [capabilities.toolCalling ? { key: 'tools', severity: 'success' } : { key: 'no_tools', severity: 'warn' }];
  if (capabilities.vision !== null) tags.push(capabilities.vision ? { key: 'vision', severity: 'success' } : { key: 'no_vision', severity: 'warn' });
  return tags;
}

export function defaultModel(settings: Pick<AssistantMaskedSettings, 'models' | 'defaultModelId'>): AssistantModelView | undefined {
  return settings.models.find((entry) => entry._id === settings.defaultModelId) ?? settings.models[0];
}

export function modelInput(entry: AssistantModelView): AssistantModelInput {
  return {
    id: entry._id,
    name: entry.name,
    provider: entry.provider,
    baseURL: entry.baseURL,
    model: entry.model,
    sendImages: entry.sendImages,
    userAccess: entry.userAccess,
  };
}
