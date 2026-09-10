import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { approvalSchema, toolError, withImages } from './shared.js';

import type { Server } from '../../api/index.js';
import type { ApiCatalog, ApiMethod } from '../api-catalog.js';
import type { CoreTool, ToolContext } from './shared.js';

const MAX_RESULT_CHARS = 16_000;
const MAX_ARRAY_ITEMS = 40;
const SECRET_KEY = /(password|passwd|secret|token|api[_-]?key|access[_-]?key|credential|authorization|private[_-]?key|pin(code)?$|setup[_-]?code|qr[_-]?code|pairing)/i;
const URL_CREDENTIALS = /(\w+:\/\/)([^/\s:@]+):([^/\s@]+)@/g;

export function createApiTools(catalog: ApiCatalog): CoreTool[] {
  const apiSearch = toolDefinition({
    name: 'api_search',
    description:
      'Find camera.ui REST endpoints by keyword (plugins, updates, workers, sessions, notifications, users, sensors, cameras and more). ' +
      'Use it whenever no specialized tool covers a question, then call api_get or api_call with the path it returns. Path parameters look like :cameraname.',
    inputSchema: zod.object({
      query: zod.string().min(1).describe('Keywords, e.g. "plugin update", "workers", "sessions"'),
    }),
  }).server<ToolContext['context']>(({ query }) => {
    const hits = catalog.search(query);
    if (!hits.length) {
      return {
        endpoints: [],
        hint:
          'No REST endpoint matches. Discovery and adoption, the notification history, logs, updates, MQTT and process states are not REST: ' +
          'use system_query or system_action. Check docs_search before telling the user that a feature does not exist.',
      };
    }
    return hits.map((endpoint) => ({
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      pathParams: endpoint.pathParams.length ? endpoint.pathParams : undefined,
      query: endpoint.query ? Object.keys(endpoint.query.properties ?? {}) : undefined,
      body: endpoint.body,
    }));
  });

  const apiGet = toolDefinition({
    name: 'api_get',
    description:
      'Read data from a camera.ui REST endpoint found with api_search. Runs with the permissions of the current user. ' +
      'Large answers are trimmed, so narrow the request with query parameters when possible.',
    inputSchema: zod.object({
      path: zod.string().startsWith('/api/').describe('Concrete path with parameters filled in, e.g. /api/plugins or /api/cameras/Garden'),
      query: zod
        .record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean()]))
        .optional()
        .describe('Query string parameters'),
    }),
  }).server<ToolContext['context']>(async ({ path, query }, ctx) => request(catalog, 'GET', path, query, undefined, ctx));

  const apiCallInput = zod.object({
    method: zod.enum(['POST', 'PUT', 'PATCH', 'DELETE']),
    path: zod.string().startsWith('/api/').describe('Concrete path with parameters filled in'),
    body: zod.record(zod.string(), zod.unknown()).optional().describe('JSON body as the endpoint schema describes it'),
    query: zod.record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean()])).optional(),
  });

  const apiCall = toolDefinition({
    name: 'api_call',
    description:
      'Change something through a camera.ui REST endpoint found with api_search: update a plugin, clear notifications, restart a worker, edit a setting. ' +
      'Runs with the permissions of the current user. Requires user confirmation.',
    needsApproval: true,
    inputSchema: approvalSchema(apiCallInput),
  }).server<ToolContext['context']>(async (args, ctx) => {
    const parsed = apiCallInput.safeParse(args);
    if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
    const { method, path, body, query } = parsed.data;
    return request(catalog, method, path, query, body, ctx);
  });

  return [apiSearch, apiGet, apiCall];
}

async function request(
  catalog: ApiCatalog,
  method: ApiMethod,
  path: string,
  query: Record<string, string | number | boolean> | undefined,
  body: Record<string, unknown> | undefined,
  ctx: ToolContext,
) {
  const endpoint = catalog.resolve(method, path);
  if (!endpoint) return toolError(`${method} ${path} is not an endpoint the assistant may use. Call api_search to find the right one.`);
  if (!ctx.context.authorization) return toolError('No session available for API calls.');

  const app = container.resolve<Server>('server').app;
  if (!app) return toolError('The API is not ready.');

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) search.set(key, String(value));
  const url = search.size ? `${path}?${search.toString()}` : path;

  const response = await app.inject({
    method,
    url,
    headers: { authorization: ctx.context.authorization, 'content-type': 'application/json', accept: 'application/json, image/*, text/plain' },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });

  const contentType = String(response.headers['content-type'] ?? '');

  if (response.statusCode >= 400) {
    const message = parseError(response.body) ?? response.statusMessage;
    if (response.statusCode === 401 || response.statusCode === 403) return toolError(`Not allowed for this user (${response.statusCode}): ${message}`);
    return toolError(`${method} ${path} failed with ${response.statusCode}: ${message}`);
  }

  if (contentType.startsWith('image/')) {
    return withImages(
      `${method} ${path} returned an image.`,
      [{ data: response.rawPayload.toString('base64'), mimeType: contentType.split(';')[0], caption: path }],
      ctx,
    );
  }

  if (response.statusCode === 204 || !response.body) return { ok: true, status: response.statusCode };

  if (contentType.includes('application/json')) {
    let data: unknown;
    try {
      data = JSON.parse(response.body);
    } catch {
      return response.body.slice(0, MAX_RESULT_CHARS);
    }
    return truncate(redact(data));
  }

  return response.body.slice(0, MAX_RESULT_CHARS);
}

function parseError(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string; error_description?: string };
    return parsed.message ?? parsed.error_description ?? parsed.error;
  } catch {
    return body ? body.slice(0, 200) : undefined;
  }
}

function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(URL_CREDENTIALS, '$1$2:***@');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY.test(key) && inner !== null && inner !== undefined ? '[redacted]' : redact(inner);
    }
    return out;
  }
  return value;
}

function truncate(value: unknown): unknown {
  let trimmed = value;
  if (Array.isArray(value) && value.length > MAX_ARRAY_ITEMS) {
    trimmed = { items: value.slice(0, MAX_ARRAY_ITEMS), total: value.length, truncated: true };
  } else if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    let cut = false;
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      if (Array.isArray(inner) && inner.length > MAX_ARRAY_ITEMS) {
        out[key] = inner.slice(0, MAX_ARRAY_ITEMS);
        out[`${key}Total`] = inner.length;
        cut = true;
      } else {
        out[key] = inner;
      }
    }
    trimmed = cut ? { ...out, truncated: true } : out;
  }

  const text = JSON.stringify(trimmed);
  if (text.length <= MAX_RESULT_CHARS) return trimmed;
  return `${text.slice(0, MAX_RESULT_CHARS)}… (truncated, narrow the request)`;
}
