import { container } from 'tsyringe';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PluginManager } from '../../plugins/index.js';

interface OAuthAuthCodeFlowProxy {
  completeAuthCodeFlow(code: string, state: string): Promise<unknown>;
}

interface OAuthCallbackRequest {
  Params: { pluginId: string };
  Querystring: { code?: string; state?: string; error?: string };
}

export class OAuthCallbackController {
  public async callback(req: FastifyRequest<OAuthCallbackRequest>, reply: FastifyReply): Promise<void> {
    const { pluginId } = req.params;
    const { code, state, error } = req.query;

    if (error || !code || !state) {
      return reply.type('text/html').send(closeTabPage(false));
    }

    const pluginManager = container.resolve<PluginManager>('pluginManager');
    const plugin = [...pluginManager.plugins.values()].find((candidate) => candidate.id === pluginId || candidate.pluginName === pluginId);

    if (!plugin) {
      return reply.type('text/html').send(closeTabPage(false));
    }
    if (!plugin.worker.isRunning()) {
      return reply.type('text/html').send(closeTabPage(false));
    }

    try {
      const proxy = plugin.worker.pluginProxy as unknown as OAuthAuthCodeFlowProxy;
      await proxy.completeAuthCodeFlow(code, state);
      return reply.type('text/html').send(closeTabPage(true));
    } catch {
      return reply.type('text/html').send(closeTabPage(false));
    }
  }
}

function closeTabPage(success: boolean): string {
  const title = success ? 'Connected' : 'Connection failed';
  const message = success ? 'You can close this window and return to camera.ui.' : 'Something went wrong. You can close this window and try again.';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #0b0b0c; color: #e7e7ea; }
      body { display: flex; min-height: 100vh; align-items: center; justify-content: center; }
      .box { text-align: center; padding: 2rem; }
      h1 { font-size: 1.1rem; margin: 0 0 .5rem; }
      p { color: #9a9aa2; font-size: .9rem; margin: 0; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>
    <script>setTimeout(function () { window.close(); }, 800);</script>
  </body>
</html>`;
}
