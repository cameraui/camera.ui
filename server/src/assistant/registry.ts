import { hasInterface, PluginInterface } from '@camera.ui/sdk';
import { convertSchemaToJsonSchema } from '@tanstack/ai';
import { container } from 'tsyringe';

import { PluginsService } from '../api/services/plugins.service.js';
import { ApiCatalog } from './api-catalog.js';
import { DocsIndex } from './docs.js';
import { ExternalMcpSource } from './external.js';
import { PluginModelClient, pluginProviderName } from './plugin-models.js';
import { PluginToolClient } from './plugin-tools.js';
import { coreTools } from './tools/index.js';

import type { AssistantModelSpec, AssistantModelStatus, AssistantToolResult, AssistantToolSpec } from '@camera.ui/sdk';
import type { DBRoles } from '../api/database/types.js';
import type { InternalEventBus, InternalEventPayload } from '../internal-bus.js';
import type { Plugin } from '../plugins/plugin.js';
import type { LoggerService } from '../services/logger/index.js';
import type { ExternalServer } from './external.js';
import type { PluginTextAdapter } from './plugin-models.js';
import type { CoreTool, ToolContext } from './tools/shared.js';
import type { AssistantExternalStatus, AssistantToolInfo } from './types.js';

interface PluginEntry {
  pluginId: string;
  pluginName: string;
  specs: AssistantToolSpec[];
  tools: CoreTool[];
}

export interface PluginModelEntry {
  pluginId: string;
  pluginName: string;
  provider: string;
  models: AssistantModelSpec[];
  status?: AssistantModelStatus;
}

export class AssistantToolRegistry {
  private core: CoreTool[] = [];
  private plugins = new Map<string, PluginEntry>();
  private models = new Map<string, PluginModelEntry>();
  private external = new Map<string, ExternalMcpSource>();
  private client = new PluginToolClient();
  private modelClient = new PluginModelClient();
  private api = new ApiCatalog();
  private docs = new DocsIndex();
  private logger: LoggerService;
  private bus?: InternalEventBus;

