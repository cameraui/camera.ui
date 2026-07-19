import jwt from 'jsonwebtoken';
import { container } from 'tsyringe';

import { buildHttpsUrl, fetchViableNetworkAddresses } from '@camera.ui/common/network';

import { verifyUserPassword } from '../middlewares/authValidation.middleware.js';
import { AuthService } from '../services/auth.service.js';
import { ServerService } from '../services/server.service.js';
import { TwoFactorService } from '../services/twoFactor.service.js';
import { UsersService } from '../services/users.service.js';
import { TOKEN_LIFETIME } from '../types/index.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { RemoteAccessManager } from '../../remote/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { DBUser } from '../database/types.js';
import type { LoginUserInput } from '../schemas/users.schema.js';
import type {
  ApiTokenCreatedResponse,
  ApiTokenCreateRequest,
  ApiTokenInfo,
  Auth2FADisableRequest,
  Auth2FAEnableRequest,
  Auth2FARegenerateBackupCodesRequest,
  Auth2FAVerifyRequest,
  AuthLoginRequest,
  AuthNewLoginRequest,
  AuthOAuthTokenRequest,
  AuthParamsRequest,
  AuthRefreshRequest,
  ClientKind,
  DBToken,
  JwtPayload,
  JwtTokenResponse,
  PaginationRequest,
  SessionInfo,
  SessionResponse,
  TwoFactorBackupCodesResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  UserData,
} from '../types/index.js';

export class AuthController {
  private configService: ConfigService;
  private service: AuthService;
  private userService: UsersService;
  private twoFactorService: TwoFactorService;
  private serverService: ServerService;
  private remoteAccessManager: RemoteAccessManager;

  constructor(_app: FastifyInstance) {
    this.configService = container.resolve<ConfigService>('configService');
    this.service = new AuthService();
    this.userService = new UsersService();
    this.twoFactorService = new TwoFactorService();
    this.serverService = new ServerService();
    this.remoteAccessManager = container.resolve<RemoteAccessManager>('remoteAccessManager');
  }

