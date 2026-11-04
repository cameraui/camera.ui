import * as zod from 'zod';

export const patchRemoteSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    directEnabled: zod.boolean().optional(),
    directMode: zod.enum(['cloudflare', 'customDomain']).optional(),
    customDomain: zod
      .object({
        url: zod.url('Must be a valid URL').trim().nullable(),
      })
      .strict()
      .optional(),
    cloudflare: zod
      .object({
        mode: zod.enum(['quick', 'token', 'managed']).optional(),
        hostname: zod.string().trim().min(1, 'Hostname is required').max(253, 'Hostname cannot be more than 253 characters').nullable().optional(),
        token: zod.string().trim().min(1, 'Token is required').nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (data) => {
      if (data.directMode === 'customDomain' && !data.customDomain?.url) {
        return false;
      }
      return true;
    },
    {
      message: 'Custom domain URL is required when directMode is "customDomain"',
      path: ['customDomain', 'url'],
    },
  )
  .refine(
    (data) => {
      if (data.cloudflare?.mode && data.cloudflare.mode !== 'quick' && !data.cloudflare?.hostname) {
        return false;
      }
      return true;
    },
    {
      message: 'Hostname is required when cloudflare.mode is "token" or "managed"',
      path: ['cloudflare', 'hostname'],
    },
  );

export const testRemoteSchema = zod
  .object({
    mode: zod.enum(['cloudflare', 'customDomain']),
  })
  .strict();

export const cloudflareManagedConnectSchema = zod
  .object({
    hostname: zod
      .string()
      .trim()
      .min(1, 'Hostname is required')
      .max(253, 'Hostname cannot be more than 253 characters')
      .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Invalid hostname'),
  })
  .strict();

export const pairInitSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters').optional(),
  })
  .strict();

export const pairPollSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters').optional(),
  })
  .strict();

export const updateServerNameSchema = zod
  .object({
    name: zod.string().trim().min(1, 'Server name is required').max(100, 'Server name cannot be more than 100 characters'),
  })
  .strict();

export const STUN_URL_PATTERN = /^stuns?:[^\s?#]+$/i;
export const TURN_URL_PATTERN = /^turns?:[^\s#]+$/i;

export const putWebrtcSchema = zod
  .object({
    stun: zod.string().trim().regex(STUN_URL_PATTERN, 'Must start with stun: or stuns:').array(),
    turn: zod
      .object({
        urls: zod.string().trim().regex(TURN_URL_PATTERN, 'Must start with turn: or turns:').array().min(1, 'TURN URL is required'),
        username: zod.string().trim().min(1, 'Username is required'),
        credential: zod.string().min(1, 'Password is required').optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type PatchRemoteInput = zod.output<typeof patchRemoteSchema>;
export type TestRemoteInput = zod.output<typeof testRemoteSchema>;
export type PairInitInput = zod.output<typeof pairInitSchema>;
export type PairPollInput = zod.output<typeof pairPollSchema>;
export type CloudflareManagedConnectInput = zod.output<typeof cloudflareManagedConnectSchema>;
export type PutWebrtcInput = zod.output<typeof putWebrtcSchema>;
