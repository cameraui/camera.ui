import jwt from 'jsonwebtoken';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { inject } from '../../container.js';
import { streamTokenMatches } from '../../utils/utils.js';
import { AuthService } from '../services/auth.service.js';
import { UsersService } from '../services/users.service.js';
import { API_TOKEN_PREFIX } from '../types/index.js';
import { AttemptLimiter } from '../utils/attempt-limiter.js';
import { isManagedDevice, mustSetPassword } from '../utils/utils.js';

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { DBUser } from '../database/types.js';
import type { AuthLoginRequest, AuthNewLoginRequest, CamerasStreamRequest, JwtTokenDecoded, TwoFactorPendingResponse } from '../types/index.js';

const FIRST_LOGIN_ALLOWED_ROUTES: ReadonlySet<string> = new Set([
  'GET /api/auth/check',
  'GET /api/auth/me',
  'POST /api/backup/restore',
  'DELETE /api/backup/restore',
  'POST /api/backup/restore/confirm',
  'POST /api/backup/restore/uploads',
  'GET /api/backup/restore/uploads/:id',
  'PATCH /api/backup/restore/uploads/:id',
  'POST /api/backup/restore/uploads/:id/complete',
  'DELETE /api/backup/restore/uploads/:id',
  'POST /api/backup/restore/move',
  'GET /api/backup/restore/move',
  'DELETE /api/backup/restore/move',
]);

const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 10;
const UNKNOWN_USER_PASSWORD = '$';

const loginFailures = new AttemptLimiter(LOGIN_FAILURE_WINDOW_MS, LOGIN_MAX_FAILURES);

export function hashPassword(salt: string, password: string): string {
  return createHmac('sha512', salt).update(password).digest('base64');
}

export function storedPassword(password: string): string {
  const salt = randomBytes(16).toString('base64');
  return `${salt}$${hashPassword(salt, password)}`;
}

export function verifyLogin(username: string, password: string, ip: string): DBUser | 'limited' | undefined {
  const key = `${username}:${ip}`;
  if (loginFailures.isLimited(key)) return 'limited';

  const user = new UsersService().findByName(username);
  const [salt, expected] = (user?.password ?? UNKNOWN_USER_PASSWORD).split('$');
  const hash = Buffer.from(hashPassword(salt, password));
  const wanted = Buffer.from(expected);

  if (!user || hash.length !== wanted.length || !timingSafeEqual(hash, wanted)) {
    loginFailures.recordFailure(key);
    return undefined;
  }

  loginFailures.clear(key);
  return user;
}

export function currentPasswordRefusal(req: FastifyRequest<AuthLoginRequest>, currentPassword: string | undefined): { statusCode: number; message: string } | undefined {
  // behind Home Assistant or a proxy the account never typed a password
  if (isManagedDevice(req.locals.jwt?.device_id)) return undefined;
  if (!currentPassword) return { statusCode: 403, message: 'Current password is required' };

  const verified = verifyLogin(req.locals.user!.username, currentPassword, req.ip);
  if (verified === 'limited') return { statusCode: 429, message: 'Too many attempts. Try again later.' };
  if (!verified) return { statusCode: 403, message: 'Current password is wrong' };
  return undefined;
}

export async function isPasswordAndUserMatch(req: FastifyRequest<AuthNewLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
  const configService = inject('configService');
  req.locals = {};

  const user = verifyLogin(req.body.username, req.body.password, req.ip);

  if (user === 'limited') {
    return reply.code(429).send({
      statusCode: 429,
      message: 'Too many attempts. Try again later.',
    });
  }

  if (!user) {
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
  const configService = inject('configService');
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

  const dbToken = authService.resolveAccessToken(accessToken)?.token;
  if (!dbToken) {
    return reply.code(401).send({ statusCode: 401, message: 'Token revoked' });
  }

  const user = userService.findById(decoded._id);
  if (!user) {
    return reply.code(403).send({ statusCode: 403, message: 'User is not in database' });
  }

  req.locals = { user, jwt: decoded, authKind: 'session' };

  if (mustSetPassword(user, dbToken)) {
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

export async function validStreamTokenNeeded(req: FastifyRequest<CamerasStreamRequest>, reply: FastifyReply): Promise<FastifyReply> {
  const configService = inject('configService');

  if (!streamTokenMatches(req.query.token, configService.STREAM_URL_TOKEN)) {
    return reply.code(403).send({ statusCode: 403, message: 'Forbidden' });
  }

  return {} as FastifyReply;
}
