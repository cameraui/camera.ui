import { AuthController } from '../controllers/auth.controller.js';
import { onlyAdminCanDoThisAction, onlySessionCanDoThisAction } from '../middlewares/authPermission.middleware.js';
import { isPasswordAndUserMatch, validJWTNeeded } from '../middlewares/authValidation.middleware.js';
import { pages } from '../middlewares/pagination.middleware.js';
import {
  apiTokenParamsSchema,
  createApiTokenSchema,
  disable2FASchema,
  enable2FASchema,
  oauthTokenSchema,
  refreshTokenSchema,
  regenerateBackupCodesSchema,
  sessionParamsSchema,
  verify2FASchema,
} from '../schemas/auth.schema.js';
import { paginationQuerySchema } from '../schemas/common.schema.js';
import { loginUserSchema } from '../schemas/users.schema.js';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const AuthRoute: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const authController = new AuthController(app);

  app.route({
    url: '/check',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: authController.check.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Check whether the current JWT is valid and return server addresses',
    },
  });

  app.route({
    url: '/me',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: authController.me.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Get the current authenticated user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/sessions',
    method: 'GET',
    preValidation: [validJWTNeeded],
    preSerialization: [pages],
    handler: authController.list.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'List active sessions for the current user',
      querystring: paginationQuerySchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/sessions/all',
    method: 'GET',
    preValidation: [validJWTNeeded, onlyAdminCanDoThisAction],
    preSerialization: [pages],
    handler: authController.listAll.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'List all active sessions across all users (admin only)',
      querystring: paginationQuerySchema,
    },
  });

  app.route({
    url: '/sessions',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: authController.logoutOthers.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Revoke all other active sessions for the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/sessions/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: authController.logoutByToken.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Revoke a specific session by token id',
      params: sessionParamsSchema,
    },
  });

  app.route({
    url: '/tokens',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: authController.listApiTokens.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'List API tokens for the current user',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/tokens',
    method: 'POST',
    preValidation: [validJWTNeeded, onlySessionCanDoThisAction],
    handler: authController.createApiToken.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Create a long-lived API token (plain token is returned once)',
      body: createApiTokenSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/tokens/:id',
    method: 'DELETE',
    preValidation: [validJWTNeeded],
    handler: authController.deleteApiToken.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Revoke an API token',
      params: apiTokenParamsSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/login',
    method: 'POST',
    preValidation: [isPasswordAndUserMatch],
    handler: authController.login.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Log in with username and password',
      body: loginUserSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/token',
    method: 'POST',
    handler: authController.oauthToken.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'OAuth2 password-flow token endpoint (used by the Swagger Authorize dialog)',
      body: oauthTokenSchema,
    },
  });

  app.route({
    url: '/logout',
    method: 'POST',
    handler: authController.logout.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Revoke the current session (Bearer token in Authorization header)',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/refresh',
    method: 'POST',
    handler: authController.refresh.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Rotate an access token using a refresh token',
      body: refreshTokenSchema,
    },
  });

  app.route({
    url: '/2fa/status',
    method: 'GET',
    preValidation: [validJWTNeeded],
    handler: authController.twoFactorStatus.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Get the 2FA status for the current user',
    },
  });

  app.route({
    url: '/2fa/setup',
    method: 'POST',
    preValidation: [validJWTNeeded, onlySessionCanDoThisAction],
    handler: authController.setup2FA.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Generate a new TOTP secret and QR code for 2FA setup',
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/2fa/enable',
    method: 'POST',
    preValidation: [validJWTNeeded, onlySessionCanDoThisAction],
    handler: authController.enable2FA.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Enable 2FA by confirming the TOTP code',
      body: enable2FASchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/2fa/disable',
    method: 'POST',
    preValidation: [validJWTNeeded, onlySessionCanDoThisAction],
    handler: authController.disable2FA.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Disable 2FA using a valid TOTP or backup code',
      body: disable2FASchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/2fa/backup-codes',
    method: 'POST',
    preValidation: [validJWTNeeded, onlySessionCanDoThisAction],
    handler: authController.regenerateBackupCodes.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Regenerate 2FA backup codes',
      body: regenerateBackupCodesSchema,
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    url: '/verify-2fa',
    method: 'POST',
    handler: authController.verify2FA.bind(authController),
    schema: {
      tags: ['Auth'],
      summary: 'Complete login by verifying a pending 2FA challenge',
      body: verify2FASchema,
    },
  });
};
