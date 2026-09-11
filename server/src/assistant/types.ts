import type { AssistantToolReference, AssistantToolSpec } from '@camera.ui/sdk';
import type { Interrupt, JSONSchema, UIMessage } from '@tanstack/ai';
import type { DBAssistant, DBAssistantAttachment, DBAssistantModel, DBAssistantProvider, DBAssistantUsageMonth, DBRoles } from '../api/database/types.js';

export const ASSISTANT_PROVIDERS: DBAssistantProvider[] = ['ollama', 'openai-compatible', 'openai', 'anthropic', 'gemini', 'openrouter'];

export interface AssistantRunContext {
  userId: string;
  role: DBRoles;
  language: string;
  timezone: string;
  sendImages: boolean;
  authorization?: string;
  uploads?: AssistantUpload[];
  instructions?: string;
  answers?: Map<string, string>;
  threadId?: string;
  calledTools?: string[];
  visionMissing?: string;
  visionNoticed?: boolean;
}

export interface AssistantPost {
  userId: string;
  threadId: string;
  title?: string;
  text: string;
  label?: string;
  image?: { data: string; mimeType: string };
  references?: AssistantToolReference[];
}

export type AssistantUploadKind = 'image' | 'audio' | 'video';

export interface AssistantUpload {
  id: string;
  key: string;
  kind: AssistantUploadKind;
  mimeType: string;
  size: number;
  data: Buffer;
  messageIndex: number;
  tooLarge: boolean;
}

export interface AssistantRunStats {
  startedAt: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  iterations: number;
  toolCalls: number;
}

export interface AssistantUsageEvent extends Omit<AssistantRunStats, 'startedAt'> {
  durationMs: number;
  provider: DBAssistantProvider;
  model: string;
  costUsd: number | null;
}

export type AssistantState = 'disabled' | 'unconfigured' | 'ready';

export interface AssistantAskRequest {
  pluginId: string;
  prompt: string;
  system?: string;
  images?: { data: Uint8Array; mimeType: string }[];
  outputSchema?: JSONSchema;
  timeoutMs?: number;
}

export type AssistantAskResult =
  | { ok: true; text: string; json?: unknown; usage: { promptTokens: number; completionTokens: number } }
  | { ok: false; reason: 'not_allowed' | 'unconfigured' | 'timeout' | 'error'; message: string };

export interface AssistantAccess {
  allowed: boolean;
  model: string | null;
  vision: boolean | null;
  language: string | null;
}

export interface AssistantStatus {
  state: AssistantState;
  provider: DBAssistantProvider;
  model: string;
  toolCount: number;
  pluginToolCount: number;
}

export interface AssistantUsageRow extends DBAssistantUsageMonth {
  username?: string;
  pluginName?: string;
}

export interface AssistantMcpServerView {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  insecure: boolean;
  tokenSet: boolean;
}

export type AssistantModelView = Omit<DBAssistantModel, 'apiKey'> & { apiKeySet: boolean };

export type AssistantMaskedSettings = Omit<DBAssistant, 'mcpServers' | 'models'> & { mcpServers: AssistantMcpServerView[]; models: AssistantModelView[] };

export type AssistantSettings = DBAssistant & Pick<DBAssistantModel, 'provider' | 'baseURL' | 'apiKey' | 'model' | 'sendImages'>;

export type AssistantExternalState = 'connecting' | 'connected' | 'error' | 'disabled';

export interface AssistantExternalStatus {
  id: string;
  name: string;
  state: AssistantExternalState;
  toolCount: number;
  error?: string;
}

export interface AssistantInfo {
  settings: AssistantMaskedSettings;
  status: AssistantStatus;
  plugins: { id: string; name: string }[];
  tools: AssistantToolInfo[];
  external: AssistantExternalStatus[];
}

export interface AssistantToolInfo {
  name: string;
  description: string;
  source: { kind: 'core' } | { kind: 'plugin'; pluginId: string; pluginName: string } | { kind: 'external'; serverId: string; serverName: string };
  group: string;
  approval: boolean;
  adminOnly: boolean;
  inputSchema?: JSONSchema;
}

export interface AssistantTestResult {
  ok: boolean;
  toolCalling: boolean;
  vision: boolean | null;
  latencyMs: number;
  model: string;
  error?: string;
}

export interface AssistantModelsResult {
  models: string[];
  error?: string;
}

export interface AssistantThreadSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  runId?: string;
}

export interface AssistantPluginTools {
  pluginId: string;
  pluginName: string;
  specs: AssistantToolSpec[];
}

export type AssistantSettingKey = 'terminalEnabled' | 'memoryEnabled' | 'sendImages';

export interface AssistantSearchFilters {
  contentKind: 'all' | 'events' | 'episodes';
  favoritesOnly: boolean;
  cameraIds: string[];
  rooms: string[];
  timeRange: '1h' | '1d' | '1w' | '1m' | null;
  eventTypes: string[];
  hasAttributes: string[];
  sensorEvents: string[];
  audioLabels: string[];
  search: string;
  semanticQuery: string;
}

export interface AssistantSearchResult {
  filters: AssistantSearchFilters;
  note: string;
}

export interface AssistantHydration {
  messages: UIMessage[];
  attachments: Record<string, DBAssistantAttachment>;
  activeRun: { runId: string } | null;
  interrupts: { runId: string; pending: Interrupt[] } | null;
}
