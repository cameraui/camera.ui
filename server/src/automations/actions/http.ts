import type { ActionContext } from './types.js';

export async function actionHttp(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  const url = ctx.resolve(data.url as string);
  const method = data.method as string;
  const body = ctx.resolve(data.body as string);
  const headers = Object.fromEntries(Object.entries((data.headers as Record<string, string>) ?? {}).map(([key, value]) => [key, ctx.resolve(value)]));

  const response = await fetch(url, {
    method,
    headers,
    body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined,
  });

  if (!ctx.suppressVariableWrites) {
    ctx.variables.set('http.status', String(response.status));
    ctx.variables.set('previous.success', String(response.ok));

    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
      const buffer = Buffer.from(await response.arrayBuffer());
      ctx.variables.set('http.body', buffer.toString('base64'));
      ctx.variables.set('http.base64', `data:${contentType};base64,${buffer.toString('base64')}`);
    } else {
      const text = await response.text();
      ctx.variables.set('http.body', text);

      try {
        const json = JSON.parse(text);
        ctx.variables.set('http.json', text);
        if (typeof json === 'object' && json !== null) {
          for (const [key, value] of Object.entries(json)) {
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
              ctx.variables.set(`http.${key}`, String(value));
            }
          }
        }
      } catch {
        // Not JSON
      }
    }
  } else {
    // Still consume the response body to prevent memory leaks
    await response.arrayBuffer();
  }
}
