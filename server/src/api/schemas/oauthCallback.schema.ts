import * as zod from 'zod';

export const oauthCallbackParamsSchema = zod.object({
  pluginId: zod.string().min(1, 'Plugin id is required'),
});

export const oauthCallbackQuerySchema = zod.object({
  code: zod.string().optional(),
  state: zod.string().optional(),
  error: zod.string().optional(),
});

export type OAuthCallbackParamsInput = zod.output<typeof oauthCallbackParamsSchema>;
export type OAuthCallbackQueryInput = zod.output<typeof oauthCallbackQuerySchema>;
