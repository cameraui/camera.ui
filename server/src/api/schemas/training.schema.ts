import * as zod from 'zod';

const boxSchema = zod
  .object({
    label: zod.string().trim().min(1).max(64),
    confidence: zod.number().min(0).max(1),
    x: zod.number().min(0).max(1),
    y: zod.number().min(0).max(1),
    width: zod.number().min(0).max(1),
    height: zod.number().min(0).max(1),
    text: zod.string().trim().max(16).optional(),
  })
  .strict();

export const trainingCandidateParamsSchema = zod.object({
  id: zod.string().trim().min(1),
});

export const trainingSubmissionParamsSchema = zod.object({
  id: zod.string().trim().min(1),
});

export const trainingCandidateListQuerySchema = zod.object({
  cameraId: zod.string().trim().min(1).optional(),
  status: zod.enum(['new', 'verified']).optional(),
});

export const trainingCandidatePatchSchema = zod
  .object({
    boxes: boxSchema.array().max(128).optional(),
    status: zod.enum(['new', 'verified']).optional(),
  })
  .strict();

export const trainingSubmitSchema = zod
  .object({
    ids: zod.string().trim().min(1).array().min(1).max(200),
  })
  .strict();

export const trainingSettingsPatchSchema = zod
  .object({
    enabled: zod.boolean().optional(),
    perCameraLimit: zod.number().min(1).max(5000).optional(),
    minIntervalSeconds: zod.number().min(0).max(3600).optional(),
    retentionDays: zod.number().min(1).max(365).optional(),
  })
  .strict();

export type TrainingCandidateListQuery = zod.output<typeof trainingCandidateListQuerySchema>;
export type TrainingCandidatePatchInput = zod.output<typeof trainingCandidatePatchSchema>;
export type TrainingSettingsPatchInput = zod.output<typeof trainingSettingsPatchSchema>;
export type TrainingSubmitInput = zod.output<typeof trainingSubmitSchema>;
