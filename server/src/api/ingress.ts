import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { container } from 'tsyringe';

import { AuthService } from './services/auth.service.js';
import { UsersService } from './services/users.service.js';
import { TOKEN_LIFETIME } from './types/index.js';

import type { ConfigService } from '../services/config/index.js';

const INGRESS_USERNAME = 'homeassistant';
const REFRESH_MARGIN_MS = 60 * 1000;

export class IngressSession {
  private readonly configService = container.resolve<ConfigService>('configService');
  private readonly authService = new AuthService();
  private readonly usersService = new UsersService();

  private accessToken?: string;
  private tokenId?: string;
  private expiresAt = 0;

  public async getAccessToken(): Promise<string | undefined> {
    if (this.accessToken && Date.now() < this.expiresAt - REFRESH_MARGIN_MS) {
      return this.accessToken;
    }
    return this.mint();
  }

  private async mint(): Promise<string | undefined> {
    const user = this.usersService.findByName(INGRESS_USERNAME);
    if (!user) {
      return undefined;
    }

    if (this.tokenId) {
      await this.authService.invalidateById(this.tokenId).catch(() => {});
    } else {
      await this.authService.invalidateSessionsByUserId(user._id).catch(() => {});
    }

    const deviceId = randomUUID();
    const accessToken = jwt.sign(
      { _id: user._id, username: user.username, device_id: deviceId },
      this.configService.SECRETS.jwtAccessKey,
      { expiresIn: TOKEN_LIFETIME.ACCESS_SECONDS },
    );

    const token = this.authService.createToken({
      userId: user._id,
      accessToken,
      persistent: true,
      kind: 'web',
      deviceId,
      deviceName: 'Home Assistant Ingress',
      userAgent: '',
      ip: '127.0.0.1',
    });
    await this.authService.insert(token);

    this.accessToken = token.access_token;
    this.tokenId = token.id;
    this.expiresAt = Date.now() + TOKEN_LIFETIME.ACCESS_SECONDS * 1000;

    return this.accessToken;
  }
}
