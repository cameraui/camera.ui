import { inject } from '../../container.js';
import { browserIceServers, browserStunServers } from '../../services/config/ice-servers.js';
import { SharesService } from '../services/shares.service.js';

import type { IceServer } from '@camera.ui/sdk/internal';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '../../services/config/index.js';
import type { DBShare } from '../database/types.js';
import type { AuthLoginRequest, CreateShareRequest, ListShareRequest, ShareParamsRequest, ValidateShareRequest } from '../types/index.js';

interface ShareViewerRequest extends ShareParamsRequest {
  Body: unknown;
}

interface ViewerSession {
  access_token: string;
  camera_id: string;
  stream_name: string;
  expires_in: number;
  ice_servers: IceServer[];
}

const MAX_SHARE_TTL_HOURS = 30 * 24;

export class SharesController {
  private configService: ConfigService;
  private service: SharesService;

  constructor(_app: FastifyInstance) {
    this.configService = inject('configService');
    this.service = new SharesService();
  }

  public async create(req: FastifyRequest<AuthLoginRequest & CreateShareRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { cameraId, sourceId, ttlHours, maxViewers, label, turn } = req.body;

      if (!cameraId || !sourceId || !ttlHours) {
        return reply.code(400).send({ statusCode: 400, message: 'cameraId, sourceId and ttlHours are required' });
      }
      if (ttlHours < 1 || ttlHours > MAX_SHARE_TTL_HOURS) {
        return reply.code(400).send({ statusCode: 400, message: `ttlHours must be between 1 and ${MAX_SHARE_TTL_HOURS}` });
      }

      const result = await this.service.create({
        cameraId,
        sourceId,
        createdBy: req.locals.user!._id,
        ttlHours,
        maxViewers: maxViewers || 0,
        label,
        turn,
      });

      return reply.code(201).send(result);
    } catch (error: any) {
      const status = /not found|cannot be shared|Settings → Remote/i.test(error.message) ? 400 : 500;
      return reply.code(status).send({ statusCode: status, message: error.message });
    }
  }

  public list(req: FastifyRequest<AuthLoginRequest & ListShareRequest>, reply: FastifyReply): FastifyReply {
    try {
      const shares = this.service.list(req.query.camera);
      return reply.code(200).send(shares);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async revoke(req: FastifyRequest<AuthLoginRequest & ShareParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const success = await this.service.revoke(req.params.token);
      if (!success) {
        return reply.code(404).send({ statusCode: 404, message: 'Share not found' });
      }
      return reply.code(200).send({ message: 'Share revoked' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async validate(req: FastifyRequest<ValidateShareRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { token } = req.params;
      const { code } = req.query;

      if (!code) {
        return reply.code(400).send({ statusCode: 400, message: 'Code is required' });
      }

      const rlKey = `${token}:${req.ip}`;
      if (this.service.isValidateRateLimited(rlKey)) {
        return reply.code(429).send({ statusCode: 429, message: 'Too many attempts, please try again later', error: 'rate_limited' });
      }

      const share = this.service.validate(token, code);
      if (share === 'invalid_code') {
        this.service.recordValidateFailure(rlKey);
        return reply.code(403).send({ statusCode: 403, message: 'Invalid code', error: share });
      }
      if (share === 'gone') {
        return reply.code(410).send({ statusCode: 410, message: 'Share revoked or expired', error: share });
      }
      if (share === 'full') {
        return reply.code(429).send({ statusCode: 429, message: 'Maximum number of viewers reached', error: share });
      }
      this.service.clearValidateRateLimit(rlKey);

      const streamName = this.service.getStreamName(share.cameraId, share.sourceId);
      if (!streamName) {
        return reply.code(404).send({ statusCode: 404, message: 'Shared source no longer available' });
      }

      const jwtToken = await this.service.issueViewerToken(share);
      await this.service.countView(token);

      return reply.code(200).send(this.viewerSession(share, jwtToken, streamName));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async disconnect(req: FastifyRequest<ShareViewerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { token } = req.params;
      if (!(await this.service.endView(token, viewerProof(req.body)))) {
        return reply.code(401).send({ statusCode: 401, message: 'Viewer token required', error: 'unauthorized' });
      }
      return reply.code(200).send({ message: 'Disconnected' });
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async refresh(req: FastifyRequest<ShareViewerRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const { token } = req.params;

      const actualShare = this.service.getShare(token);

      if (!actualShare) {
        return reply.code(410).send({ statusCode: 410, message: 'Share revoked or expired', error: 'gone' });
      }

      const viewer = this.service.findViewer(token, viewerProof(req.body), true);
      if (!viewer) {
        return reply.code(401).send({ statusCode: 401, message: 'Viewer token required', error: 'unauthorized' });
      }

      const streamName = this.service.getStreamName(actualShare.cameraId, actualShare.sourceId);
      if (!streamName) {
        return reply.code(404).send({ statusCode: 404, message: 'Shared source no longer available' });
      }

      const jwtToken = await this.service.refreshViewerToken(actualShare, viewer);
      if (!jwtToken) {
        return reply.code(401).send({ statusCode: 401, message: 'Viewer token required', error: 'unauthorized' });
      }

      return reply.code(200).send(this.viewerSession(actualShare, jwtToken, streamName));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  private viewerSession(share: DBShare, accessToken: string, streamName: string): ViewerSession {
    const iceServers = this.configService.iceServers;
    return {
      access_token: accessToken,
      camera_id: share.cameraId,
      stream_name: streamName,
      expires_in: 300,
      ice_servers: share.turn ? browserIceServers(iceServers) : browserStunServers(iceServers),
    };
  }
}

function viewerProof(body: unknown): string | undefined {
  return typeof body === 'string' && body.trim() ? body.trim() : undefined;
}
