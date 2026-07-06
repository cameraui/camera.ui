import * as zod from 'zod';

export const frameWorkerParamsSchema = zod.object({
  frameworkername: zod.string().min(1, 'Frame worker name is required'),
});

export type FrameWorkerParamsInput = zod.output<typeof frameWorkerParamsSchema>;
