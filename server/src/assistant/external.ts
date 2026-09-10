import { PromiseTimeout } from '@camera.ui/common/utils';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolDefinition } from '@tanstack/ai';
import { Agent, fetch as undiciFetch } from 'undici';

import { withImages } from './tools/shared.js';

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { JSONSchema } from '@tanstack/ai';
import type { DBAssistantMcpServer } from '../api/database/types.js';
import type { LoggerService } from '../services/logger/index.js';
import type { CoreTool, ToolContext, ToolImage } from './tools/shared.js';
import type { AssistantExternalState, AssistantExternalStatus } from './types.js';

const CONNECT_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 60_000;
const RETRY_AFTER_MS = 60_000;
const LAZY_FROM = 12;
const EMPTY_SCHEMA: JSONSchema = { type: 'object', properties: {} };

export interface ExternalServer extends DBAssistantMcpServer {
  plainToken: string | null;
}

export class ExternalMcpSource {
  public tools: CoreTool[] = [];
  public state: AssistantExternalState = 'connecting';
  public error?: string;

  private client?: Client;
  private lastAttempt = 0;
  private connecting?: Promise<void>;

  constructor(
    public readonly server: ExternalServer,
    private logger: LoggerService,
  ) {}

  public get id(): string {
    return this.server.id;
  }

  public status(): AssistantExternalStatus {
    return { id: this.server.id, name: this.server.name, state: this.state, toolCount: this.tools.length, error: this.error };
  }

  public sameAs(other: ExternalServer): boolean {
    return (
      this.server.url === other.url &&
      this.server.plainToken === other.plainToken &&
      this.server.name === other.name &&
      this.server.enabled === other.enabled &&
      this.server.insecure === other.insecure
    );
  }

  public connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = this.doConnect().finally(() => (this.connecting = undefined));
    return this.connecting;
  }

  public touch(): void {
    if (this.state === 'error' && !this.connecting && Date.now() - this.lastAttempt > RETRY_AFTER_MS) this.connect();
  }

  public async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    this.tools = [];
    this.state = 'disabled';
    await client?.close().catch(() => undefined);
  }

  private async doConnect(): Promise<void> {
    this.lastAttempt = Date.now();
    this.state = 'connecting';
    this.error = undefined;
    await this.client?.close().catch(() => undefined);
    this.client = undefined;

    try {
      const client = await PromiseTimeout(this.open(), CONNECT_TIMEOUT_MS, undefined, 'Connection timed out');
      client.onclose = () => {
        if (this.client !== client) return;
        this.client = undefined;
        this.state = 'error';
        this.error = 'Connection closed';
      };
      client.setNotificationHandler(ToolListChangedNotificationSchema, () => this.refresh());
      this.client = client;
      await this.refresh();
      this.state = 'connected';
      this.logger.debug(`Assistant: external MCP server ${this.server.name} connected with ${this.tools.length} tools`);
    } catch (error: any) {
      this.state = 'error';
      this.error = error?.message ?? String(error);
      this.tools = [];
      this.logger.warn(`Assistant: external MCP server ${this.server.name} failed: ${this.error}`);
    }
  }

  private async open(): Promise<Client> {
    const url = new URL(this.server.url);
    const info = { name: 'camera.ui', version: '1.0.0' };
    const dispatcher = this.server.insecure ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
    const doFetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      if (this.server.plainToken) headers.set('Authorization', `Bearer ${this.server.plainToken}`);
      const options = { ...init, headers, ...(dispatcher ? { dispatcher } : {}) };
      return (dispatcher ? undiciFetch(input, options as never) : fetch(input, options)) as Promise<Response>;
    };

    const client = new Client(info);
    await client.connect(new StreamableHTTPClientTransport(url, { fetch: doFetch }));
    return client;
  }

  private async refresh(): Promise<void> {
    const client = this.client;
    if (!client) return;
    const listed: Tool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : undefined);
      listed.push(...page.tools);
      cursor = page.nextCursor;
    } while (cursor);
    const lazy = listed.length > LAZY_FROM;
    this.tools = listed.map((tool) => this.wrap(tool, lazy));
  }

  private wrap(tool: Tool, lazy: boolean): CoreTool {
    const name = `${slug(this.server.name)}__${tool.name.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
    const readOnly = tool.annotations?.readOnlyHint === true;
    const config = {
      name,
      description: `[${this.server.name}] ${tool.description ?? tool.title ?? tool.name}`,
      inputSchema: tool.inputSchema?.type === 'object' ? tool.inputSchema : EMPTY_SCHEMA,
      lazy,
      metadata: { externalId: this.server.id, externalName: this.server.name, approval: !readOnly },
    };
    const execute = async (input: unknown, ctx: ToolContext) => this.call(tool.name, input, ctx);
    // anything the server does not mark read-only may change the home, so the user confirms it first
    return readOnly
      ? toolDefinition(config).server<ToolContext['context']>(execute)
      : toolDefinition({ ...config, needsApproval: true }).server<ToolContext['context']>(execute);
  }

  private async call(name: string, input: unknown, ctx: ToolContext) {
    if (!this.client) await this.connect();
    const client = this.client;
    if (!client) return { error: `${this.server.name} is not reachable: ${this.error ?? 'not connected'}` };

    try {
      const result = await PromiseTimeout(
        client.callTool({ name, arguments: (input ?? {}) as Record<string, unknown> }),
        CALL_TIMEOUT_MS,
        undefined,
        `${this.server.name} did not answer within ${CALL_TIMEOUT_MS / 1000}s`,
      );
      const content = (result.content ?? []) as { type: string; text?: string; data?: string; mimeType?: string }[];
      const texts = content.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text!);
      const images: ToolImage[] = content
        .filter((part) => part.type === 'image' && typeof part.data === 'string')
        .map((part) => ({ data: part.data!, mimeType: part.mimeType ?? 'image/png' }));
      if (!texts.length && result.structuredContent) texts.push(JSON.stringify(result.structuredContent));
      const text = texts.join('\n').slice(0, 100_000);
      if (result.isError) return { error: text || 'The tool reported an error' };
      return images.length ? withImages(text, images, ctx) : text || 'Done.';
    } catch (error: any) {
      return { error: `${this.server.name}: ${error?.message ?? String(error)}` };
    }
  }
}

function slug(name: string): string {
  const bare = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return bare || 'mcp';
}
