import { mergeWith } from '@camera.ui/common/utils';
import { container } from 'tsyringe';

import { AuthService } from './auth.service.js';

import type { AssistantManager } from '../../assistant/manager.js';
import type { Database } from '../database/index.js';
import type { DBCamviewLayout, DBHiddenDevice, DBShortcut, DBUser, HiddenEventTypes } from '../database/types.js';

export class UsersService {
  private dbs: Database;
  private authService: AuthService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.authService = new AuthService();
  }

  public async createUser(userData: DBUser): Promise<DBUser> {
    if ('passwordConfig' in userData) {
      delete (userData as Record<string, unknown>).passwordConfig;
    }

    await this.dbs.usersDB.put(userData._id, userData);
    return userData;
  }

  public findById(id: string): DBUser | undefined {
    return this.dbs.usersDB.get(id);
  }

  public findByName(username: string): DBUser | undefined {
    for (const { value } of this.dbs.usersDB.getRange()) {
      if (value.username === username) return value;
    }
    return undefined;
  }

  public list(): DBUser[] {
    return [...this.dbs.usersDB.getRange()].map(({ value }) => value);
  }

  public async patchUser(username: string, userData: Partial<DBUser> = {}): Promise<DBUser | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const usernameChanged = userData.username !== undefined && userData.username !== existing.username;
    const passwordChanged = userData.password !== undefined && userData.password !== existing.password;

    if (usernameChanged || passwordChanged) {
      await this.authService.invalidateSessionsByUserId(existing._id);
    }

    return this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      mergeWith(current, userData, (source: any, target: any, key: string | number | undefined) => {
        if (Array.isArray(source)) return target;
        if (key === 'navLayout') return target;
      });

      return current;
    });
  }

  public async removeByName(username: string): Promise<void> {
    const user = this.findByName(username);
    if (!user) return;

    await this.authService.invalidateByUserId(user._id);
    await this.assistant()?.forgetUser(user._id);
    await this.dbs.usersDB.remove(user._id);
  }

  public async removeAll(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const { key, value } of this.dbs.usersDB.getRange()) {
      if (value.role !== 'master') {
        tasks.push(this.assistant()?.forgetUser(key) ?? Promise.resolve());
        tasks.push(this.dbs.usersDB.remove(key));
      }
    }

    await this.authService.invalidateAll();
    await Promise.all(tasks);
  }

  public getHiddenEventTypes(username: string): HiddenEventTypes | undefined {
    const user = this.findByName(username);
    if (!user) return undefined;

    const hidden: HiddenEventTypes = {};
    for (const [cameraId, prefs] of Object.entries(user.preferences.cameras)) {
      if (prefs?.hiddenEventTypes?.length) hidden[cameraId] = prefs.hiddenEventTypes;
    }
    return hidden;
  }

  public async setHiddenEventTypes(username: string, hidden: HiddenEventTypes): Promise<HiddenEventTypes | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      for (const prefs of Object.values(current.preferences.cameras)) {
        if (prefs) delete prefs.hiddenEventTypes;
      }

      for (const [cameraId, types] of Object.entries(hidden)) {
        const normalized = [...new Set(types.map((type) => type.toLowerCase()))];
        if (normalized.length === 0) continue;
        const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
        prefs.hiddenEventTypes = normalized;
      }

      return current;
    });

    return user ? this.getHiddenEventTypes(username) : undefined;
  }

  public async createShortcut(username: string, cameraId: string, shortcutData: DBShortcut): Promise<DBShortcut[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
      prefs.shortcuts.push(shortcutData);

      return current;
    });

    return user?.preferences.cameras[cameraId]?.shortcuts;
  }

  public async patchShortcutById(username: string, cameraId: string, shortcutId: string, shortcutData: Partial<DBShortcut> = {}): Promise<DBShortcut[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
      const shortcut = prefs.shortcuts.find((s) => s._id === shortcutId);
      if (!shortcut) return undefined;

      mergeWith(shortcut, shortcutData, (source: any, target: any) => {
        if (Array.isArray(source)) return target;
      });

      return current;
    });

    return (user ?? this.findById(existing._id))?.preferences.cameras[cameraId]?.shortcuts ?? [];
  }

  public async removeShortcutById(username: string, cameraId: string, shortcutId: string): Promise<DBShortcut[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
      prefs.shortcuts = prefs.shortcuts.filter((s) => s._id !== shortcutId);

      return current;
    });

    return user?.preferences.cameras[cameraId]?.shortcuts;
  }

  public async removeAllShortcuts(username: string, cameraId: string): Promise<DBShortcut[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
      prefs.shortcuts = [];

      return current;
    });

    return user?.preferences.cameras[cameraId]?.shortcuts;
  }

  public async createView(username: string, viewData: DBCamviewLayout): Promise<DBCamviewLayout> {
    const existing = this.findByName(username);
    if (!existing) return viewData;

    await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      current.preferences.camview.views.push(viewData);

      return current;
    });

    return viewData;
  }

  public async patchViewById(username: string, viewid: string, viewData: Partial<DBCamviewLayout> = {}): Promise<DBCamviewLayout | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const view = current.preferences.camview.views.find((v) => v._id === viewid);
      if (!view) return undefined;

      mergeWith(view, viewData, (source: any, target: any) => {
        if (Array.isArray(source)) return target;
      });

      return current;
    });

    return user?.preferences.camview.views.find((v) => v._id === viewid);
  }

  public async removeViewById(username: string, viewid: string): Promise<DBCamviewLayout[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      current.preferences.camview.views = current.preferences.camview.views.filter((v) => v._id !== viewid);

      return current;
    });

    return user?.preferences.camview.views;
  }

  public async removeAllViews(username: string): Promise<DBCamviewLayout[] | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      current.preferences.camview.views = [];

      return current;
    });

    return user?.preferences.camview.views;
  }

  public async resetPreferences(username: string): Promise<void> {
    const existing = this.findByName(username);
    if (!existing) return;

    await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      current.preferences = {
        camview: { views: [] },
        cameras: {},
      };

      return current;
    });
  }

  public async resetAllPreferences(): Promise<void> {
    const userIds = this.list().map((user) => user._id);

    await Promise.all(
      userIds.map((userId) =>
        this.dbs.commit(this.dbs.usersDB, userId, (current) => {
          if (!current) return undefined;

          current.preferences = {
            camview: { views: [] },
            cameras: {},
          };

          return current;
        }),
      ),
    );
  }

  public async removeCameraFromPreferences(cameraId: string): Promise<void> {
    await this.removeCameraFromAllShortcuts(cameraId);
    await this.removeCameraFromAllViews(cameraId);
  }

  public async removeCameraFromAllShortcuts(cameraId: string): Promise<void> {
    const userIds = this.list().map((user) => user._id);

    await Promise.all(
      userIds.map((userId) =>
        this.dbs.commit(this.dbs.usersDB, userId, (current) => {
          if (!current) return undefined;

          let mutated = false;

          // the deleted camera's own view dies with it, shortcuts included
          if (current.preferences.cameras[cameraId]) {
            delete current.preferences.cameras[cameraId];
            mutated = true;
          }

          for (const cameraPreference of Object.values(current.preferences.cameras)) {
            if (!cameraPreference) continue;

            const before = cameraPreference.shortcuts.length;
            cameraPreference.shortcuts = cameraPreference.shortcuts.filter((shortcut) => shortcut.type !== 'camera' || shortcut.cameraId !== cameraId);

            if (cameraPreference.shortcuts.length !== before) mutated = true;
          }

          return mutated ? current : undefined;
        }),
      ),
    );
  }

  public async removeCameraFromAllViews(cameraId: string): Promise<void> {
    const userIds = this.list().map((user) => user._id);

    await Promise.all(
      userIds.map((userId) =>
        this.dbs.commit(this.dbs.usersDB, userId, (current) => {
          if (!current) return undefined;

          let mutated = false;

          for (const view of current.preferences.camview.views) {
            const before = view.cameras.length;
            view.cameras = view.cameras.filter((camera) => camera.cameraId !== cameraId);
            if (view.cameras.length !== before) mutated = true;
          }

          return mutated ? current : undefined;
        }),
      ),
    );
  }

  public getHiddenDevices(username: string): DBHiddenDevice[] {
    const user = this.findByName(username);
    return user?.preferences.discovery?.hiddenDevices ?? [];
  }

  public async hideDevice(username: string, device: DBHiddenDevice): Promise<DBHiddenDevice[]> {
    const existing = this.findByName(username);
    if (!existing) return [];

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const discovery = (current.preferences.discovery ??= { hiddenDevices: [] });
      if (discovery.hiddenDevices.some((d) => d.id === device.id)) return undefined;

      discovery.hiddenDevices.push(device);

      return current;
    });

    return (user ?? this.findById(existing._id))?.preferences.discovery?.hiddenDevices ?? [];
  }

  public async unhideDevice(username: string, deviceId: string): Promise<DBHiddenDevice[]> {
    const existing = this.findByName(username);
    if (!existing) return [];

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const discovery = (current.preferences.discovery ??= { hiddenDevices: [] });
      discovery.hiddenDevices = discovery.hiddenDevices.filter((d) => d.id !== deviceId);

      return current;
    });

    return user?.preferences.discovery?.hiddenDevices ?? [];
  }

  public async updateHiddenDevices(username: string, hiddenDevices: DBHiddenDevice[]): Promise<void> {
    const existing = this.findByName(username);
    if (!existing) return;

    await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      current.preferences.discovery ??= { hiddenDevices: [] };
      current.preferences.discovery.hiddenDevices = hiddenDevices;

      return current;
    });
  }

  private assistant(): AssistantManager | undefined {
    return container.isRegistered('assistantManager') ? container.resolve<AssistantManager>('assistantManager') : undefined;
  }
}
