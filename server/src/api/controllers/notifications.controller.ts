import { readFile } from 'node:fs/promises';

import { DeviceForbiddenError } from '../../manager/notificationManager.js';
import { NotificationsService } from '../services/notifications.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DBNotificationSettings } from '../database/types.js';
import type {
  AuthLoginRequest,
  NotificationsEntryRequest,
  NotificationsIdsRequest,
  NotificationsListRequest,
  NotificationsRegisterDeviceRequest,
  NotificationsRevokeDeviceRequest,
  NotificationsSettingsRequest,
  NotificationsUpdateDeviceRequest,
} from '../types/index.js';

export class NotificationsController {
  private service: NotificationsService;

  constructor(_app: FastifyInstance) {
    this.service = new NotificationsService();
  }

  public async getSettings(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const userId = req.locals.user!._id;
      const settings = await this.service.getSettings(userId);
      return reply.code(200).send(settings);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async setSettings(req: FastifyRequest<AuthLoginRequest & NotificationsSettingsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const userId = req.locals.user!._id;
      // _id goes last, a client must not pick another user
      const settings: DBNotificationSettings = { ...req.body, _id: userId };
      await this.service.setSettings(userId, settings);
      return reply.code(200).send(settings);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async listDevices(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const userId = req.locals.user!._id;
      const devices = await this.service.listDevices(userId, req.locals.user!.role);
      return reply.code(200).send(devices);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async listSources(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const sources = this.service.listSources(req.locals.user!.role);
      return reply.code(200).send(sources);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async list(req: FastifyRequest<AuthLoginRequest & NotificationsListRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      return reply.code(200).send(this.service.list(req.locals.user!._id, req.query));
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async get(req: FastifyRequest<AuthLoginRequest & NotificationsEntryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    const entry = this.service.get(req.locals.user!._id, req.params.id);
    if (!entry) {
      return reply.code(404).send({ statusCode: 404, message: 'Notification not found' });
    }
    return reply.code(200).send(entry);
  }

  public async remove(req: FastifyRequest<AuthLoginRequest & NotificationsEntryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.remove(req.locals.user!._id, [req.params.id]);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async removeMany(req: FastifyRequest<AuthLoginRequest & NotificationsIdsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.remove(req.locals.user!._id, req.body?.ids);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async markUnseen(req: FastifyRequest<AuthLoginRequest & NotificationsEntryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.markUnseen(req.locals.user!._id, req.params.id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async getHistory(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const history = this.service.getHistory(req.locals.user!._id);
      return reply.code(200).send(history);
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async clearHistory(req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.remove(req.locals.user!._id);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async historyImage(req: FastifyRequest<AuthLoginRequest & { Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    const path = this.service.getHistoryImagePath(req.locals.user!._id, req.params.id);
    if (!path) {
      return reply.code(404).send({ statusCode: 404, message: 'No image for this notification' });
    }
    try {
      const data = await readFile(path);
      return reply.code(200).header('cache-control', 'private, max-age=31536000, immutable').type(this.imageMime(data)).send(data);
    } catch {
      return reply.code(404).send({ statusCode: 404, message: 'No image for this notification' });
    }
  }

  public async historyVideo(req: FastifyRequest<AuthLoginRequest & { Params: { id: string } }>, reply: FastifyReply): Promise<FastifyReply> {
    const path = this.service.getHistoryVideoPath(req.locals.user!._id, req.params.id);
    if (!path) {
      return reply.code(404).send({ statusCode: 404, message: 'No video for this notification' });
    }
    try {
      const data = await readFile(path);
      reply.header('accept-ranges', 'bytes').header('cache-control', 'private, max-age=31536000, immutable').type('video/mp4');

      // Safari refuses to play <video> without range responses
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, data.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        if (start >= data.length || start > end) {
          return reply.code(416).header('content-range', `bytes */${data.length}`).send();
        }
        return reply
          .code(206)
          .header('content-range', `bytes ${start}-${end}/${data.length}`)
          .send(data.subarray(start, end + 1));
      }
      return reply.code(200).send(data);
    } catch {
      return reply.code(404).send({ statusCode: 404, message: 'No video for this notification' });
    }
  }

  public async markSeen(req: FastifyRequest<AuthLoginRequest & NotificationsEntryRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.markSeen(req.locals.user!._id, [req.params.id]);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async markManySeen(req: FastifyRequest<AuthLoginRequest & NotificationsIdsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.markSeen(req.locals.user!._id, req.body?.ids);
      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async registerDevice(req: FastifyRequest<AuthLoginRequest & NotificationsRegisterDeviceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const userId = req.locals.user!._id;
      if (!req.body?.pluginName || typeof req.body.pluginName !== 'string') {
        return reply.code(400).send({ statusCode: 400, message: 'pluginName is required' });
      }
      const device = await this.service.registerDevice(userId, req.body);
      return reply.code(201).send(device);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      // plugin state issues, a 503 lets the UI hint to install or start the plugin
      const isStateIssue = /not found|not running|does not implement/i.test(message);
      const status = isStateIssue ? 503 : 500;
      req.log.warn({ pluginName: req.body?.pluginName, err: message }, 'registerDevice failed');
      return reply.code(status).send({ statusCode: status, message });
    }
  }

  public async revokeDevice(req: FastifyRequest<AuthLoginRequest & NotificationsRevokeDeviceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.revokeDevice(req.params.id, req.locals.user!._id, req.locals.user!.role);
      return reply.code(204).send();
    } catch (error: any) {
      if (error instanceof DeviceForbiddenError) {
        return reply.code(403).send({ statusCode: 403, message: error.message });
      }
      return reply.code(500).send({ statusCode: 500, message: error.message });
    }
  }

  public async updateDevice(req: FastifyRequest<AuthLoginRequest & NotificationsUpdateDeviceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const patch: Record<string, unknown> = {};
      if (typeof req.body?.name === 'string') patch.name = req.body.name;
      if (typeof req.body?.active === 'boolean') patch.active = req.body.active;
      if (Object.keys(patch).length === 0) {
        return reply.code(400).send({ statusCode: 400, message: 'No editable fields supplied (name, active)' });
      }

      const updated = await this.service.updateDevice(req.params.id, patch, req.locals.user!._id, req.locals.user!.role);
      return reply.code(200).send(updated);
    } catch (error: any) {
      if (error instanceof DeviceForbiddenError) {
        return reply.code(403).send({ statusCode: 403, message: error.message });
      }
      const status = (error?.message ?? '').includes('not found') ? 404 : 500;
      return reply.code(status).send({ statusCode: status, message: error.message });
    }
  }

  private imageMime(data: Buffer): string {
    if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
    if (data[0] === 0x47 && data[1] === 0x49) return 'image/gif';
    if (data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    return 'image/jpeg';
  }
}
