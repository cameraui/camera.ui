import { z } from 'zod';

import { createUserSchema, loginUserSchema, passwordSchema, patchUserSchema, userPreferencesCamviewViewsLayout } from '@shared/types';

import type { output } from 'zod';

export const authValidationSchema = z
  .object({
    username: z.string().trim().min(1, 'Username is required'),
    password: z.string().trim().min(1, 'Password is required'),
    rememberMe: z.boolean().optional(),
  })
  .strict();

export const userCreateSchema = createUserSchema;
export const userPatchSchema = patchUserSchema;
export const userPasswordSchema = passwordSchema;
export const userPreferencesCamviewViewsLayoutSchema = userPreferencesCamviewViewsLayout;

export type CreateUserInput = output<typeof createUserSchema>;
export type LoginUserInput = output<typeof loginUserSchema>;
export type PatchUserInput = output<typeof patchUserSchema>;
