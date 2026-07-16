import { orderBy } from '@camera.ui/common/utils';
import { createHmac, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { container } from 'tsyringe';

import { CamerasService } from '../services/cameras.service.js';
import { UsersService } from '../services/users.service.js';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigService } from '../../services/config/index.js';
import type { DBCamviewLayout, DBUser } from '../database/types.js';
import type { UserLanguage } from '../schemas/users.schema.js';
import type {
  AuthLoginRequest,
  AuthParamsRequest,
  CamerasParamsRequest,
  PaginationRequest,
  ShortcutInsertRequest,
  ShortcutParamsRequest,
  ShortcutPatchRequest,
  UsersInsertRequest,
  UsersParamsRequest,
  UsersPatchRequest,
  ViewsInsertRequest,
  ViewsParamsRequest,
  ViewsPatchRequest,
} from '../types/index.js';
import type { SocketService } from '../websocket/index.js';

export class UsersController {
  private configService: ConfigService;
  private service: UsersService;
  private camerasService: CamerasService;
  private socketService: SocketService;

  constructor(private app: FastifyInstance) {
    this.configService = container.resolve<ConfigService>('configService');
    this.service = new UsersService();
    this.camerasService = new CamerasService();
    this.socketService = container.resolve<SocketService>('socketService');
  }

  public async insert(req: FastifyRequest<AuthLoginRequest & UsersInsertRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.body.username);

      if (user) {
        return reply.code(409).send({
          statusCode: 409,
          message: 'User already exists',
        });
      }

      const salt = randomBytes(16).toString('base64');
      const hash = createHmac('sha512', salt).update(req.body.password).digest('base64');

      req.body.password = salt + '$' + hash;

      const newUser = (await this.service.createUser(req.body)) as Partial<DBUser>;

      delete newUser.password;

      if ('passwordConfirm' in newUser) {
        delete newUser.passwordConfirm;
      }

      if ('root' in newUser) {
        delete newUser.root;
      }

      return reply.code(201).send(newUser);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getByName(req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      if ('password' in user) {
        delete (user as any).password;
      }

      if ('passwordConfirm' in user) {
        delete (user as any).passwordConfirm;
      }

      if ('root' in user) {
        delete user.root;
      }

      return reply.code(200).send(user);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public list(_req: FastifyRequest<AuthLoginRequest & PaginationRequest>, reply: FastifyReply): FastifyReply | Partial<DBUser>[] {
    try {
      const users = this.service.list();

      const userList = users.map((user: Partial<DBUser>) => {
        delete user.password;

        if ('passwordConfirm' in user) {
          delete user.passwordConfirm;
        }

        if ('root' in user) {
          delete user.root;
        }

        return user;
      });

      const ordered = orderBy(userList, ['username'], ['asc']);

      return ordered;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchByName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & UsersPatchRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      if (user.role === 'master' && req.locals.user!._id !== user._id) {
        return reply.code(403).send({
          statusCode: 403,
          message: 'Forbidden: the master account can only be modified by itself',
        });
      }

      const callerIsAdmin = req.locals.user!.role === 'admin' || req.locals.user!.role === 'master';
      if (req.body.role !== undefined && req.body.role !== user.role && !callerIsAdmin) {
        return reply.code(403).send({
          statusCode: 403,
          message: 'Forbidden: only admins can change roles',
        });
      }

      if (req.locals.authKind !== 'session' && (req.body.password !== undefined || req.body.username !== undefined || req.body.role !== undefined)) {
        return reply.code(403).send({
          statusCode: 403,
          message: 'Changing credentials or roles requires a logged-in session',
        });
      }

      if (user.role === 'master' && req.body.role && req.body.role !== (user.role as any)) {
        return reply.code(409).send({
          statusCode: 409,
          message: 'Role of master can not be changed',
        });
      }

      if (req.body.username && req.body.username !== req.params.username) {
        const user = this.service.findByName(req.body.username);
        if (user) {
          return reply.code(409).send({
            statusCode: 409,
            message: 'Can not change username to existing user',
          });
        }
      }

      if (req.isMultipart()) {
        if (req.body.upload) {
          const file = req.body.upload;

          if (file) {
            const fileBuffer = await file.toBuffer();
            req.body.avatar = `${req.locals.user!._id}_avatar.${file.mimetype.split('/')[1]}`;
            writeFileSync(`${this.configService.USERS_STORAGE_PATH}/${req.body.avatar}`, fileBuffer);
            delete req.body.upload;
          }
        }
      }

      delete req.body.firstLogin;

      if (req.body.password) {
        const salt = randomBytes(16).toString('base64');
        const hash = createHmac('sha512', salt).update(req.body.password).digest('base64');
        req.body.password = salt + '$' + hash;
        req.body.firstLogin = false;
      }

      const newUser = (await this.service.patchUser(req.params.username, req.body as DBUser)) as Partial<DBUser>;

      const patchedLanguage = req.body.preferences?.language;
      if (patchedLanguage && patchedLanguage !== (user.preferences.language ?? 'auto')) {
        this.emitUserLanguage(user._id, patchedLanguage);
      }

      delete newUser.password;

      if ('passwordConfirm' in newUser) {
        delete newUser.passwordConfirm;
      }

      if ('root' in newUser) {
        delete newUser.root;
      }

      return reply.code(200).send(newUser);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeByName(req: FastifyRequest<AuthLoginRequest & UsersParamsRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      if (user.role === 'master') {
        return reply.code(409).send({
          statusCode: 409,
          message: 'Master can not be removed',
        });
      }

      await this.service.removeByName(req.params.username);

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeAll(_req: FastifyRequest<AuthLoginRequest>, reply: FastifyReply): Promise<FastifyReply> {
    try {
      await this.service.removeAll();

      return reply.code(204).send();
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async insertShortcut(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutInsertRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const shortcuts = (await this.service.createShortcut(req.params.username, camera._id, req.body)) ?? [];

      return reply.code(201).send(shortcuts);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getShortcutByCameraName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutParamsRequest>,
    reply: FastifyReply,
  ): FastifyReply {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const cameraPreferences = user.preferences.cameras[camera._id];
      const shortcut = cameraPreferences?.shortcuts?.find((v) => v._id === req.params.shortcutid);

      if (!shortcut) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Shortcut not exists',
        });
      }

      return reply.code(200).send(shortcut);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getShortcutsByCameraName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutParamsRequest>,
    reply: FastifyReply,
  ): FastifyReply {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const cameraPreferences = user.preferences.cameras[camera._id];
      const shortcuts = cameraPreferences?.shortcuts ?? [];

      return reply.code(200).send(shortcuts);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchShortcutByCameraName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutParamsRequest & ShortcutPatchRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const shortcuts = (await this.service.patchShortcutById(req.params.username, camera._id, req.params.shortcutid, req.body)) ?? [];

      return reply.code(201).send(shortcuts);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeShortcutByCameraName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & PaginationRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutParamsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      const shortcurts = await this.service.removeShortcutById(req.params.username, camera._id, req.params.shortcutid);

      return reply.code(200).send(shortcurts ?? []);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeAllShortcutsByCameraName(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & CamerasParamsRequest & ShortcutParamsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const camera = this.camerasService.findByName(req.params.cameraname);

      if (!camera) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'Camera not exists',
        });
      }

      await this.service.removeAllShortcuts(req.params.username, camera._id);

      return reply.code(200).send([]);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async insertView(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & ViewsInsertRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const view = user.preferences.camview.views.find((v) => v.name === req.body.name);

      if (view) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'View already exists',
        });
      }

