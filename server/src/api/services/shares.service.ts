import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';

import { inject } from '../../container.js';
import { SHARE_SERVICE_URL } from '../../services/config/constants.js';
import { createSourceName } from '../../utils/camera.js';
import { AuthService } from './auth.service.js';

import type { Go2RtcApi } from '../../go2rtc/api/index.js';
import type { Go2RtcState } from '../../go2rtc/state.js';
import type { CloudApi } from '../../remote/api/index.js';
import type { ConfigService } from '../../services/config/index.js';
import type { LoggerService } from '../../services/logger/index.js';
import type { Database } from '../database/index.js';
import type { DBShare } from '../database/types.js';
import type { DBToken } from '../types/index.js';

interface CreateShareParams {
  cameraId: string;
  sourceId: string;
  createdBy: string;
  ttlHours: number;
  maxViewers: number;
  label?: string;
  turn?: boolean;
}

interface ShareCreateResult {
  token: string;
  code: string;
  link: string;
  expiresAt: string;
}

type ShareListItem = DBShare & { sourceName: string | null };

type ShareRefusal = 'gone' | 'invalid_code' | 'full';

const VALIDATE_RL_WINDOW_MS = 60_000;
const VALIDATE_RL_MAX = 10;
const VALIDATE_RL_MAX_KEYS = 10_000;

const SHARE_USER_PREFIX = 'share_';
const VIEWER_IDLE_MS = 10 * 60_000;
const MAX_VIEWER_TOKENS_PER_SHARE = 50;
const VIEWER_TOKEN_SECONDS = 300;

export class SharesService {
  private dbs: Database;
  private configService: ConfigService;
  private logger: LoggerService;
  private authService: AuthService;
  private cloudApi: CloudApi;
  private go2rtcApi: Go2RtcApi;
  private go2rtcState: Go2RtcState;

  private validateAttempts = new Map<string, { count: number; first: number }>();

  constructor() {
    this.dbs = inject('dbs');
    this.configService = inject('configService');
    this.logger = inject('logger');
    this.cloudApi = inject('cloudApi');
    this.go2rtcApi = inject('go2rtcApi');
    this.go2rtcState = inject('go2rtcState');
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
      turn: params.turn,
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
      result.push({ ...s, code: '****', currentViewers: this.currentViewers(s._id), sourceName: this.getSourceDisplayName(s.cameraId, s.sourceId) });
    }

