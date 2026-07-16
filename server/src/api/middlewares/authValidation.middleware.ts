import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { container } from 'tsyringe';

import { AuthService } from '../services/auth.service.js';
import { UsersService } from '../services/users.service.js';
import { API_TOKEN_PREFIX } from '../types/index.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '../../services/config/index.js';
import type { DBUser } from '../database/types.js';
import type { AuthLoginRequest, AuthNewLoginRequest, JwtTokenDecoded, TwoFactorPendingResponse } from '../types/index.js';

const FIRST_LOGIN_ALLOWED_ROUTES: ReadonlySet<string> = new Set(['GET /api/auth/check', 'POST /api/backup/restore']);

export function hashPassword(salt: string, password: string): string {
  return createHmac('sha512', salt).update(password).digest('base64');
}

export function verifyUserPassword(username: string, password: string): DBUser | undefined {
  const user = new UsersService().findByName(username);
  if (!user) {
    return undefined;
  }

  const [salt, expected] = user.password.split('$');
  return hashPassword(salt, password) === expected ? user : undefined;
}

export async function isPasswordAndUserMatch(req: FastifyRequest<AuthNewLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
  const configService = container.resolve<ConfigService>('configService');
  req.locals = {};

  const service = new UsersService();
  const user = service.findByName(req.body.username);

  if (!user) {
    return reply.code(403).send({
      statusCode: 403,
      message: 'Forbidden',
    });
  }

  const passwordFields = user.password.split('$');
  const hash = hashPassword(passwordFields[0], req.body.password);

  if (hash !== passwordFields[1]) {
    return reply.code(401).send({
      statusCode: 401,
      message: 'Invalid username or password',
    });
  }

  if (user.twoFactor?.enabled) {
    const tempToken = jwt.sign(
      {
        _id: user._id,
        purpose: '2fa_pending',
        kind: req.body.kind,
        persistent: req.body.persistent,
        device: req.body.device,
      },
      configService.SECRETS.jwt2faKey,
      { expiresIn: '5m' },
    );
    const response: TwoFactorPendingResponse = {
      requires2fa: true,
      tempToken,
    };
    return reply.code(200).send(response);
  }

  req.locals.user = user;
  return {} as FastifyReply;
}

export async function validJWTNeeded(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
  const configService = container.resolve<ConfigService>('configService');
  const authService = new AuthService();
  const userService = new UsersService();

  req.locals = {};

  const authHeader = req.headers.authorization ?? (req.query.token ? `Bearer ${req.query.token}` : undefined);
  if (!authHeader) {
    return reply.code(401).send({ statusCode: 401, message: 'Unauthorized' });
  }

  const authorization = authHeader.split(/\s+/);
  if (authorization[0] !== 'Bearer' || !authorization[1]) {
    return reply.code(401).send({ statusCode: 401, message: 'Unauthorized' });
  }

  const accessToken = authorization[1];

  if (accessToken.startsWith(API_TOKEN_PREFIX)) {
    const dbToken = authService.findByAccessToken(accessToken);
    if (dbToken?.type !== 'api') {
      return reply.code(401).send({ statusCode: 401, message: 'Token revoked' });
    }

    const user = userService.findById(dbToken.user_id);
    if (!user) {
      return reply.code(403).send({ statusCode: 403, message: 'User is not in database' });
    }

    req.locals = { user, authKind: 'api' };
    authService.bumpLastSeen(dbToken.id, req.ip);

    return {} as FastifyReply;
  }

  let decoded: JwtTokenDecoded;
  try {
    decoded = jwt.verify(accessToken, configService.SECRETS.jwtAccessKey) as JwtTokenDecoded;
  } catch (error: any) {
    const expired = error?.name === 'TokenExpiredError';
    return reply.code(401).send({ statusCode: 401, message: expired ? 'Token expired' : 'Unauthorized' });
  }

  const dbToken = authService.findByAccessToken(accessToken);
  if (!dbToken) {
    return reply.code(401).send({ statusCode: 401, message: 'Token revoked' });
  }

  const user = userService.findById(decoded._id);
  if (!user) {
    return reply.code(403).send({ statusCode: 403, message: 'User is not in database' });
  }

  req.locals = { user, jwt: decoded, authKind: 'session' };

  if (user.firstLogin) {
    const routeUrl = req.routeOptions?.url;
    const params = req.params as Record<string, string | undefined>;
    const isOwnUserRoute = routeUrl === '/api/users/:username' && params.username === user.username;
    const isGloballyAllowed = routeUrl ? FIRST_LOGIN_ALLOWED_ROUTES.has(`${req.method} ${routeUrl}`) : false;
    const allowed = isGloballyAllowed || ((req.method === 'PATCH' || req.method === 'GET') && isOwnUserRoute);
    if (!allowed) {
      return reply.code(403).send({ statusCode: 403, message: 'Password change required before first use' });
    }
  }

  authService.bumpLastSeen(dbToken.id, req.ip);

  return {} as FastifyReply;
}
