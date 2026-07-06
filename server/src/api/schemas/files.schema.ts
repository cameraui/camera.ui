import * as zod from 'zod';

export const filesParamsSchema = zod.object({
  file: zod.string().min(1, 'File is required'),
});

export type FilesParamsInput = zod.output<typeof filesParamsSchema>;
