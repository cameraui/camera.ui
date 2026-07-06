import * as zod from 'zod';

export const createInstanceSchema = zod.object({
  name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters'),
  url: zod.url('Must be a valid URL').trim(),
  credentials: zod.object({
    username: zod.string().trim().min(1, 'Username is required'),
    password: zod.string().min(1, 'Password is required'),
  }),
});

export const updateInstanceSchema = zod.object({
  name: zod.string().trim().min(1, 'Name is required').max(100, 'Name cannot be more than 100 characters').optional(),
  url: zod.url('Must be a valid URL').trim().optional(),
  credentials: zod
    .object({
      username: zod.string().trim().min(1, 'Username is required'),
      password: zod.string().min(1, 'Password is required'),
    })
    .nullable()
    .optional(),
});

export const instanceParamsSchema = zod.object({
  id: zod.string().min(1, 'ID is required'),
});

export type CreateInstanceInput = zod.output<typeof createInstanceSchema>;
export type UpdateInstanceInput = zod.output<typeof updateInstanceSchema>;
export type InstanceParamsInput = zod.output<typeof instanceParamsSchema>;
