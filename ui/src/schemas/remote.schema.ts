import { patchRemoteSchema } from '@shared/types';

import type { output } from 'zod';

export const remotePatchSchema = patchRemoteSchema;

export type PatchRemoteInput = output<typeof patchRemoteSchema>;