      const newView = await this.service.createView(req.params.username, req.body);

      return reply.code(201).send(newView);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public getViewById(req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & ViewsParamsRequest>, reply: FastifyReply): FastifyReply {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const view = user.preferences.camview.views.find((v) => v._id === req.params.viewid);

      if (!view) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'View not exists',
        });
      }

      return reply.code(200).send(view);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public listViews(
    req: FastifyRequest<AuthLoginRequest & PaginationRequest & AuthParamsRequest & UsersParamsRequest & ViewsParamsRequest>,
    reply: FastifyReply,
  ): FastifyReply | Partial<DBUser>[] {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const views = user.preferences.camview.views;
      const ordered = orderBy(views, ['name'], ['asc']);

      return ordered;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async patchViewById(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & UsersParamsRequest & ViewsParamsRequest & ViewsPatchRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | void> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const view = user.preferences.camview.views.find((v) => v._id === req.params.viewid);

      if (!view) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'View not exists',
        });
      }

      const newView = await this.service.patchViewById(req.params.username, req.params.viewid, req.body);

      return reply.code(200).send(newView);
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeViewById(
    req: FastifyRequest<AuthLoginRequest & AuthParamsRequest & PaginationRequest & UsersParamsRequest & ViewsParamsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | DBCamviewLayout[]> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const view = user.preferences.camview.views.find((v) => v._id === req.params.viewid);

      if (!view) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'View not exists',
        });
      }

      const views = (await this.service.removeViewById(req.params.username, req.params.viewid)) ?? [];
      const ordered = orderBy(views, ['name'], ['asc']);

      return ordered;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  public async removeAllViews(
    req: FastifyRequest<AuthLoginRequest & PaginationRequest & AuthParamsRequest & UsersParamsRequest>,
    reply: FastifyReply,
  ): Promise<FastifyReply | DBCamviewLayout[]> {
    try {
      const user = this.service.findByName(req.params.username);

      if (!user) {
        return reply.code(404).send({
          statusCode: 404,
          message: 'User not exists',
        });
      }

      const views = (await this.service.removeAllViews(req.params.username)) ?? [];
      const ordered = orderBy(views, ['name'], ['asc']);

      return ordered;
    } catch (error: any) {
      return reply.code(500).send({
        statusCode: 500,
        message: error.message,
      });
    }
  }

  private emitUserLanguage(userId: string, language: UserLanguage): void {
    const main = this.socketService.namespaces.get('/camera.ui');
    if (!main) return;

    for (const socket of main.nsp.sockets.values()) {
      if (socket.data.userId === userId) {
        socket.emit('user-language', { language });
      }
    }
  }
}