  public check(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      const sessionStatus: SessionResponse = {
        status: 'OK',
        ...this.getAddresses(),
      };

      return reply.code(200).send(sessionStatus);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public me(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply {
    try {
      const user = req.locals.user!;
      return reply.code(200).send({
        _id: user._id,
        username: user.username,
        avatar: user.avatar,
        role: user.role,
        firstLogin: user.firstLogin,
        language: user.preferences.language ?? 'auto',
      });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public list(req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | SessionInfo[] {
    try {
      const user = req.locals.user!;
      const tokens = this.service.listSessionsByUserId(user._id);
      return this.toSessionInfos(tokens, req);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public listAll(req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | SessionInfo[] {
    try {
      const tokens = this.service.listTokens().filter((t) => t.type !== 'api');
      return this.toSessionInfos(tokens, req);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async login(req: FastifyRequest<AuthNewLoginRequest>, reply: FastifyReply): Promise<FastifyReply | void> {
    try {
      const user = req.locals.user!;
      const body = req.body;

      const userData = await this.issueSession(user, body, req);
      return reply.code(201).send(userData);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async oauthToken(req: FastifyRequest<AuthOAuthTokenRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = verifyUserPassword(req.body.username, req.body.password);
      if (!user) {
        return reply.code(400).send({ error: 'invalid_grant', error_description: 'Invalid username or password' });
      }

      if (user.twoFactor?.enabled) {
        return reply.code(400).send({
          error: 'invalid_grant',
          error_description: '2FA is enabled for this account!',
        });
      }

      const userData = await this.issueSession(
        user,
        {
          username: user.username,
          password: '',
          kind: 'web',
          persistent: false,
          device: { id: 'swagger-ui', name: 'Swagger UI' },
        },
        req,
      );

      return reply.code(200).send({
        access_token: userData.access_token,
        token_type: 'Bearer',
        expires_in: TOKEN_LIFETIME.ACCESS_SECONDS,
      });
    } catch (error: any) {
      return reply.code(500).send({ error: 'server_error', error_description: error.message });
    }
  }

  public async logout(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const authorization = req.headers.authorization?.split(/\s+/);
      const accessToken = authorization?.[0] === 'Bearer' ? authorization[1] : undefined;

      if (accessToken) {
        await this.service.invalidateByAccessToken(accessToken);
      }

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async logoutByToken(req: FastifyRequest<AuthLoginRequest & AuthParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const requester = req.locals.user!;
      const targetId = req.params.id;
      if (!targetId) {
        return reply.code(400).send({ statusCode: 400, message: 'Missing token id' });
      }

      const target = this.service.findById(targetId);
      if (!target) {
        return reply.code(404).send({ statusCode: 404, message: 'Token not found' });
      }

      const isAdmin = requester.role === 'admin' || requester.role === 'master';
      if (target.user_id !== requester._id && !isAdmin) {
        return reply.code(403).send({ statusCode: 403, message: 'Forbidden' });
      }

      await this.service.invalidateById(target.id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async logoutOthers(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const requester = req.locals.user!;
      const authorization = req.headers.authorization?.split(/\s+/);
      const currentAccessToken = authorization?.[0] === 'Bearer' ? authorization[1] : undefined;
      const current = currentAccessToken ? this.service.findByAccessToken(currentAccessToken) : undefined;

      const tokens = this.service.listSessionsByUserId(requester._id).filter((t) => t.id !== current?.id);
      await Promise.all(tokens.map((t) => this.service.invalidateById(t.id)));

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async logoutAll(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const requester = req.locals.user!;
      const isAdmin = requester.role === 'admin' || requester.role === 'master';

      if (isAdmin) {
        await this.service.invalidateAllSessions();
      } else {
        await this.service.invalidateSessionsByUserId(requester._id);
      }

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async refresh(req: FastifyRequest<AuthRefreshRequest>, reply: FastifyReply): Promise<FastifyReply> {
    if (!req.body.refresh_token) {
      return reply.code(403).send({ statusCode: 403, message: 'Refresh token is required' });
    }

    try {
      const oldToken = this.service.findByRefreshToken(req.body.refresh_token);

      if (!oldToken) {
        return reply.code(401).send({ statusCode: 401, message: 'Invalid refresh token' });
      }

      if (oldToken.refresh_token_expires_at < Date.now()) {
        await this.service.invalidateById(oldToken.id);
        return reply.code(401).send({ statusCode: 401, message: 'Refresh token expired' });
      }

      const user = this.userService.findById(oldToken.user_id);
      if (!user) {
        await this.service.invalidateById(oldToken.id);
        return reply.code(401).send({ statusCode: 401, message: 'User not found' });
      }

      const newAccessToken = this.signAccessToken(user, oldToken.device.id);
      const rotated = await this.service.rotate(oldToken, newAccessToken);

      const response: JwtTokenResponse = {
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token,
        access_token_expires_at: Date.now() + TOKEN_LIFETIME.ACCESS_SECONDS * 1000,
        refresh_token_expires_at: rotated.refresh_token_expires_at,
      };

      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public twoFactorStatus(req: FastifyRequest, reply: FastifyReply): FastifyReply {
    try {
      const user = req.locals.user!;
      const status: TwoFactorStatusResponse = {
        enabled: user.twoFactor?.enabled ?? false,
        verifiedAt: user.twoFactor?.verifiedAt,
        backupCodesCount: user.twoFactor?.backupCodes?.length,
      };
      return reply.code(200).send(status);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async setup2FA(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;

      if (user.twoFactor?.enabled) {
        return reply.code(400).send({
          statusCode: 400,
          message: '2FA already enabled',
        });
      }

      const secret = this.twoFactorService.generateSecret();
      const qrCode = await this.twoFactorService.generateQRCode(user.username, secret);

      await this.userService.patchUser(user.username, {
        twoFactor: {
          enabled: false,
          secret: this.twoFactorService.encryptSecret(secret),
        },
      });

      const response: TwoFactorSetupResponse = { qrCode, secret };
      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async enable2FA(req: FastifyRequest<AuthLoginRequest & Auth2FAEnableRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;

      if (!user.twoFactor?.secret) {
        return reply.code(400).send({
          statusCode: 400,
          message: 'Setup 2FA first',
        });
      }

      if (user.twoFactor.enabled) {
        return reply.code(400).send({
          statusCode: 400,
          message: '2FA already enabled',
        });
      }

      const secret = this.twoFactorService.decryptSecret(user.twoFactor.secret);
      const isValidCode = await this.twoFactorService.verifyToken(req.body.code, secret);
      if (!isValidCode) {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid code',
        });
      }

      const backupCodes = this.twoFactorService.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map((code) => this.twoFactorService.hashBackupCode(code));

      await this.userService.patchUser(user.username, {
        twoFactor: {
          enabled: true,
          secret: user.twoFactor.secret,
          backupCodes: hashedBackupCodes,
          verifiedAt: new Date(),
        },
      });

      const response: TwoFactorBackupCodesResponse = { backupCodes };
      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async disable2FA(req: FastifyRequest<AuthLoginRequest & Auth2FADisableRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;

      if (!user.twoFactor?.enabled) {
        return reply.code(400).send({
          statusCode: 400,
          message: '2FA not enabled',
        });
      }

      const secret = this.twoFactorService.decryptSecret(user.twoFactor.secret!);
      const isValidTotp = await this.twoFactorService.verifyToken(req.body.code, secret);
      const isValidBackup = user.twoFactor.backupCodes && this.twoFactorService.verifyBackupCode(req.body.code, user.twoFactor.backupCodes) !== -1;
      const isValid = isValidTotp || isValidBackup;

      if (!isValid) {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid code',
        });
      }

      await this.userService.patchUser(user.username, {
        twoFactor: {
          enabled: false,
          secret: undefined,
          backupCodes: undefined,
          verifiedAt: undefined,
        },
      });

      return reply.code(200).send({ message: '2FA disabled' });
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async regenerateBackupCodes(req: FastifyRequest<AuthLoginRequest & Auth2FARegenerateBackupCodesRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;

      if (!user.twoFactor?.enabled) {
        return reply.code(400).send({
          statusCode: 400,
          message: '2FA not enabled',
        });
      }

      const secret = this.twoFactorService.decryptSecret(user.twoFactor.secret!);
      const isValidCode = await this.twoFactorService.verifyToken(req.body.code, secret);
      if (!isValidCode) {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid code',
        });
      }

      const backupCodes = this.twoFactorService.generateBackupCodes();
      const hashedBackupCodes = backupCodes.map((code) => this.twoFactorService.hashBackupCode(code));

      await this.userService.patchUser(user.username, {
        twoFactor: {
          ...user.twoFactor,
          backupCodes: hashedBackupCodes,
        },
      });

      const response: TwoFactorBackupCodesResponse = { backupCodes };
      return reply.code(200).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async verify2FA(req: FastifyRequest<Auth2FAVerifyRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      interface TempTokenPayload {
        _id: string;
        purpose: string;
        kind: ClientKind;
        persistent: boolean;
        device: { id: string; name: string };
      }
      let decoded: TempTokenPayload;
      try {
        decoded = jwt.verify(req.body.tempToken, this.configService.SECRETS.jwt2faKey) as TempTokenPayload;
      } catch {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid or expired token',
        });
      }

      if (decoded.purpose !== '2fa_pending') {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid token',
        });
      }

      const user = this.userService.findById(decoded._id);
      if (!user?.twoFactor?.enabled) {
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid request',
        });
      }

      const rateLimit = this.twoFactorService.checkRateLimit(user._id);
      if (!rateLimit.allowed) {
        return reply.code(429).send({
          statusCode: 429,
          message: 'Too many attempts. Try again later.',
        });
      }

      const secret = this.twoFactorService.decryptSecret(user.twoFactor.secret!);
      let isValid = await this.twoFactorService.verifyToken(req.body.code, secret);

      if (!isValid && user.twoFactor.backupCodes) {
        const backupIndex = this.twoFactorService.verifyBackupCode(req.body.code, user.twoFactor.backupCodes);
        if (backupIndex !== -1) {
          isValid = true;
          const newBackupCodes = [...user.twoFactor.backupCodes];
          newBackupCodes.splice(backupIndex, 1);
          await this.userService.patchUser(user.username, {
            twoFactor: { ...user.twoFactor, backupCodes: newBackupCodes },
          });
        }
      }

      if (!isValid) {
        this.twoFactorService.recordVerifyAttempt(user._id);
        return reply.code(401).send({
          statusCode: 401,
          message: 'Invalid code',
          remainingAttempts: rateLimit.remainingAttempts - 1,
        });
      }

      this.twoFactorService.resetVerifyAttempts(user._id);

      const userData = await this.issueSession(
        user,
        {
          username: user.username,
          password: '',
          kind: decoded.kind,
          persistent: decoded.persistent,
          device: decoded.device,
        },
        req,
      );
      return reply.code(201).send(userData);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public listApiTokens(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): FastifyReply | ApiTokenInfo[] {
    try {
      const user = req.locals.user!;
      return this.service
        .listApiTokensByUserId(user._id)
        .map((t) => this.toApiTokenInfo(t))
        .sort((a, b) => b.created_at - a.created_at);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async createApiToken(req: FastifyRequest<AuthLoginRequest & ApiTokenCreateRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = req.locals.user!;
      const name = req.body.name;

      const duplicate = this.service.listApiTokensByUserId(user._id).some((t) => t.name === name);
      if (duplicate) {
        return reply.code(409).send({ statusCode: 409, message: 'A token with this name already exists' });
      }

      const token = this.service.createApiToken({ userId: user._id, name, ip: req.ip });
      await this.service.insert(token);

      const response: ApiTokenCreatedResponse = {
        ...this.toApiTokenInfo(token),
        token: token.access_token,
      };
      return reply.code(201).send(response);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async deleteApiToken(req: FastifyRequest<AuthLoginRequest & AuthParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const requester = req.locals.user!;
      const target = this.service.findById(req.params.id);

      if (target?.type !== 'api') {
        return reply.code(404).send({ statusCode: 404, message: 'Token not found' });
      }

      const isAdmin = requester.role === 'admin' || requester.role === 'master';
      if (target.user_id !== requester._id && !isAdmin) {
        return reply.code(403).send({ statusCode: 403, message: 'Forbidden' });
      }

      await this.service.invalidateById(target.id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private toApiTokenInfo(token: DBToken): ApiTokenInfo {
    return {
      id: token.id,
      name: token.name ?? '',
      token_hint: `${token.access_token.slice(0, 8)}…${token.access_token.slice(-4)}`,
      created_at: token.device.created_at,
      last_seen_at: token.device.last_seen_at,
    };
  }

  private toSessionInfos(tokens: DBToken[], req: FastifyRequest): SessionInfo[] {
    const authorization = req.headers.authorization?.split(/\s+/);
    const currentToken = authorization?.[0] === 'Bearer' ? authorization[1] : undefined;

    return tokens
      .map((t) => ({
        id: t.id,
        device: t.device,
        is_current: t.access_token === currentToken,
        persistent: t.persistent,
        refresh_token_expires_at: t.refresh_token_expires_at,
      }))
      .sort((a, b) => {
        if (a.is_current) return -1;
        if (b.is_current) return 1;
        return b.device.last_seen_at - a.device.last_seen_at;
      });
  }

  private async issueSession(user: DBUser, body: LoginUserInput, req: FastifyRequest): Promise<UserData> {
    const kind: ClientKind = body.kind;
    const persistent = kind === 'native' ? true : body.persistent;
    const access_token = this.signAccessToken(user, body.device.id);

    // If a session for this device already exists, replace it (re-login on the same device).
    const existing = this.service.findByDeviceId(user._id, body.device.id);
    if (existing) {
      await this.service.invalidateById(existing.id);
    }

    const token: DBToken = this.service.createToken({
      userId: user._id,
      accessToken: access_token,
      persistent,
      kind,
      deviceId: body.device.id,
      deviceName: body.device.name,
      userAgent: req.headers['user-agent'] ?? '',
      ip: req.ip,
    });

    await this.service.insert(token);

    return {
      _id: user._id,
      username: user.username,
      avatar: user.avatar,
      role: user.role,
      firstLogin: user.firstLogin,
      language: user.preferences.language ?? 'auto',
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: 'Bearer',
      access_token_expires_at: Date.now() + TOKEN_LIFETIME.ACCESS_SECONDS * 1000,
      refresh_token_expires_at: token.refresh_token_expires_at,
      ...this.getAddresses(),
    };
  }

  private signAccessToken(user: DBUser, deviceId: string): string {
    const payload: JwtPayload = {
      _id: user._id,
      username: user.username,
      device_id: deviceId,
    };
    return jwt.sign(payload, this.configService.SECRETS.jwtAccessKey, { expiresIn: TOKEN_LIFETIME.ACCESS_SECONDS });
  }

  private getAddresses(): { internalAddresses: string[]; externalAddresses: string[] } {
    const allAddresses = fetchViableNetworkAddresses();
    const selectedAddresses = this.serverService.info().serverAddresses ?? [];

    const port = this.configService.config.port;

    const internalAddresses: string[] = allAddresses
      .filter((addr) => selectedAddresses.length === 0 || selectedAddresses.includes(addr.address))
      .map((addr) => buildHttpsUrl(addr.address, port));

    const remoteStatus = this.remoteAccessManager.getStatus();
    const externalAddresses: string[] = [];
    if (remoteStatus.externalUrl) externalAddresses.push(remoteStatus.externalUrl);

    return { internalAddresses, externalAddresses };
  }
}
