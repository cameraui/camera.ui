import * as zod from 'zod';

export const downloadParamsSchema = zod.object({
  token: zod.string().min(1, 'Token is required'),
});

export type DownloadParamsInput = zod.output<typeof downloadParamsSchema>;
