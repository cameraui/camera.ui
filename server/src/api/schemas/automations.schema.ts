import * as zod from 'zod';

const VALID_NODE_TYPES = [
  'trigger-detection',
  'trigger-sensor',
  'trigger-schedule',
  'trigger-webhook',
  'trigger-system',
  'trigger-manual',
  'trigger-geofence',
  'condition-ifelse',
  'condition-switch',
  'condition-sensorstate',
  'condition-time',
  'action-snapshot',
  'action-sensor',
  'action-notification',
  'action-http',
  'action-delay',
  'action-variable',
  'action-plugin',
  'action-camera-control',
  'action-image-input',
  'action-output',
] as const;

const automationNodeSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
  type: zod.enum(VALID_NODE_TYPES),
  position: zod.object({ x: zod.number(), y: zod.number() }),
  data: zod.record(zod.string(), zod.unknown()),
});

const automationEdgeSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
  source: zod.string().min(1, 'Source is required'),
  target: zod.string().min(1, 'Target is required'),
  sourceHandle: zod.string().optional(),
  targetHandle: zod.string().optional(),
});

function validateEdgeRefs(nodes: { id: string }[], edges: { source: string; target: string }[]): boolean {
  const nodeIds = new Set(nodes.map((n) => n.id));
  return edges.every((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
}

export const createAutomationSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Name is required').max(200, 'Name cannot be more than 200 characters'),
    enabled: zod.boolean().default(false),
    nodes: zod.array(automationNodeSchema).default([]),
    edges: zod.array(automationEdgeSchema).default([]),
    suppressDuplicates: zod.boolean().default(false),
    singleExecution: zod.boolean().default(false),
  })
  .refine((data) => validateEdgeRefs(data.nodes, data.edges), {
    message: 'Edges reference non-existent nodes',
  });

export const patchAutomationSchema = zod.object({
  name: zod.string().trim().min(1, 'Name is required').max(200, 'Name cannot be more than 200 characters').optional(),
  enabled: zod.boolean().optional(),
  nodes: zod.array(automationNodeSchema).optional(),
  edges: zod.array(automationEdgeSchema).optional(),
  suppressDuplicates: zod.boolean().optional(),
  singleExecution: zod.boolean().optional(),
});

export const importBlueprintSchema = zod
  .object({
    version: zod.literal(1),
    name: zod.string().trim().min(1, 'Name is required').max(200, 'Name cannot be more than 200 characters'),
    description: zod.string().trim().optional(),
    nodes: zod.array(automationNodeSchema).min(1, 'Blueprint must contain at least one node'),
    edges: zod.array(automationEdgeSchema),
  })
  .refine((data) => validateEdgeRefs(data.nodes, data.edges), {
    message: 'Edges reference non-existent nodes',
  });

export const webhookBodySchema = zod.record(zod.string(), zod.unknown()).optional().default({});

export const locationBodySchema = zod.record(zod.string(), zod.unknown()).optional().default({});

export const automationParamsSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
});

export const automationStoreQuerySchema = zod.object({
  refresh: zod.coerce.boolean().optional(),
});

export const automationStoreParamsSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
});

export const webhookParamsSchema = zod.object({
  webhookId: zod.string().min(1, 'Webhook ID is required'),
});

export const geofenceParamsSchema = zod.object({
  geofenceId: zod.string().min(1, 'Geofence ID is required'),
});

export type CreateAutomationInput = zod.output<typeof createAutomationSchema>;
export type PatchAutomationInput = zod.output<typeof patchAutomationSchema>;
export type ImportBlueprintInput = zod.output<typeof importBlueprintSchema>;
export type WebhookBodyInput = zod.output<typeof webhookBodySchema>;
export type LocationBodyInput = zod.output<typeof locationBodySchema>;
export type AutomationParamsInput = zod.output<typeof automationParamsSchema>;
export type AutomationStoreQueryInput = zod.output<typeof automationStoreQuerySchema>;
export type AutomationStoreParamsInput = zod.output<typeof automationStoreParamsSchema>;
export type WebhookParamsInput = zod.output<typeof webhookParamsSchema>;
export type GeofenceParamsInput = zod.output<typeof geofenceParamsSchema>;
