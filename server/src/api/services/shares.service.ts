import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { container } from 'tsyringe';

import { SHARE_SERVICE_URL } from '../../services/config/constants.js';
import { createSourceName } from '../../utils/camera.js';
import { AuthService } from './auth.service.js';

import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { CloudApi } from '../../remote/api/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBShare } from '../database/types.js';

interface CreateShareParams {
  cameraId: string;
  sourceId: string;
  createdBy: string;
  ttlHours: number;
  maxViewers: number;
  label?: string;
}

interface ShareCreateResult {
  token: string;
  code: string;
  link: string;
  expiresAt: string;
}

type ShareListItem = DBShare & { sourceName: string | null };

const VALIDATE_RL_WINDOW_MS = 60_000;
const VALIDATE_RL_MAX = 10;

export class SharesService {
  private dbs: Database;
  private configService: ConfigService;
  private logger: LoggerService;
  private authService: AuthService;
  private cloudApi: CloudApi;
  private go2rtcApi: Go2RtcApi;

  private validateAttempts = new Map<string, { count: number; first: number }>();

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.configService = container.resolve<ConfigService>('configService');
    this.logger = container.resolve<LoggerService>('logger');
    this.cloudApi = container.resolve<CloudApi>('cloudApi');
    this.go2rtcApi = container.resolve<Go2RtcApi>('go2rtcApi');
    this.authService = new AuthService();
  }

  public async create(params: CreateShareParams): Promise<ShareCreateResult> {
    const camera = this.dbs.camerasDB.get(params.cameraId);
    if (!camera) {
      throw new Error('Camera not found');
    }
    const source = camera.sources?.find((s) => s._id === params.sourceId);
    if (!source) {
      throw new Error('Source not found for this camera');
    }
    if (source.role === 'snapshot') {
      throw new Error('Snapshot sources cannot be shared');
    }

    const token = randomBytes(24).toString('base64url');
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + params.ttlHours * 60 * 60 * 1000).toISOString();

    const share: DBShare = {
      _id: token,
      code,
      cameraId: params.cameraId,
      sourceId: params.sourceId,
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      expiresAt,
      maxViewers: params.maxViewers,
      currentViewers: 0,
      totalViews: 0,
      revoked: false,
      label: params.label,
    };

    await this.registerWithCloud(token, expiresAt);

    await this.dbs.sharesDB.put(token, share);

    const link = `${SHARE_SERVICE_URL}/${token}`;

    return { token, code, link, expiresAt };
  }

  public list(cameraId?: string): ShareListItem[] {
    const now = new Date().toISOString();
    const result: ShareListItem[] = [];

    for (const { value: s } of this.dbs.sharesDB.getRange()) {
      if (s.revoked) continue;
      if (s.expiresAt < now) continue;
      if (cameraId && s.cameraId !== cameraId) continue;
      result.push({ ...s, code: '****', sourceName: this.getSourceDisplayName(s.cameraId, s.sourceId) });
    }

    return result;
  }

  public async revoke(token: string): Promise<boolean> {
    const share = this.dbs.sharesDB.get(token);
    if (!share) return false;

    share.revoked = true;
    await this.dbs.sharesDB.put(token, share);
    await this.killShareConsumers(token);
    await this.authService.invalidateById(`share_${token}`);
    await this.deregisterFromCloud(token);

    return true;
  }

  public getShare(token: string): DBShare | null {
    const share = this.dbs.sharesDB.get(token);
    if (!share || share.revoked || new Date(share.expiresAt) < new Date()) return null;
    return share;
  }

  public validate(token: string, code: string): DBShare | null {
    const share = this.getShare(token);
    if (!share) return null;
    if (share.code !== code) return null;
    if (share.maxViewers > 0 && share.currentViewers >= share.maxViewers) return null;
    return share;
  }

  public isValidateRateLimited(key: string): boolean {
    const entry = this.validateAttempts.get(key);
    if (!entry) return false;
    if (Date.now() - entry.first > VALIDATE_RL_WINDOW_MS) {
      this.validateAttempts.delete(key);
      return false;
    }
    return entry.count >= VALIDATE_RL_MAX;
  }

  public recordValidateFailure(key: string): void {
    const now = Date.now();
    const entry = this.validateAttempts.get(key);
    if (!entry || now - entry.first > VALIDATE_RL_WINDOW_MS) {
      this.validateAttempts.set(key, { count: 1, first: now });
      return;
    }
    entry.count++;
  }

  public clearValidateRateLimit(key: string): void {
    this.validateAttempts.delete(key);
  }

  public async generateShareJWT(share: DBShare): Promise<string> {
    const jwtKey = this.configService.SECRETS.jwtAccessKey;
    const shareId = `share_${share._id}`;
    const streamScope = this.getStreamName(share.cameraId, share.sourceId) ?? undefined;

    const token = jwt.sign(
      {
        _id: shareId,
        username: 'share_viewer',
        shareToken: share._id,
        cameraId: share.cameraId,
        src: streamScope,
      },
      jwtKey,
      { expiresIn: '5m' },
    );

    await this.authService.invalidateById(shareId);

    const now = Date.now();
    await this.dbs.tokensDB.put(shareId, {
      id: shareId,
      user_id: shareId,
      access_token: token,
      refresh_token: '',
      refresh_token_expires_at: 0,
      persistent: false,
      stream_scope: streamScope,
      device: {
        id: shareId,
        name: 'Share viewer',
        kind: 'web',
        user_agent: '',
        ip: '',
        created_at: now,
        last_seen_at: now,
      },
    });

    return token;
  }

  public async incrementViewers(token: string): Promise<void> {
    const share = this.dbs.sharesDB.get(token);
    if (!share) return;
    share.currentViewers++;
    share.totalViews++;
    await this.dbs.sharesDB.put(token, share);
  }

  public async decrementViewers(token: string): Promise<void> {
    const share = this.dbs.sharesDB.get(token);
    if (share && share.currentViewers > 0) {
      share.currentViewers--;
      await this.dbs.sharesDB.put(token, share);
    }

    await this.authService.invalidateById(`share_${token}`);
  }

  public async cleanup(): Promise<void> {
    const now = new Date().toISOString();
    const tasks: Promise<unknown>[] = [];

    for (const { key, value } of this.dbs.sharesDB.getRange()) {
      if (value.revoked || value.expiresAt <= now) {
        tasks.push(this.killShareConsumers(key));
        tasks.push(this.authService.invalidateById(`share_${key}`));
        tasks.push(this.dbs.sharesDB.remove(key));
      }
    }

    if (tasks.length) await Promise.all(tasks);
  }

  public getStreamName(cameraId: string, sourceId: string): string | null {
    const camera = this.dbs.camerasDB.get(cameraId);
    if (!camera) return null;

    const source = camera.sources?.find((s) => s._id === sourceId);
    if (!source) return null;

    return createSourceName(camera.name, source.name);
  }

  private async killShareConsumers(token: string): Promise<void> {
    try {
      await this.go2rtcApi.streamsRoute.killConsumersByTag(`share_${token}`);
    } catch {
      // ignore
    }
  }

  private getSourceDisplayName(cameraId: string, sourceId: string): string | null {
    const camera = this.dbs.camerasDB.get(cameraId);
    return camera?.sources?.find((s) => s._id === sourceId)?.name ?? null;
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let part1 = '';
    let part2 = '';
    const bytes = randomBytes(8);

    for (let i = 0; i < 4; i++) {
      part1 += chars[bytes[i] % chars.length];
    }
    for (let i = 4; i < 8; i++) {
      part2 += chars[bytes[i] % chars.length];
    }

    return `${part1}-${part2}`;
  }

  private async registerWithCloud(token: string, expiresAt: string): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      throw new Error('Connect your server to the cloud under Settings → Remote before sharing a camera.');
    }
    try {
      await this.cloudApi.serverRoute.registerShare({ token_hash: this.sha256(token), expires_at: expiresAt });
    } catch (error) {
      this.logger.warn(`Failed to register share with cloud: ${error}`);
      throw new Error('Could not register the share with the cloud. Reconnect your server under Settings → Remote, then try again.');
    }
  }

  private async deregisterFromCloud(token: string): Promise<void> {
    if (!(await this.cloudApi.credentialStore.peek())) {
      return;
    }
    try {
      await this.cloudApi.serverRoute.deleteShare(this.sha256(token));
    } catch (error) {
      this.logger.warn(`Failed to deregister share from cloud: ${error}`);
    }
  }

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}
