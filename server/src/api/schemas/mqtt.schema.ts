import * as zod from 'zod';

const TOPIC_PREFIX_REGEX = /^[\w-]+(\/[\w-]+)*$/;

export const patchMqttSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    mode: zod.enum(['external', 'embedded']).optional(),
    broker: zod
      .object({
        port: zod.number().int().min(1).max(65535).optional(),
        username: zod.string().trim().max(200, 'Username cannot be more than 200 characters').nullable().optional(),
        password: zod.string().max(500, 'Password cannot be more than 500 characters').nullable().optional(),
      })
      .strict()
      .optional(),
    host: zod.string().trim().min(1, 'Host is required').max(253, 'Host cannot be more than 253 characters').nullable().optional(),
    port: zod.number().int().min(1).max(65535).optional(),
    protocol: zod.enum(['mqtt', 'mqtts']).optional(),
    username: zod.string().trim().max(200, 'Username cannot be more than 200 characters').nullable().optional(),
    password: zod.string().max(500, 'Password cannot be more than 500 characters').nullable().optional(),
    clientId: zod.string().trim().min(1, 'Client ID is required').max(128, 'Client ID cannot be more than 128 characters').optional(),
    topicPrefix: zod
      .string()
      .trim()
      .min(1, 'Topic prefix is required')
      .max(128, 'Topic prefix cannot be more than 128 characters')
      .regex(TOPIC_PREFIX_REGEX, 'Topic prefix may only contain letters, numbers, "_", "-" and "/" separators')
      .optional(),
    tls: zod
      .object({
        rejectUnauthorized: zod.boolean().optional(),
        ca: zod.string().trim().nullable().optional(),
        cert: zod.string().trim().nullable().optional(),
        key: zod.string().trim().nullable().optional(),
      })
      .strict()
      .optional(),
    haDiscovery: zod
      .object({
        enabled: zod.boolean().optional(),
        prefix: zod
          .string()
          .trim()
          .min(1, 'Discovery prefix is required')
          .max(128, 'Discovery prefix cannot be more than 128 characters')
          .regex(TOPIC_PREFIX_REGEX, 'Discovery prefix may only contain letters, numbers, "_", "-" and "/" separators')
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const testMqttSchema = patchMqttSchema;

export type PatchMqttInput = zod.output<typeof patchMqttSchema>;
export type TestMqttInput = zod.output<typeof testMqttSchema>;
