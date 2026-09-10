import type { JSONSchema } from '@tanstack/ai';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiEndpoint {
  method: ApiMethod;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  pathParams: string[];
  query?: JSONSchema;
  body?: JSONSchema;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: { name: string; in: string; schema?: JSONSchema; required?: boolean; description?: string }[];
  requestBody?: { content?: Record<string, { schema?: JSONSchema }> };
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const METHODS: ApiMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const SYNONYMS: Record<string, string[]> = {
  delete: ['remove'],
  remove: ['delete'],
  create: ['add', 'new'],
  add: ['create'],
  update: ['edit', 'change', 'patch'],
  edit: ['update'],
  change: ['update'],
  list: ['all'],
  show: ['get'],
  picture: ['snapshot', 'image'],
  photo: ['snapshot', 'image'],
  login: ['session', 'auth'],
  restart: ['reboot'],
};
const WORDS = new WeakMap<ApiEndpoint, Set<string>>();

const DENIED = [
  /^\/api\/auth\/(login|token|logout|refresh|2fa|verify-2fa)(\/|$)/,
  /^\/api\/config(\/|$)/,
  /^\/api\/backup(\/|$)/,
  /^\/api\/files(\/|$)/,
  /^\/api\/download(\/|$)/,
  /^\/api\/tunnel(\/|$)/,
  /^\/api\/assistant(\/|$)/,
  /^\/api\/server\/(reset|log\/download|cert|certificate)(\/|$)/,
  /^\/api\/users\/[^/]+\/password/,
  /\/(logo|readme|image|video|snapshot|rtsp|stream)(\/|$)/,
];

export class ApiCatalog {
  private endpoints: ApiEndpoint[] = [];

  public get size(): number {
    return this.endpoints.length;
  }

  public load(document: unknown): void {
    const paths = (document as OpenApiDocument).paths ?? {};
    const out: ApiEndpoint[] = [];

    for (const [rawPath, operations] of Object.entries(paths)) {
      const path = rawPath.replace(/\{([^}]+)\}/g, ':$1').replace(/\/+$/, '') || '/';
      if (!path.startsWith('/api/') || DENIED.some((rule) => rule.test(path))) continue;

      for (const method of METHODS) {
        const operation = operations[method.toLowerCase()];
        if (!operation) continue;
        if (method === 'POST' && path === '/api/auth/tokens') continue;

        const params = operation.parameters ?? [];
        const queryParams = params.filter((p) => p.in === 'query');
        const query: JSONSchema | undefined = queryParams.length
          ? {
              type: 'object',
              properties: Object.fromEntries(queryParams.map((p) => [p.name, { ...(p.schema ?? {}), description: p.description ?? p.schema?.description }])),
              required: queryParams.filter((p) => p.required).map((p) => p.name),
            }
          : undefined;
        const body = operation.requestBody?.content?.['application/json']?.schema;

        out.push({
          method,
          path,
          summary: operation.summary ?? '',
          description: operation.description,
          tags: operation.tags ?? [],
          pathParams: params.filter((p) => p.in === 'path').map((p) => p.name),
          query,
          body,
        });
      }
    }

    this.endpoints = out.sort((a, b) => a.path.localeCompare(b.path) || METHODS.indexOf(a.method) - METHODS.indexOf(b.method));
  }

  public search(query: string, limit = 25): ApiEndpoint[] {
    const terms = expand(tokens(query));
    if (!terms.length) return this.endpoints.slice(0, limit);

    const scored = this.endpoints
      .map((endpoint) => {
        const words = wordsOf(endpoint);
        const pathWords = tokens(endpoint.path);
        let score = 0;
        for (const term of terms) if (words.has(term)) score += pathWords.includes(term) ? 2 : 1;
        return { endpoint, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((entry) => entry.endpoint);
  }

  public resolve(method: ApiMethod, path: string): ApiEndpoint | undefined {
    const clean = path.split('?')[0].replace(/\/+$/, '') || '/';
    const segments = clean.split('/');

    return this.endpoints.find((endpoint) => {
      if (endpoint.method !== method) return false;
      const template = endpoint.path.split('/');
      if (template.length !== segments.length) return false;
      return template.every((part, i) => matchSegment(part, segments[i]));
    });
  }
}

function matchSegment(template: string, segment: string): boolean {
  const at = template.indexOf(':');
  if (at < 0) return template === segment;
  return segment.length > at && segment.startsWith(template.slice(0, at));
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .filter((word) => word.length > 1);
}

function expand(terms: string[]): string[] {
  return [...new Set(terms.flatMap((term) => [term, ...(SYNONYMS[term] ?? [])]))];
}

function wordsOf(endpoint: ApiEndpoint): Set<string> {
  let words = WORDS.get(endpoint);
  if (words) return words;
  const body = (endpoint.body as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  const query = (endpoint.query as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  words = new Set([
    ...tokens(endpoint.path),
    ...tokens(`${endpoint.summary} ${endpoint.description ?? ''} ${endpoint.tags.join(' ')}`),
    ...endpoint.pathParams.flatMap(tokens),
    ...Object.keys(query).flatMap(tokens),
    ...Object.keys(body).flatMap(tokens),
  ]);
  WORDS.set(endpoint, words);
  return words;
}
