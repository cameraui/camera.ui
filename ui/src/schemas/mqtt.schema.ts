import { patchMqttSchema } from '@shared/types';

import type { output } from 'zod';

export const mqttPatchSchema = patchMqttSchema;

export type PatchMqttInput = output<typeof patchMqttSchema>;
