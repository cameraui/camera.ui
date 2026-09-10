import { PromiseTimeout } from '@camera.ui/common/utils';
import { createRPCClient } from '@camera.ui/rpc';
import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';

import { NamespaceManager } from '../rpc/namespaces.js';
import { emitReferences, withImages } from './tools/shared.js';

import type { RPCClient } from '@camera.ui/rpc';
import type { AssistantToolProvider, AssistantToolResult, AssistantToolSpec } from '@camera.ui/sdk';
import type { JSONSchema } from '@tanstack/ai';
import type { Plugin } from '../plugins/plugin.js';
import type { ProxyServer } from '../rpc/index.js';
import type { LoggerService } from '../services/logger/index.js';
import type { CoreTool, ToolContext } from './tools/shared.js';

const TOOL_NAME = /^[a-z][a-z0-9_]{1,63}$/;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const CLIENT_TIMEOUT_MS = MAX_TIMEOUT_MS + 5_000;

export function pluginToolName(pluginName: string, name: string): string {
  const bare = pluginName
    .replace(/^@[^/]+\//, '')
    .replace(/^camera-ui-/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  return `${bare || 'plugin'}__${name}`;
}

export function validateToolSpec(spec: unknown): spec is AssistantToolSpec {
  if (!spec || typeof spec !== 'object') return false;
  const s = spec as Record<string, unknown>;
  if (typeof s.name !== 'string' || !TOOL_NAME.test(s.name)) return false;
  if (typeof s.description !== 'string' || !s.description.trim()) return false;
  const schema = s.inputSchema as Record<string, unknown> | undefined;
  if (schema?.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') return false;
  return true;
}

export class PluginToolClient {
  private client?: RPCClient;
  private logger: LoggerService;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
  }

  public async fetchSpecs(plugin: Plugin): Promise<AssistantToolSpec[]> {
    const proxy = plugin.worker.pluginProxy as Partial<AssistantToolProvider>;
    const specs = await proxy.assistantTools?.();
    if (!Array.isArray(specs)) return [];

    const seen = new Set<string>();
    const valid: AssistantToolSpec[] = [];
    for (const spec of specs) {
      if (!validateToolSpec(spec)) {
        this.logger.warn(`Plugin ${plugin.displayName} declared an invalid assistant tool, skipping: ${JSON.stringify(spec).slice(0, 200)}`);
        continue;
      }
      if (seen.has(spec.name)) {
        this.logger.warn(`Plugin ${plugin.displayName} declared the assistant tool "${spec.name}" twice, keeping the first`);
        continue;
      }
      seen.add(spec.name);
      valid.push(spec);
    }
    return valid;
  }

  public wrap(plugin: Plugin, spec: AssistantToolSpec): CoreTool {
    const timeoutMs = Math.min(Math.max(spec.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), MAX_TIMEOUT_MS);
    const pluginId = plugin.id;
    const pluginName = plugin.displayName;

    const config = {
      name: pluginToolName(plugin.pluginName, spec.name),
      description: `[${pluginName}] ${spec.description}`,
      inputSchema: spec.inputSchema as unknown as JSONSchema,
      lazy: spec.lazy ?? false,
      metadata: { adminOnly: spec.adminOnly ?? false, pluginId, pluginName, approval: spec.approval ?? false },
    };

    const execute = async (input: unknown, ctx: ToolContext) => {
      const started = Date.now();
      const result = await PromiseTimeout(
        this.call(pluginId, spec.name, input, ctx),
        timeoutMs,
        undefined,
        `Tool ${spec.name} of ${pluginName} timed out after ${timeoutMs / 1000}s`,
      );
      this.logger.debug(`Assistant tool ${config.name} answered in ${Date.now() - started}ms`);
      return this.toModelResult(result, ctx);
    };

    return spec.approval
      ? toolDefinition({ ...config, needsApproval: true }).server<ToolContext['context']>(execute)
      : toolDefinition(config).server<ToolContext['context']>(execute);
  }

  public async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.disconnect().catch(() => {});
  }

  public async call(pluginId: string, name: string, input: unknown, ctx: ToolContext): Promise<AssistantToolResult> {
    const client = await this.ensureClient();
    const namespace = NamespaceManager.pluginNamespaces(pluginId).pluginChildRpc;
    const proxy = client.createProxy<AssistantToolProvider>(namespace);
    const { userId, role, language, timezone, threadId } = ctx.context;
    const result = await proxy.callAssistantTool(name, (input ?? {}) as Record<string, unknown>, { userId, role, language, timezone, ...(threadId ? { threadId } : {}) });
    return result ?? {};
  }

  private toModelResult(result: AssistantToolResult, ctx: ToolContext) {
    if (result.error) return { error: result.error };
    emitReferences(result.references, ctx);

    const text = typeof result.content === 'string' ? result.content : result.content === undefined ? '' : JSON.stringify(result.content);
    const images = (result.images ?? []).filter((img) => typeof img?.data === 'string' && img.data.length > 0);
    if (images.length === 0) return text || 'Done.';

    const captions = images.map((img, i) => img.caption ?? `Image ${i + 1}`).join(', ');
    return withImages(`${text}\nImages: ${captions}`.trim(), images, ctx);
  }

  private async ensureClient(): Promise<RPCClient> {
    if (this.client) return this.client;

    const proxyServer = container.resolve<ProxyServer>('proxy');
    const client = createRPCClient({
      name: 'camera.ui-assistant',
      servers: proxyServer.server.endpoints.filter((endpoint) => endpoint.startsWith('nats://')),
      auth: { user: proxyServer.auth.server.user, password: proxyServer.auth.server.password },
      timeout: CLIENT_TIMEOUT_MS,
    });
    await client.connect();
    this.client = client;
    return client;
  }
}
