import { mergeWith } from '@camera.ui/common/utils';

import { inject, tryInject } from '../../container.js';
import { AuthService } from './auth.service.js';

import type { Database } from '../database/index.js';
import type { DBCamviewLayout, DBHiddenDevice, DBHiddenSensor, DBShortcut, DBUser, EventTypesByCamera, EventTypesField } from '../database/types.js';

export class UsersService {
  private dbs: Database;
  private authService: AuthService;

  constructor() {
    this.dbs = inject('dbs');
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
      await this.authService.revokeUsers([existing._id]);
    }

    const updated = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      mergeWith(current, userData, (source: any, target: any, key: string | number | undefined) => {
        if (Array.isArray(source)) return target;
        if (key === 'navLayout') return target;
      });

      return current;
    });

    if (updated && isAdmin(existing.role) && !isAdmin(updated.role)) {
      this.authService.dropAdminConnections(existing._id);
    }

    return updated;
  }

  public async removeByName(username: string): Promise<void> {
    const user = this.findByName(username);
    if (!user) return;

    await this.authService.revokeUsers([user._id], { apiTokens: true });
    await tryInject('assistantManager')?.forgetUser(user._id);
    await this.dbs.usersDB.remove(user._id);
  }

  public async removeAll(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    const removed = new Set<string>();
    for (const { key, value } of this.dbs.usersDB.getRange()) {
      if (value.role !== 'master') {
        removed.add(key);
        tasks.push(tryInject('assistantManager')?.forgetUser(key) ?? Promise.resolve());
        tasks.push(this.dbs.usersDB.remove(key));
      }
    }

    await this.authService.revokeUsers([...removed], { apiTokens: true });
    await Promise.all(tasks);
  }

  public getEventTypes(username: string, field: EventTypesField): EventTypesByCamera | undefined {
    const user = this.findByName(username);
    if (!user) return undefined;

    const types: EventTypesByCamera = {};
    for (const [cameraId, prefs] of Object.entries(user.preferences.cameras)) {
      const list = prefs?.[field];
      if (list?.length) types[cameraId] = list;
    }
    return types;
  }

  public async setEventTypes(username: string, field: EventTypesField, types: EventTypesByCamera): Promise<EventTypesByCamera | undefined> {
    const existing = this.findByName(username);
    if (!existing) return undefined;

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      for (const prefs of Object.values(current.preferences.cameras)) {
        if (prefs) delete prefs[field];
      }

      for (const [cameraId, list] of Object.entries(types)) {
        const normalized = [...new Set(list.map((type) => type.toLowerCase()))];
        if (normalized.length === 0) continue;
        const prefs = (current.preferences.cameras[cameraId] ??= { shortcuts: [] });
        prefs[field] = normalized;
      }

      return current;
    });

    return user ? this.getEventTypes(username, field) : undefined;
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

      const discovery = (current.preferences.discovery ??= { hiddenDevices: [], hiddenSensors: [] });
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

      const discovery = (current.preferences.discovery ??= { hiddenDevices: [], hiddenSensors: [] });
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

      current.preferences.discovery ??= { hiddenDevices: [], hiddenSensors: [] };
      current.preferences.discovery.hiddenDevices = hiddenDevices;

      return current;
    });
  }

  public getHiddenSensors(username: string): DBHiddenSensor[] {
    return this.findByName(username)?.preferences.discovery?.hiddenSensors ?? [];
  }

  public hideSensors(username: string, sensors: DBHiddenSensor[]): Promise<DBHiddenSensor[]> {
    return this.updateHiddenSensors(username, (hidden) => [...hidden, ...sensors.filter((sensor) => !hidden.some((entry) => sameSensor(entry, sensor)))]);
  }

  public unhideSensors(username: string, sensors: DBHiddenSensor[]): Promise<DBHiddenSensor[]> {
    return this.updateHiddenSensors(username, (hidden) => hidden.filter((entry) => !sensors.some((sensor) => sameSensor(entry, sensor))));
  }

  private async updateHiddenSensors(username: string, update: (hidden: DBHiddenSensor[]) => DBHiddenSensor[]): Promise<DBHiddenSensor[]> {
    const existing = this.findByName(username);
    if (!existing) return [];

    const user = await this.dbs.commit(this.dbs.usersDB, existing._id, (current) => {
      if (!current) return undefined;

      const discovery = (current.preferences.discovery ??= { hiddenDevices: [], hiddenSensors: [] });
      discovery.hiddenSensors = update(discovery.hiddenSensors);

      return current;
    });

    return user?.preferences.discovery?.hiddenSensors ?? [];
  }
}

function isAdmin(role: DBUser['role']): boolean {
  return role === 'admin' || role === 'master';
}

function sameSensor(a: DBHiddenSensor, b: DBHiddenSensor): boolean {
  return a.pluginName === b.pluginName && a.id === b.id;
}