  private onPluginStarted = (payload: InternalEventPayload) => this.handlePluginEvent(payload, 'started');
  private onPluginStopped = (payload: InternalEventPayload) => this.handlePluginEvent(payload, 'stopped');

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.core = coreTools(this, this.api, this.docs);
  }

  public get modelProviders(): PluginModelEntry[] {
    return Array.from(this.models.values()).filter((entry) => entry.models.length > 0 || entry.status?.ready === false);
  }

  public async refreshModels(): Promise<void> {
    const plugins = new PluginsService();
    await Promise.all(
      Array.from(this.models.keys()).map(async (pluginId) => {
        const plugin = plugins.getPluginById(pluginId);
        if (plugin?.worker.isRunning()) await this.registerModels(plugin);
        else this.models.delete(pluginId);
      }),
    );
  }

  public get pluginToolCount(): number {
    let count = 0;
    for (const entry of this.plugins.values()) count += entry.tools.length;
    return count;
  }

  public get externalToolCount(): number {
    let count = 0;
    for (const source of this.external.values()) count += source.tools.length;
    return count;
  }

  public get toolCount(): number {
    return this.core.length + this.pluginToolCount + this.externalToolCount;
  }

  public modelProvider(provider: string): PluginModelEntry | undefined {
    return this.modelProviders.find((entry) => entry.provider === provider);
  }

  public modelAdapter(entry: PluginModelEntry, spec: AssistantModelSpec, language: string, timeoutMs?: number): PluginTextAdapter {
    return this.modelClient.adapter(entry.pluginId, entry.pluginName, spec, language, timeoutMs);
  }

  public loadApi(document: unknown): void {
    if (!document) return;
    this.api.load(document);
    this.logger.debug(`Assistant: ${this.api.size} REST endpoints available to the api tools`);
  }

  public loadDocs(): void {
    this.docs.load();
    this.logger.debug(`Assistant: ${this.docs.size} documentation sections available to the docs tools`);
  }

  public async start(): Promise<void> {
    this.bus = container.resolve<InternalEventBus>('internalBus');
    this.bus.onEvent('plugin:started', this.onPluginStarted);
    this.bus.onEvent('plugin:stopped', this.onPluginStopped);
    this.bus.onEvent('plugin:error', this.onPluginStopped);
    this.bus.onEvent('plugin:crashed', this.onPluginStopped);

    const plugins = new PluginsService();
    await Promise.all(
      plugins
        .listPlugins()
        .filter((p) => p.worker.isRunning())
        .map((p) => this.registerPlugin(p)),
    );
  }

  public async stop(): Promise<void> {
    this.bus?.offEvent('plugin:started', this.onPluginStarted);
    this.bus?.offEvent('plugin:stopped', this.onPluginStopped);
    this.bus?.offEvent('plugin:error', this.onPluginStopped);
    this.bus?.offEvent('plugin:crashed', this.onPluginStopped);
    this.plugins.clear();
    this.models.clear();
    await this.client.close();
    await this.modelClient.close();
    await Promise.all(Array.from(this.external.values()).map((source) => source.close()));
    this.external.clear();
  }

  public syncExternal(servers: ExternalServer[]): void {
    const wanted = new Map(servers.filter((server) => server.enabled).map((server) => [server.id, server]));
    for (const [id, source] of this.external) {
      const next = wanted.get(id);
      if (next && source.sameAs(next)) {
        source.setToolApproval(next.toolApproval);
        continue;
      }
      this.external.delete(id);
      source.close();
    }
    for (const [id, server] of wanted) {
      if (this.external.has(id)) continue;
      const source = new ExternalMcpSource(server, this.logger);
      this.external.set(id, source);
      source.connect();
    }
  }

  public externalStatus(servers: ExternalServer[]): AssistantExternalStatus[] {
    return servers.map((server) => this.external.get(server.id)?.status() ?? { id: server.id, name: server.name, state: 'disabled', toolCount: 0 });
  }

  public toolsFor(role: DBRoles): CoreTool[] {
    const admin = role === 'admin' || role === 'master';
    const all = this.all();
    return admin ? all : all.filter((tool) => !(tool.metadata as { adminOnly?: boolean } | undefined)?.adminOnly);
  }

  public describe(role?: DBRoles): AssistantToolInfo[] {
    const tools = role ? this.toolsFor(role) : this.all();
    return tools.map((tool) => {
      const meta = (tool.metadata ?? {}) as {
        adminOnly?: boolean;
        pluginId?: string;
        pluginName?: string;
        externalId?: string;
        externalName?: string;
        externalTool?: string;
        approval?: boolean;
      };
      const approval = Boolean(tool.needsApproval ?? meta.approval);
      return {
        name: tool.name,
        description: tool.description,
        source: meta.pluginId
          ? { kind: 'plugin', pluginId: meta.pluginId, pluginName: meta.pluginName ?? meta.pluginId }
          : meta.externalId
            ? { kind: 'external', serverId: meta.externalId, serverName: meta.externalName ?? meta.externalId, toolName: meta.externalTool ?? tool.name }
            : { kind: 'core' },
        group: toolGroup(tool),
        approval,
        adminOnly: Boolean(meta.adminOnly),
        inputSchema: approval ? convertSchemaToJsonSchema(tool.inputSchema) : undefined,
      };
    });
  }

  public async callPluginTool(name: string, input: unknown, ctx: ToolContext): Promise<AssistantToolResult | undefined> {
    for (const entry of this.plugins.values()) {
      if (entry.specs.some((spec) => spec.name === name)) return this.client.call(entry.pluginId, name, input, ctx);
    }
    return undefined;
  }

  public async registerPlugin(plugin: Plugin): Promise<void> {
    if (hasInterface(plugin.contract, PluginInterface.AssistantModels)) await this.registerModels(plugin);
    if (!hasInterface(plugin.contract, PluginInterface.AssistantTools)) return;

    try {
      const specs = await this.client.fetchSpecs(plugin);
      const tools = specs.map((spec) => this.client.wrap(plugin, spec));
      this.plugins.set(plugin.id, { pluginId: plugin.id, pluginName: plugin.displayName, specs, tools });
      if (tools.length) {
        this.logger.debug(`Assistant: ${plugin.displayName} contributes ${tools.length} tools (${specs.map((s) => s.name).join(', ')})`);
      }
    } catch (error: any) {
      this.logger.warn(`Assistant: could not read tools from ${plugin.displayName}: ${error.message}`);
    }
  }

  public unregisterPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.models.delete(pluginId);
  }

  private async registerModels(plugin: Plugin): Promise<void> {
    try {
      const [models, status] = await Promise.all([this.modelClient.fetchSpecs(plugin), this.modelClient.fetchStatus(plugin)]);
      this.models.set(plugin.id, {
        pluginId: plugin.id,
        pluginName: plugin.displayName,
        provider: pluginProviderName(plugin.pluginName),
        models,
        ...(status ? { status } : {}),
      });
      if (models.length) {
        this.logger.debug(`Assistant: ${plugin.displayName} offers ${models.length} models (${models.map((m) => m.id).join(', ')})`);
      }
    } catch (error: any) {
      this.logger.warn(`Assistant: could not read models from ${plugin.displayName}: ${error.message}`);
    }
  }

  private all(): CoreTool[] {
    const external: CoreTool[] = [];
    for (const source of this.external.values()) {
      source.touch();
      external.push(...source.tools);
    }
    return [...this.core, ...Array.from(this.plugins.values()).flatMap((entry) => entry.tools), ...external];
  }

  private async handlePluginEvent(payload: InternalEventPayload, kind: 'started' | 'stopped'): Promise<void> {
    const pluginId = (payload as { pluginId?: string }).pluginId;
    if (!pluginId) return;

    if (kind === 'stopped') {
      this.unregisterPlugin(pluginId);
      return;
    }

    const plugin = new PluginsService().getPluginById(pluginId);
    if (plugin) await this.registerPlugin(plugin);
  }
}

export function toolGroup(tool: Pick<CoreTool, 'name' | 'metadata'>): string {
  const meta = tool.metadata as { pluginId?: string; externalId?: string; group?: string } | undefined;
  if (meta?.group) return meta.group;
  if (meta?.pluginId) return `plugin:${meta.pluginId}`;
  if (meta?.externalId) return `external:${meta.externalId}`;
  return tool.name.startsWith('docs_') ? 'docs' : 'core';
}
