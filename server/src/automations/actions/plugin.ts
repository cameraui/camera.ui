import { PluginsService } from '../../api/services/plugins.service.js';
import { getMethodDef, runRegistryMethod } from '../pluginMethodRegistry.js';

import type { PluginMethods } from '../pluginMethodRegistry.js';
import type { ActionContext } from './types.js';

let cachedPluginCall: (() => Promise<void>) | null = null;
let _pluginsService: PluginsService | undefined;
const pluginsService = (): PluginsService => (_pluginsService ??= new PluginsService());

export function clearCachedPluginCall(): void {
  cachedPluginCall = null;
}

export async function actionPlugin(ctx: ActionContext, data: Record<string, unknown>): Promise<void> {
  if (cachedPluginCall) {
    await cachedPluginCall();
    return;
  }

  const pluginName = data.pluginName as string;
  const method = data.method as string;
  const params = (data.params as Record<string, string>) ?? {};

  if (!pluginName || !method) throw new Error('Plugin name and method are required');

  const worker = pluginsService().getPluginProcessByName(pluginName);
  if (!worker) throw new Error(`Plugin "${pluginName}" not found`);

  // only registry-declared methods are callable, the proxy would forward anything
  const methodDef = getMethodDef(method);
  if (!methodDef) throw new Error(`Method "${method}" is not an allowed automation action`);
  const binaryParams = new Set(methodDef.params.filter((p) => p.binary).map((p) => p.name));

  const resolvedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    const resolved = ctx.resolve(value);
    resolvedParams[key] = binaryParams.has(key) && resolved ? Buffer.from(resolved, 'base64') : resolved;
  }

  const config = (data.config as Record<string, unknown>) ?? {};
  resolvedParams.config = Object.keys(config).length > 0 ? config : {};

  // Make context variables available for frame metadata resolution (image.width, image.height, etc.)
  for (const [key, value] of ctx.variables) {
    if (!(key in resolvedParams)) {
      resolvedParams[key] = value;
    }
  }

  const proxy = worker.pluginProxy as unknown as PluginMethods;
  if (!proxy[method]) throw new Error(`Method "${method}" not found on plugin "${pluginName}"`);

  const call = () => runRegistryMethod(methodDef, proxy, worker.plugin.contract, resolvedParams);
  const callFn = async () => {
    await call();
  };

  if (ctx.suppressVariableWrites) {
    cachedPluginCall = callFn;
    await callFn();
    return;
  }

  const startMs = Date.now();
  const result = (await call()) as Record<string, unknown> | undefined;
  const durationMs = Date.now() - startMs;

  ctx.variables.set('plugin.durationMs', String(durationMs));
  if (result) {
    ctx.variables.set('plugin.detected', String(Boolean(result.detected)));
    const detections = (result.detections as { label?: string }[]) ?? [];
    const labels = detections.map((d) => d.label).filter(Boolean);
    ctx.variables.set('plugin.labels', labels.join(', '));
    ctx.variables.set('plugin.detections', JSON.stringify(detections));
    ctx.variables.set('plugin.result', JSON.stringify(result));
    ctx.variables.set('previous.result', result.detected ? 'detected' : 'not_detected');
    ctx.variables.set('previous.success', 'true');
  } else {
    ctx.variables.set('plugin.detected', 'false');
    ctx.variables.set('previous.result', 'no_response');
    ctx.variables.set('previous.success', 'false');
  }
}
