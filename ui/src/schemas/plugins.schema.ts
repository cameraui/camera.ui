import { actionPluginSchema, installPluginSchema, patchPluginConfigJsonSchema } from '@shared/types';

import type { output } from 'zod';

export const pluginActionSchema = actionPluginSchema;
export const pluginInstallSchema = installPluginSchema;
export const pluginPatchConfigJsonSchema = patchPluginConfigJsonSchema;

export type ActionPluginInput = output<typeof actionPluginSchema>;
export type InstallPluginInput = output<typeof installPluginSchema>;
export type PatchPluginConfigJsonInput = output<typeof patchPluginConfigJsonSchema>;
