import * as zod from 'zod';

export const patchStorageSchema = zod.record(zod.string(), zod.any());

export const setStorageSchema = zod.object({ key: zod.string() }).strict();

export const submitStorageSchema = zod.object({ key: zod.string(), payload: zod.any() }).strict();

export type PatchStorateInput = zod.output<typeof patchStorageSchema>;
export type SetStorageInput = zod.output<typeof setStorageSchema>;
export type SubmitStorageInput = zod.output<typeof submitStorageSchema>;
