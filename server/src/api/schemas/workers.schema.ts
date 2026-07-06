import * as zod from 'zod';

export const assignCameraSchema = zod.object({
  cameraId: zod.string().min(1, 'Camera ID is required'),
  agentId: zod.string().min(1, 'Agent ID is required'),
});

export const unassignCameraSchema = zod.object({
  cameraId: zod.string().min(1, 'Camera ID is required'),
});

export const agentParamsSchema = zod.object({
  agentId: zod.string().min(1, 'Agent ID is required'),
});

export const pairWorkerSchema = zod.object({
  code: zod.string().min(1, 'Pairing code is required'),
  agentId: zod.string().min(1, 'Agent ID is required'),
  name: zod.string().min(1, 'Worker name is required'),
});

export const assignPluginSchema = zod.object({
  pluginName: zod.string().min(1, 'Plugin name is required'),
  agentId: zod.string().min(1, 'Agent ID is required'),
});

export const unassignPluginSchema = zod.object({
  pluginName: zod.string().min(1, 'Plugin name is required'),
});

export const patchWorkersConfigSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    address: zod.string().trim().optional(),
    port: zod.number().min(1024, 'Minimum 1024').max(65535, 'Maximum 65535').optional(),
  })
  .strict();

export type AssignCameraInput = zod.output<typeof assignCameraSchema>;
export type UnassignCameraInput = zod.output<typeof unassignCameraSchema>;
export type AgentParamsInput = zod.output<typeof agentParamsSchema>;
export type PairWorkerInput = zod.output<typeof pairWorkerSchema>;
export type PatchWorkersConfigInput = zod.output<typeof patchWorkersConfigSchema>;
