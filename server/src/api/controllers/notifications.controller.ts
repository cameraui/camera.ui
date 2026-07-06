import { DeviceForbiddenError } from '../../manager/notificationManager.js';
import { NotificationsService } from '../services/notifications.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { DBNotificationSettings } from '../database/types.js';
import type {
  AuthLoginRequest,
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
      // Force `_id` to the authenticated user — clients can't impersonate
      // other users by submitting a different `_id` in the body.
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
      await this.service.clearHistory(req.locals.user!._id);
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
      // `not found`, `not running`, or "does not implement Notifier" are
      // all runtime-state issues, not server bugs — surface 503 so the UI
      // can render an "install/start the relevant plugin" hint instead of
      // treating it as a generic crash.
      const isStateIssue = /not found|not running|does not implement/i.test(message);
      const status = isStateIssue ? 503 : 500;
      req.log.warn({ pluginName: req.body?.pluginName, err: message }, 'registerDevice failed');
      return reply.code(status).send({ statusCode: status, message });
    }
  }

  public async revokeDevice(req: FastifyRequest<AuthLoginRequest & NotificationsRevokeDeviceRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.revokeDevice(req.params.id, req.locals.user!._id, req.locals.user!.role);
      // Idempotent — return 204 even if the device didn't exist.
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
      // Whitelist updatable fields. Plugins ignore unknown keys, but
      // filtering at the gateway keeps the wire payload tight and
      // prevents surprises (e.g. a stray `fcmToken` key wouldn't be
      // honored anyway, no point shipping it).
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
}
