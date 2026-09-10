import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { convertSchemaToJsonSchema } from '@tanstack/ai';
import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { isBrowserTool, isChatOnlyTool } from './tools/index.js';
import { ASSISTANT_IMAGE_EVENT } from './tools/shared.js';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ContentPart } from '@tanstack/ai';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { LoggerService } from '../services/logger/index.js';
import type { AssistantToolRegistry } from './registry.js';
import type { CoreTool } from './tools/shared.js';
import type { AssistantRunContext } from './types.js';

const EMPTY_SCHEMA = { type: 'object' as const, properties: {} };
const RESULT_MAX_CHARS = 200_000;

function needsApproval(tool: CoreTool): boolean {
  return Boolean(tool.needsApproval ?? (tool.metadata as { approval?: boolean } | undefined)?.approval);
}

function describeTool(tool: CoreTool): Tool {
  const write = needsApproval(tool);
  const schema = convertSchemaToJsonSchema(tool.inputSchema) as Tool['inputSchema'] | undefined;
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: schema?.type === 'object' ? schema : EMPTY_SCHEMA,
    annotations: { readOnlyHint: !write, destructiveHint: write, openWorldHint: false },
  };
}

function toContent(result: unknown, extraImages: { data: string; mimeType: string }[]): CallToolResult {
  const content: CallToolResult['content'] = [];
  let isError = false;

  if (typeof result === 'string') {
    content.push({ type: 'text', text: result });
  } else if (Array.isArray(result) && result.every((part) => part && typeof part === 'object' && 'type' in part)) {
    for (const part of result as ContentPart[]) {
      if (part.type === 'text') content.push({ type: 'text', text: part.content });
      else if (part.type === 'image' && part.source.type === 'data')
        content.push({ type: 'image', data: part.source.value, mimeType: part.source.mimeType ?? 'image/jpeg' });
      else content.push({ type: 'text', text: JSON.stringify(part) });
    }
  } else {
    const record = result as { error?: unknown } | null;
    isError = typeof record?.error === 'string';
    const text = JSON.stringify(result ?? null);
    content.push({ type: 'text', text: text.length > RESULT_MAX_CHARS ? `${text.slice(0, RESULT_MAX_CHARS)}…` : text });
  }

  for (const image of extraImages) content.push({ type: 'image', data: image.data, mimeType: image.mimeType });
  return isError ? { content, isError } : { content };
}

export class AssistantMcp {
  private logger = container.resolve<LoggerService>('logger');

  constructor(private registry: AssistantToolRegistry) {}

  public async handle(request: FastifyRequest, reply: FastifyReply, ctx: AssistantRunContext, allowWrites: boolean): Promise<void> {
    const tools = this.registry.toolsFor(ctx.role).filter((tool) => !isBrowserTool(tool) && !isChatOnlyTool(tool) && (allowWrites || !needsApproval(tool)));

    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const server = new Server({ name: 'camera.ui', version: '1' }, { capabilities: { tools: {} } });

    server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: tools.map(describeTool) }));
    server.setRequestHandler(CallToolRequestSchema, async (call, extra) => {
      const tool = tools.find((candidate) => candidate.name === call.params.name);
      if (!tool?.execute) return { content: [{ type: 'text', text: `Unknown tool "${call.params.name}".` }], isError: true };

      const images: { data: string; mimeType: string }[] = [];
      const started = Date.now();
      try {
        const result = await tool.execute(call.params.arguments ?? {}, {
          context: ctx,
          toolCallId: randomUUID(),
          abortSignal: extra.signal,
          emitCustomEvent: (name: string, value: Record<string, unknown>) => {
            if (name === ASSISTANT_IMAGE_EVENT && typeof value.data === 'string')
              images.push({ data: value.data, mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'image/jpeg' });
          },
        });
        this.logger.debug(`Assistant: mcp tool ${tool.name} took ${Date.now() - started}ms`);
        return toContent(result, images);
      } catch (error: any) {
        this.logger.debug(`Assistant: mcp tool ${tool.name} failed: ${error.message}`);
        return { content: [{ type: 'text', text: String(error.message ?? error) }], isError: true };
      }
    });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    reply.hijack();
    try {
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    } finally {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
  }
}
