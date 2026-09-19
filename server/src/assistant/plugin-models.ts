import { createRPCClient } from '@camera.ui/rpc';
import { EventType } from '@tanstack/ai';
import { BaseTextAdapter } from '@tanstack/ai/adapters';
import { container } from 'tsyringe';

import { NamespaceManager } from '../rpc/namespaces.js';

import type { RPCClient } from '@camera.ui/rpc';
import type {
  AssistantModelChunk,
  AssistantModelContent,
  AssistantModelMessage,
  AssistantModelProvider,
  AssistantModelRequest,
  AssistantModelSpec,
  AssistantModelStatus,
  AssistantModelToolCall,
} from '@camera.ui/sdk';
import type { AdapterYieldChunk, ModelMessage, TextOptions } from '@tanstack/ai';
import type { StructuredOutputOptions, StructuredOutputResult } from '@tanstack/ai/adapters';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LoggerService } from '../services/logger/index.js';

const MODEL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;
const CLIENT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS + 30_000;
const PROVIDER_PREFIX = 'plugin:';

export function pluginProviderName(pluginName: string): string {
  return `${PROVIDER_PREFIX}${pluginName}`;
}

export function pluginOfProvider(provider: string): string | undefined {
  return provider.startsWith(PROVIDER_PREFIX) ? provider.slice(PROVIDER_PREFIX.length) : undefined;
}

export function validateModelSpec(spec: unknown): spec is AssistantModelSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (typeof s.id !== 'string' || !MODEL_ID.test(s.id)) return false;
  if (typeof s.name !== 'string' || !s.name.trim()) return false;
  return typeof s.contextTokens === 'number' && s.contextTokens >= 1000;
}

export class PluginModelClient {
  private client?: RPCClient;
  private logger: LoggerService;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
  }

  public async fetchSpecs(plugin: Plugin): Promise<AssistantModelSpec[]> {
    const proxy = plugin.worker.pluginProxy as Partial<AssistantModelProvider>;
    const specs = await proxy.assistantModels?.();
    if (!Array.isArray(specs)) return [];

    const seen = new Set<string>();
    const valid: AssistantModelSpec[] = [];
    for (const spec of specs) {
      if (!validateModelSpec(spec)) {
        this.logger.warn(`Plugin ${plugin.displayName} declared an invalid assistant model, skipping: ${JSON.stringify(spec).slice(0, 200)}`);
        continue;
      }
      if (seen.has(spec.id)) {
        this.logger.warn(`Plugin ${plugin.displayName} declared the assistant model "${spec.id}" twice, keeping the first`);
        continue;
      }
      seen.add(spec.id);
      valid.push({ ...spec, vision: spec.vision === true, toolCalling: spec.toolCalling === true, structuredOutput: spec.structuredOutput === true });
    }
    return valid;
  }

  public async fetchStatus(plugin: Plugin): Promise<AssistantModelStatus | undefined> {
    const proxy = plugin.worker.pluginProxy as Partial<AssistantModelProvider>;
    // the method is optional, a plugin without it answers with an rpc error
    const status = await Promise.resolve(proxy.assistantModelStatus?.()).catch(() => undefined);
    if (!status || typeof status.ready !== 'boolean') return undefined;
    const progress = typeof status.progress === 'number' ? Math.min(Math.max(status.progress, 0), 1) : undefined;
    return { ready: status.ready, ...(status.message ? { message: String(status.message).slice(0, 200) } : {}), ...(progress !== undefined ? { progress } : {}) };
  }

  public adapter(pluginId: string, pluginName: string, spec: AssistantModelSpec, language: string): PluginTextAdapter {
    return new PluginTextAdapter(this, pluginId, pluginName, spec, language);
  }

  public async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.disconnect().catch(() => {});
  }

  public async *generate(pluginId: string, request: AssistantModelRequest, language: string, timeoutMs: number): AsyncGenerator<AssistantModelChunk> {
    const client = await this.ensureClient();
    const namespace = NamespaceManager.pluginNamespaces(pluginId).pluginChildRpc;
    const proxy = client.createProxy<AssistantModelProvider>(namespace);
    for await (const chunk of proxy.assistantGenerate(request, { language, timeoutMs })) {
      yield chunk;
    }
  }

  private async ensureClient(): Promise<RPCClient> {
    if (this.client) return this.client;

    const proxyServer = container.resolve<ProxyServer>('proxy');
    const client = createRPCClient({
      name: 'camera.ui-assistant-models',
      servers: proxyServer.server.endpoints.filter((endpoint) => endpoint.startsWith('nats://')),
      auth: { user: proxyServer.auth.server.user, password: proxyServer.auth.server.password },
      timeout: CLIENT_TIMEOUT_MS,
    });
    await client.connect();
    this.client = client;
    return client;
  }
}

export class PluginTextAdapter extends BaseTextAdapter<string, Record<string, never>, readonly ['text', 'image'], never> {
  public readonly name = 'plugin';

  constructor(
    private readonly models: PluginModelClient,
    private readonly pluginId: string,
    private readonly pluginName: string,
    private readonly spec: AssistantModelSpec,
    private readonly language: string,
  ) {
    super(undefined, spec.id);
  }

