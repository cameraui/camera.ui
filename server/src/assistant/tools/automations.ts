import { toolDefinition } from '@tanstack/ai';
import { container } from 'tsyringe';
import * as zod from 'zod';

import { AutomationsService } from '../../api/services/automations.service.js';
import { CamerasService } from '../../api/services/cameras.service.js';
import { RoomsService } from '../../api/services/rooms.service.js';
import { SensorsService } from '../../api/services/sensors.service.js';
import { AUTOMATION_CATALOG, AUTOMATION_VARIABLES, buildFlow } from '../automation-catalog.js';
import { approvalSchema, toolError } from './shared.js';

import type { CreateAutomationInput } from '../../api/schemas/automations.schema.js';
import type { AutomationEngine } from '../../automations/engine.js';
import type { CoreTool, ToolContext } from './shared.js';

const nodeSchema = zod.object({
  id: zod.string().min(1).max(64).describe('Short unique id, e.g. "t1", "a1"'),
  type: zod.string().describe('Node type from automation_catalog'),
  data: zod.record(zod.string(), zod.unknown()).optional().describe('Fields for that node type'),
});

const edgeSchema = zod.object({
  source: zod.string(),
  target: zod.string(),
  sourceHandle: zod.string().optional().describe('"true" or "false" when the source is a condition'),
});

const automationCatalog = toolDefinition({
  name: 'automation_catalog',
  lazy: true,
  description:
    'Everything needed to build an automation: the node types with their fields, the cameras and writable sensors with their ids, ' +
    'and the template variables each trigger provides. Call it before create_automation.',
  inputSchema: zod.object({}),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(() => {
  const rooms = new RoomsService();
  const cameras = new CamerasService().list().map((camera) => ({ id: camera._id, name: camera.name, room: rooms.label(camera.roomId) ?? camera.room ?? undefined }));
  const sensors = new SensorsService()
    .list()
    .filter((sensor) => sensor.connected)
    .map((sensor) => ({
      id: sensor.id,
      name: sensor.displayName || sensor.name,
      type: sensor.type,
      writable: sensor.semantics?.commandProperty !== undefined,
      commandProperty: sensor.semantics?.commandProperty,
      stateProperty: sensor.semantics?.stateProperty,
      cameras: sensor.assignedCameraIds,
    }));

  return {
    rules: [
      'Exactly one trigger, at least one action, every node reachable from the trigger.',
      'Edges leaving a condition need sourceHandle "true" or "false".',
      'Templates like {{event.label}} are resolved at run time; wrap values in double curly braces.',
      'For a notification with a picture put action-snapshot before action-notification and set image to {{snapshot.base64}}.',
    ],
    nodes: AUTOMATION_CATALOG,
    variables: AUTOMATION_VARIABLES,
    cameras,
    sensors,
  };
});

const createInput = zod.object({
  name: zod.string().min(1).max(200).describe('Short descriptive name'),
  nodes: zod.array(nodeSchema).min(2),
  edges: zod.array(edgeSchema).min(1),
  enabled: zod.boolean().optional().describe('Default true'),
});

const createAutomation = toolDefinition({
  name: 'create_automation',
  lazy: true,
  description:
    'Create an automation from nodes and edges built with automation_catalog. The result is a real automation the user can open and edit. ' +
    'Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(createInput),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(async (args) => {
  const parsed = createInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);

  const built = buildFlow(parsed.data.nodes, parsed.data.edges);
  if ('errors' in built) return toolError(built.errors.join(' '));

  const automation = await new AutomationsService().create({
    name: parsed.data.name,
    enabled: parsed.data.enabled ?? true,
    nodes: built.flow.nodes as CreateAutomationInput['nodes'],
    edges: built.flow.edges,
    suppressDuplicates: false,
    singleExecution: false,
  });

  return { ok: true, id: automation._id, name: automation.name, enabled: automation.enabled, link: `/automations/${automation._id}` };
});

const updateInput = zod.object({
  automation: zod.string().describe('Automation id or name'),
  name: zod.string().min(1).max(200).optional(),
  enabled: zod.boolean().optional(),
  nodes: zod.array(nodeSchema).min(2).optional().describe('Full replacement of the flow, together with edges'),
  edges: zod.array(edgeSchema).optional(),
});

const updateAutomation = toolDefinition({
  name: 'update_automation',
  lazy: true,
  description: 'Rename, enable, disable or rebuild an existing automation. Nodes and edges replace the whole flow when given. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(updateInput),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(async (args) => {
  const parsed = updateInput.safeParse(args);
  if (!parsed.success) return toolError(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);

  const service = new AutomationsService();
  const needle = parsed.data.automation.trim().toLowerCase();
  const existing = service.getById(parsed.data.automation) ?? service.list().find((a) => a.name.toLowerCase() === needle);
  if (!existing) return toolError(`No automation "${parsed.data.automation}".`);

  const patch: Parameters<AutomationsService['update']>[1] = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;
  if (parsed.data.nodes) {
    const built = buildFlow(parsed.data.nodes, parsed.data.edges ?? []);
    if ('errors' in built) return toolError(built.errors.join(' '));
    patch.nodes = built.flow.nodes as CreateAutomationInput['nodes'];
    patch.edges = built.flow.edges;
  }

  const updated = await service.update(existing._id, patch);
  if (!updated) return toolError('The automation vanished while updating it.');
  return { ok: true, id: updated._id, name: updated.name, enabled: updated.enabled, link: `/automations/${updated._id}` };
});

const runAutomation = toolDefinition({
  name: 'run_automation',
  lazy: true,
  description: 'Run an automation now, ignoring its trigger. Requires user confirmation.',
  needsApproval: true,
  inputSchema: approvalSchema(zod.object({ automation: zod.string().describe('Automation id or name') })),
  metadata: { adminOnly: true },
}).server<ToolContext['context']>(async (args) => {
  const raw = (args as { automation?: unknown }).automation;
  const automationName = typeof raw === 'string' ? raw.trim() : '';
  const service = new AutomationsService();
  const existing = service.getById(automationName) ?? service.list().find((a) => a.name.toLowerCase() === automationName.toLowerCase());
  if (!existing) return toolError(`No automation "${automationName}".`);

  const output = await container.resolve<AutomationEngine>('automationEngine').triggerManually(existing._id);
  return { ok: true, automation: existing.name, output: output ?? {} };
});

export const automationTools: CoreTool[] = [automationCatalog, createAutomation, updateAutomation, runAutomation];
