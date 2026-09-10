import { toolDefinition } from '@tanstack/ai';

import { ASSISTANT_CLIENT_TOOLS } from '../client-tools.js';
import { createApiTools } from './api.js';
import { askTools } from './ask.js';
import { automationTools } from './automations.js';
import { cameraTools } from './cameras.js';
import { createDocsTools } from './docs.js';
import { instanceTools } from './instance.js';
import { memoryTools } from './memory.js';
import { metricsTools } from './metrics.js';
import { notificationTools } from './notifications.js';
import { createPluginTools } from './plugins.js';
import { reportTools } from './report.js';
import { scheduleTools } from './schedules.js';
import { sensorTools } from './sensors.js';
import { settingTools } from './settings.js';
import { createListToolsTool, systemTools } from './system.js';
import { terminalTools } from './terminal.js';

import type { JSONSchema } from '@tanstack/ai';
import type { ApiCatalog } from '../api-catalog.js';
import type { DocsIndex } from '../docs.js';
import type { AssistantToolRegistry } from '../registry.js';
import type { CoreTool } from './shared.js';

export function coreTools(registry: AssistantToolRegistry, api: ApiCatalog, docs: DocsIndex): CoreTool[] {
  return [
    ...cameraTools,
    ...sensorTools,
    ...systemTools,
    ...metricsTools,
    ...automationTools,
    ...scheduleTools,
    ...notificationTools,
    ...instanceTools,
    ...terminalTools,
    ...createApiTools(api),
    ...createDocsTools(docs),
    ...createPluginTools(registry),
    createListToolsTool(registry),
    ...askTools,
    ...reportTools,
    ...settingTools,
    ...memoryTools,
    ...clientTools(),
  ];
}

export function isBrowserTool(tool: Pick<CoreTool, 'metadata'>): boolean {
  const meta = tool.metadata as { client?: boolean; interactive?: boolean } | undefined;
  return meta?.client === true || meta?.interactive === true;
}

export function isChatOnlyTool(tool: Pick<CoreTool, 'metadata'>): boolean {
  return (tool.metadata as { chatOnly?: boolean } | undefined)?.chatOnly === true;
}

function clientTools(): CoreTool[] {
  return ASSISTANT_CLIENT_TOOLS.map(
    (spec) =>
      toolDefinition({
        name: spec.name,
        description: spec.description,
        inputSchema: spec.inputSchema as unknown as JSONSchema,
        metadata: { client: true },
      }) as unknown as CoreTool,
  );
}