  public async *chatStream(options: TextOptions<Record<string, never>>): AsyncIterable<AdapterYieldChunk> {
    const runId = options.runId ?? `run-${Date.now()}`;
    const threadId = options.threadId ?? `thread-${Date.now()}`;
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const model = this.spec.id;
    const base = { model, timestamp: Date.now() };

    yield { type: EventType.RUN_STARTED, runId, threadId, ...base, parentRunId: options.parentRunId };

    let textOpen = false;
    let toolCalls = 0;
    let finish: 'stop' | 'tool_calls' | 'length' = 'stop';
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    try {
      for await (const chunk of this.models.generate(this.pluginId, this.request(options), this.language, DEFAULT_TIMEOUT_MS)) {
        if (chunk.type === 'text') {
          if (!chunk.delta) continue;
          if (!textOpen) {
            textOpen = true;
            yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', ...base };
          }
          yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: chunk.delta, ...base };
        } else if (chunk.type === 'tool_call') {
          toolCalls += 1;
          yield* this.toolCall(chunk.call, messageId, base);
        } else if (chunk.type === 'usage') {
          usage = { promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens, totalTokens: chunk.promptTokens + chunk.completionTokens };
        } else if (chunk.type === 'done') {
          if (chunk.finish === 'error') throw new Error(chunk.message ?? `${this.pluginName} could not answer`);
          finish = chunk.finish === 'length' ? 'length' : toolCalls > 0 ? 'tool_calls' : 'stop';
        }
      }
    } catch (error: any) {
      if (textOpen) yield { type: EventType.TEXT_MESSAGE_END, messageId, ...base };
      const message = error?.message ?? String(error);
      yield { type: EventType.RUN_ERROR, ...base, message, error: { message } };
      return;
    }

    if (textOpen) yield { type: EventType.TEXT_MESSAGE_END, messageId, ...base };
    yield { type: EventType.RUN_FINISHED, runId, threadId, ...base, finishReason: finish, ...(usage ? { usage } : {}) };
  }

  public async structuredOutput(options: StructuredOutputOptions<Record<string, never>>): Promise<StructuredOutputResult<unknown>> {
    const request = { ...this.request(options.chatOptions), outputSchema: options.outputSchema as Record<string, unknown> };
    let text = '';
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;

    for await (const chunk of this.models.generate(this.pluginId, request, this.language, DEFAULT_TIMEOUT_MS)) {
      if (chunk.type === 'text') text += chunk.delta;
      else if (chunk.type === 'usage')
        usage = { promptTokens: chunk.promptTokens, completionTokens: chunk.completionTokens, totalTokens: chunk.promptTokens + chunk.completionTokens };
      else if (chunk.type === 'done' && chunk.finish === 'error') throw new Error(chunk.message ?? `${this.pluginName} could not answer`);
    }

    // a model without native schema support answers in prose around the json
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    return { data: JSON.parse(json || text), ...(usage ? { usage } : {}) } as StructuredOutputResult<unknown>;
  }

  private request(options: TextOptions<Record<string, never>>): AssistantModelRequest {
    return {
      modelId: this.spec.id,
      system: (options.systemPrompts ?? []).map((prompt) => (typeof prompt === 'string' ? prompt : prompt.content)),
      messages: options.messages.map((message) => this.message(message)),
      tools: (options.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: (tool.inputSchema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
      })),
    };
  }

  private message(message: ModelMessage): AssistantModelMessage {
    const content: AssistantModelContent[] = [];
    if (typeof message.content === 'string') {
      if (message.content) content.push({ type: 'text', text: message.content });
    } else {
      for (const part of message.content ?? []) {
        if (part.type === 'text') content.push({ type: 'text', text: part.content });
        else if (part.type === 'image' && this.spec.vision && part.source.type === 'data') {
          content.push({ type: 'image', data: part.source.value, mimeType: (part.source.mimeType ?? 'image/jpeg') as 'image/jpeg' });
        }
      }
    }

    const toolCalls = (message.role === 'assistant' ? (message.toolCalls ?? []) : []).map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: parseArguments(call.function.arguments),
    }));

    return {
      role: message.role,
      content,
      ...(toolCalls.length ? { toolCalls } : {}),
      ...(message.role === 'tool' && message.toolCallId ? { toolCallId: message.toolCallId } : {}),
    };
  }

  private *toolCall(call: AssistantModelToolCall, messageId: string, base: { model: string; timestamp: number }): Generator<AdapterYieldChunk> {
    const args = JSON.stringify(call.arguments ?? {});
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: call.id,
      toolCallName: call.name,
      toolName: call.name,
      parentMessageId: messageId,
      ...base,
    };
    yield { type: EventType.TOOL_CALL_ARGS, toolCallId: call.id, delta: args, args, ...base };
    yield { type: EventType.TOOL_CALL_END, toolCallId: call.id, toolCallName: call.name, toolName: call.name, input: call.arguments ?? {}, ...base };
  }
}

function parseArguments(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object') return args as Record<string, unknown>;
  if (typeof args !== 'string') return {};
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
