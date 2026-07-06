import * as zod from 'zod';

export const verify2FASchema = zod
  .object({
    tempToken: zod.string().trim().min(1, 'Temporary token is required'),
    code: zod.string().trim().min(1, 'Code is required'),
  })
  .strict();

export const enable2FASchema = zod
  .object({
    code: zod.string().trim().length(6, 'Code must be 6 digits'),
  })
  .strict();

export const disable2FASchema = zod
  .object({
    code: zod.string().trim().min(1, 'Code is required'),
  })
  .strict();

export const regenerateBackupCodesSchema = zod
  .object({
    code: zod.string().trim().min(1, 'Code is required'),
  })
  .strict();

export const oauthTokenSchema = zod.object({
  grant_type: zod.string().optional(),
  username: zod.string().trim().min(1, 'Username is required'),
  password: zod.string().min(1, 'Password is required'),
  scope: zod.string().optional(),
  client_id: zod.string().optional(),
  client_secret: zod.string().optional(),
});

export const refreshTokenSchema = zod.object({
  refresh_token: zod.string().min(1, 'Refresh token is required'),
});

export const sessionParamsSchema = zod.object({
  id: zod.string(),
});

export type RefreshTokenInput = zod.output<typeof refreshTokenSchema>;
export type Verify2FAInput = zod.output<typeof verify2FASchema>;
export type Enable2FAInput = zod.output<typeof enable2FASchema>;
export type Disable2FAInput = zod.output<typeof disable2FASchema>;
export type RegenerateBackupCodesInput = zod.output<typeof regenerateBackupCodesSchema>;
export type OAuthTokenInput = zod.output<typeof oauthTokenSchema>;
export type SessionParamsInput = zod.output<typeof sessionParamsSchema>;
