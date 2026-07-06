import { patchServerSchema, updateServerSchema } from '@shared/types';

import type { output } from 'zod';

export const serverPatchSchema = patchServerSchema;
export const serverUpdateSchema = updateServerSchema;

export type PatchServerInput = output<typeof patchServerSchema>;
export type UpdateServerInput = output<typeof updateServerSchema>;