    return result;
  }

  public async revoke(token: string): Promise<boolean> {
    const share = await this.dbs.commit(this.dbs.sharesDB, token, (current) => {
      if (!current) return undefined;

      current.revoked = true;

      return current;
    });
    if (!share) return false;

    // relays first, an offer they still forward would start a new consumer
    await this.authService.revokeUsers([shareUserId(token)]);
    await this.killShareConsumers(token);
    await this.deregisterFromCloud(token);

    return true;
  }

  public getShare(token: string): DBShare | null {
    const share = this.dbs.sharesDB.get(token);
    if (!share || share.revoked || new Date(share.expiresAt) < new Date()) return null;
    return share;
  }

  public validate(token: string, code: string): DBShare | ShareRefusal {
    const share = this.getShare(token);
    if (!share) return 'gone';
    if (share.code !== code) return 'invalid_code';
    if (share.maxViewers > 0 && this.currentViewers(token) >= share.maxViewers) return 'full';
    return share;
  }

  public findViewer(token: string, proof: string | undefined, unexpired = false): DBToken | undefined {
    if (!proof) return undefined;

    const viewer = this.authService.resolveAccessToken(proof)?.token;
    if (viewer?.user_id !== shareUserId(token)) return undefined;

    if (unexpired) {
      try {
        jwt.verify(proof, this.configService.SECRETS.jwtAccessKey);
      } catch {
        return undefined;
      }
    }

    return viewer;
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
    if (entry && now - entry.first <= VALIDATE_RL_WINDOW_MS) {
      entry.count++;
      return;
    }

    // a new window goes last, so the loop meets the oldest first
    this.validateAttempts.delete(key);
    for (const [oldKey, old] of this.validateAttempts) {
      if (now - old.first <= VALIDATE_RL_WINDOW_MS && this.validateAttempts.size < VALIDATE_RL_MAX_KEYS) break;
      this.validateAttempts.delete(oldKey);
    }
    this.validateAttempts.set(key, { count: 1, first: now });
  }

  public clearValidateRateLimit(key: string): void {
    this.validateAttempts.delete(key);
  }

  public async issueViewerToken(share: DBShare): Promise<string> {
    const now = Date.now();
    const userId = shareUserId(share._id);
    const id = `${userId}_${randomBytes(9).toString('base64url')}`;
    const streamScope = this.getStreamName(share.cameraId, share.sourceId) ?? undefined;
    const accessToken = this.signViewerToken(share, streamScope);

    await this.pruneViewers(share._id, now);
    await this.dbs.tokensDB.put(id, {
      id,
      user_id: userId,
      access_token: accessToken,
      access_token_expires_at: now + VIEWER_TOKEN_SECONDS * 1000,
      refresh_token: '',
      refresh_token_expires_at: 0,
      persistent: false,
      stream_scope: streamScope,
      device: {
        id,
        name: 'Share viewer',
        kind: 'web',
        user_agent: '',
        ip: '',
        created_at: now,
        last_seen_at: now,
      },
    });

    return accessToken;
  }

  public async refreshViewerToken(share: DBShare, viewer: DBToken): Promise<string | undefined> {
    const now = Date.now();
    const streamScope = this.getStreamName(share.cameraId, share.sourceId) ?? undefined;
    const accessToken = this.signViewerToken(share, streamScope);

    const rotated = await this.dbs.commit(this.dbs.tokensDB, viewer.id, (current) => {
      if (!current) return undefined;

      return {
        ...current,
        access_token: accessToken,
        access_token_expires_at: now + VIEWER_TOKEN_SECONDS * 1000,
        previous_access_token: current.access_token,
        rotated_at: now,
        stream_scope: streamScope,
        device: { ...current.device, last_seen_at: now },
      };
    });

    return rotated ? accessToken : undefined;
  }

  public async countView(token: string): Promise<void> {
    await this.dbs.commit(this.dbs.sharesDB, token, (current) => {
      if (!current) return undefined;

      current.totalViews++;

      return current;
    });
  }

  public async endView(token: string, proof: string | undefined): Promise<boolean> {
    const viewer = this.findViewer(token, proof);
    if (!viewer) return false;

    await this.authService.invalidateById(viewer.id);
    return true;
  }

  public currentViewers(token: string): number {
    return this.go2rtcState.countConsumersByTag(shareUserId(token));
  }

  public async cleanup(): Promise<void> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const ended = new Set<string>();
    const tasks: Promise<unknown>[] = [];

    for (const { key, value } of this.dbs.sharesDB.getRange()) {
      if (value.revoked || value.expiresAt <= nowIso) ended.add(key);
    }

    if (ended.size) await this.authService.revokeUsers([...ended].map(shareUserId));
    for (const key of ended) {
      tasks.push(this.killShareConsumers(key));
      tasks.push(this.dbs.sharesDB.remove(key));
    }

    for (const { value } of this.dbs.tokensDB.getRange()) {
      if (!value.user_id.startsWith(SHARE_USER_PREFIX)) continue;

      const token = value.user_id.slice(SHARE_USER_PREFIX.length);
      if (ended.has(token) || !this.dbs.sharesDB.get(token) || now - value.device.last_seen_at > VIEWER_IDLE_MS) {
        tasks.push(this.authService.invalidateById(value.id));
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

  private signViewerToken(share: DBShare, streamScope: string | undefined): string {
    return jwt.sign(
      {
        _id: shareUserId(share._id),
        shareToken: share._id,
        cameraId: share.cameraId,
        src: streamScope,
      },
      this.configService.SECRETS.jwtAccessKey,
      { expiresIn: VIEWER_TOKEN_SECONDS, jwtid: randomBytes(9).toString('base64url') },
    );
  }

  private async pruneViewers(token: string, now: number): Promise<void> {
    const live: DBToken[] = [];
    const drop: DBToken[] = [];

    for (const viewer of this.authService.listTokensByUserId(shareUserId(token))) {
      (now - viewer.device.last_seen_at > VIEWER_IDLE_MS ? drop : live).push(viewer);
    }

    if (live.length >= MAX_VIEWER_TOKENS_PER_SHARE) {
      live.sort((a, b) => a.device.last_seen_at - b.device.last_seen_at);
      drop.push(...live.slice(0, live.length - MAX_VIEWER_TOKENS_PER_SHARE + 1));
    }

    if (drop.length) await Promise.all(drop.map((viewer) => this.authService.invalidateById(viewer.id)));
  }

  private async killShareConsumers(token: string): Promise<void> {
    try {
      await this.go2rtcApi.streamsRoute.killConsumersByTag(shareUserId(token));
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

function shareUserId(token: string): string {
  return `${SHARE_USER_PREFIX}${token}`;
}
