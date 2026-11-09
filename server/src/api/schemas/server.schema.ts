import * as zod from 'zod';

import { LANGUAGES } from './users.schema.js';

export const updateServerSchema = zod
  .object({
    version: zod.string().trim().optional().default('latest'),
    confirmWorkers: zod.boolean().optional(),
  })
  .strict();

export const patchServerSchema = zod
  .object({
    serverAddresses: zod.union([zod.ipv4().trim(), zod.ipv6().trim()]).array().default([]),
    localUrl: zod
      .union([zod.literal(''), zod.url({ protocol: /^https?$/ })])
      .default('')
      .transform((value) => value.replace(/\/+$/, '')),
  })
  .strict();

export const serverLanguageSchema = zod
  .object({
    language: zod.enum(LANGUAGES),
  })
  .strict();

export const serverChangelogQuerySchema = zod
  .object({
    version: zod.string().trim(),
  })
  .strict();

export type PatchServerInput = zod.output<typeof patchServerSchema>;
export type UpdateServerInput = zod.output<typeof updateServerSchema>;
export type ServerLanguageInput = zod.output<typeof serverLanguageSchema>;
export type ServerChangelogQueryInput = zod.output<typeof serverChangelogQuerySchema>;
