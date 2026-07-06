import * as zod from 'zod';

export const updateServerSchema = zod
  .object({
    version: zod.string().trim().optional().default('latest'),
  })
  .strict();

export const patchServerSchema = zod
  .object({
    serverAddresses: zod.union([zod.ipv4().trim(), zod.ipv6().trim()]).array().default([]),
  })
  .strict();

export const serverChangelogQuerySchema = zod
  .object({
    version: zod.string().trim(),
  })
  .strict();

export type PatchServerInput = zod.output<typeof patchServerSchema>;
export type UpdateServerInput = zod.output<typeof updateServerSchema>;
export type ServerChangelogQueryInput = zod.output<typeof serverChangelogQuerySchema>;
