import * as zod from 'zod';

import { DEFAULT_CONFIG_HOST, DEFAULT_CONFIG_LOGGER, DEFAULT_CONFIG_PLUGINS, DEFAULT_CONFIG_PORT, DEFAULT_CONFIG_SSL } from '../../services/config/defaults.js';
import { WorkerCapability } from '../../workers/types.js';

export const logLevelSchema = zod.union([zod.literal('info'), zod.literal('debug'), zod.literal('warn'), zod.literal('error'), zod.literal('trace')]);

export const loggerSchema = zod
  .object({
    level: logLevelSchema.optional().default(DEFAULT_CONFIG_LOGGER.level),
  })
  .strict();

export const iConfigSSLSchema = zod
  .object({
    certFile: zod.string().trim(),
    keyFile: zod.string().trim(),
    caFile: zod.string().trim(),
    addresses: zod.string().trim().array().optional().default(DEFAULT_CONFIG_SSL.addresses!),
  })
  .strict();

export const pluginsSchema = zod
  .object({
    disabledPlugins: zod.string().trim().array().default(DEFAULT_CONFIG_PLUGINS.disabledPlugins),
    allowBuildScripts: zod.boolean().default(DEFAULT_CONFIG_PLUGINS.allowBuildScripts ?? false),
    betaVersions: zod.boolean().default(DEFAULT_CONFIG_PLUGINS.betaVersions ?? false),
  })
  .strict();

export const corsSchema = zod
  .object({
    origins: zod.string().trim().array().optional().default([]),
  })
  .strict()
  .optional();

const validCapabilities = Object.values(WorkerCapability) as [string, ...string[]];

export const workersSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    address: zod.string().trim().optional(),
    port: zod.number().min(1024, 'Minimum 1024').max(65535, 'Maximum 65535').optional(),
  })
  .strict()
  .optional();

export const workerSchema = zod
  .object({
    master: zod.string().trim().optional(),
    apiPort: zod.number().min(1, 'Minimum 1').max(65535, 'Maximum 65535').optional(),
    pairingCode: zod.string().trim().optional(),
    name: zod.string().trim().optional(),
    capabilities: zod.enum(validCapabilities).array().optional(),
  })
  .strict()
  .optional();

export const patchConfigSchema = zod
  .object({
    port: zod.number().min(1024, 'Min port range').max(49151, 'Max port range').default(DEFAULT_CONFIG_PORT),
    host: zod.string().trim().optional().default(DEFAULT_CONFIG_HOST),
    ffmpegPath: zod.string().trim().optional(),
    ssl: iConfigSSLSchema,
    logger: loggerSchema,
    plugins: pluginsSchema,
    cors: corsSchema,
    workers: workersSchema,
    worker: workerSchema,
  })
  .strip();

export const configQuerySchema = zod.object({
  json: zod.coerce.boolean().optional(),
});

export type PatchConfigInput = zod.output<typeof patchConfigSchema>;
export type ConfigQueryInput = zod.output<typeof configQuerySchema>;
