import { mergeWith } from '@camera.ui/common/utils';
import { randomBytes, randomUUID } from 'node:crypto';
import { container, delay, registry } from 'tsyringe';

import { TOKEN_LIFETIME } from '../types/index.js';
import { SocketService } from '../websocket/index.js';

import type { Database } from '../database/index.js';
import type { ClientKind, DBToken, DBTokenDevice } from '../types/index.js';

@registry([
  {
    token: 'socketService',
    useValue: delay(() => SocketService),
  },
])
export class AuthService {
  private dbs: Database;
  private socketService: SocketService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.socketService = container.resolve<SocketService>('socketService');
  }

  public listTokens(): DBToken[] {
    return [...this.dbs.tokensDB.getRange()].map(({ value }) => value);
  }

  public listTokensByUserId(userId: string): DBToken[] {
    return this.listTokens().filter((t) => t.user_id === userId);
  }

  public findById(id: string): DBToken | undefined {
    return this.dbs.tokensDB.get(id);
  }

  public findByAccessToken(access_token: string): DBToken | undefined {
    for (const { value } of this.dbs.tokensDB.getRange()) {
      if (value.access_token === access_token) return value;
    }
    return undefined;
  }

  public findByRefreshToken(refresh_token: string): DBToken | undefined {
    for (const { value } of this.dbs.tokensDB.getRange()) {
      if (value.refresh_token === refresh_token) return value;
    }
    return undefined;
  }

  public findByDeviceId(userId: string, deviceId: string): DBToken | undefined {
    for (const { value } of this.dbs.tokensDB.getRange()) {
      if (value.user_id === userId && value.device.id === deviceId) return value;
    }
    return undefined;
  }

  public async insert(token: DBToken): Promise<void> {
    await this.dbs.tokensDB.put(token.id, token);
  }

  public async invalidateById(id: string): Promise<void> {
    const token = this.dbs.tokensDB.get(id);
    if (!token) return;
    await this.dbs.tokensDB.remove(id);
    this.unauthenticateToken(token.access_token);
  }

  public async invalidateByAccessToken(access_token: string): Promise<void> {
    const token = this.findByAccessToken(access_token);
    if (token) await this.invalidateById(token.id);
  }

  public async invalidateByUserId(userId: string): Promise<void> {
    const tokens = this.listTokensByUserId(userId);
    await Promise.all(tokens.map((t) => this.invalidateById(t.id)));
  }

  public async invalidateAll(): Promise<void> {
    const tokens = this.listTokens();
    await this.dbs.tokensDB.clearAsync();
    for (const token of tokens) this.unauthenticateToken(token.access_token);
  }

  public async invalidateFamily(parentTokenId: string): Promise<number> {
    const family = this.listTokens().filter((t) => t.parent_token_id === parentTokenId || t.id === parentTokenId);
    await Promise.all(family.map((t) => this.invalidateById(t.id)));
    return family.length;
  }

  public async bumpLastSeen(tokenId: string, ip: string): Promise<void> {
    const token = this.dbs.tokensDB.get(tokenId);
    if (!token) return;

    const now = Date.now();
    if (now - token.device.last_seen_at < 60_000 && token.device.ip === ip) return;

    token.device.last_seen_at = now;
    token.device.ip = ip;
    await this.dbs.tokensDB.put(tokenId, token);
  }

  public createToken(params: {
    userId: string;
    accessToken: string;
    persistent: boolean;
    kind: ClientKind;
    deviceId: string;
    deviceName: string;
    userAgent: string;
    ip: string;
    parentTokenId?: string;
  }): DBToken {
    const now = Date.now();
    const window = params.persistent ? TOKEN_LIFETIME.REFRESH_PERSISTENT_MS : TOKEN_LIFETIME.REFRESH_NON_PERSISTENT_MS;

    const device: DBTokenDevice = {
      id: params.deviceId,
      name: params.deviceName,
      kind: params.kind,
      user_agent: params.userAgent,
      ip: params.ip,
      created_at: now,
      last_seen_at: now,
    };

    return {
      id: randomUUID(),
      user_id: params.userId,
      access_token: params.accessToken,
      refresh_token: this.generateRefreshToken(),
      refresh_token_expires_at: now + window,
      persistent: params.persistent,
      device,
      parent_token_id: params.parentTokenId,
    };
  }

  public async rotate(oldToken: DBToken, newAccessToken: string): Promise<DBToken> {
    const now = Date.now();
    const window = oldToken.persistent ? TOKEN_LIFETIME.REFRESH_PERSISTENT_MS : TOKEN_LIFETIME.REFRESH_NON_PERSISTENT_MS;

    const rotated: DBToken = {
      ...oldToken,
      access_token: newAccessToken,
      refresh_token: this.generateRefreshToken(),
      refresh_token_expires_at: oldToken.persistent ? now + window : oldToken.refresh_token_expires_at,
      device: { ...oldToken.device, last_seen_at: now },
      parent_token_id: oldToken.parent_token_id ?? oldToken.id,
    };

    await this.dbs.tokensDB.put(rotated.id, rotated);

    return rotated;
  }

  public mergeDevice(token: DBToken, patch: Partial<DBTokenDevice>): DBToken {
    mergeWith(token.device, patch, (source: any, target: any) => {
      if (Array.isArray(source)) return target;
    });
    return token;
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private unauthenticateToken(token: string): void {
    this.socketService?.io?.of('/camera.ui').emit('invalidToken', token);
  }
}
