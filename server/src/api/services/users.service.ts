import { mergeWith } from '@camera.ui/common/utils';
import { container } from 'tsyringe';

import { AuthService } from './auth.service.js';

import type { Database } from '../database/index.js';
import type { DBCamviewLayout, DBHiddenDevice, DBShortcut, DBUser } from '../database/types.js';

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
    const user = this.findByName(username);
    if (!user) return undefined;

    const usernameChanged = userData.username !== undefined && userData.username !== user.username;
    const passwordChanged = userData.password !== undefined && userData.password !== user.password;

    mergeWith(user, userData, (source: any, target: any) => {
      if (Array.isArray(source)) return target;
    });

    if (usernameChanged || passwordChanged) {
      await this.authService.invalidateByUserId(user._id);
    }

    await this.dbs.usersDB.put(user._id, user);
    return user;
  }

  public async removeByName(username: string): Promise<void> {
    const user = this.findByName(username);
    if (!user) return;

    await this.authService.invalidateByUserId(user._id);
    await this.dbs.usersDB.remove(user._id);
  }

  public async removeAll(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const { key, value } of this.dbs.usersDB.getRange()) {
      if (value.role !== 'master') {
        tasks.push(this.dbs.usersDB.remove(key));
      }
    }

    await this.authService.invalidateAll();
    await Promise.all(tasks);
  }

  public async createShortcut(username: string, cameraId: string, shortcutData: DBShortcut): Promise<DBShortcut[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    const prefs = (user.preferences.cameras[cameraId] ??= { shortcuts: [] });
    prefs.shortcuts.push(shortcutData);

    await this.dbs.usersDB.put(user._id, user);
    return prefs.shortcuts;
  }

  public async patchShortcutById(username: string, cameraId: string, shortcutId: string, shortcutData: Partial<DBShortcut> = {}): Promise<DBShortcut[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    const prefs = (user.preferences.cameras[cameraId] ??= { shortcuts: [] });
    const shortcut = prefs.shortcuts.find((s) => s._id === shortcutId);

    if (shortcut) {
      mergeWith(shortcut, shortcutData, (source: any, target: any) => {
        if (Array.isArray(source)) return target;
      });
      await this.dbs.usersDB.put(user._id, user);
    }

    return prefs.shortcuts;
  }

  public async removeShortcutById(username: string, cameraId: string, shortcutId: string): Promise<DBShortcut[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    const prefs = (user.preferences.cameras[cameraId] ??= { shortcuts: [] });
    prefs.shortcuts = prefs.shortcuts.filter((s) => s._id !== shortcutId);

    await this.dbs.usersDB.put(user._id, user);
    return prefs.shortcuts;
  }

  public async removeAllShortcuts(username: string, cameraId: string): Promise<DBShortcut[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    const prefs = (user.preferences.cameras[cameraId] ??= { shortcuts: [] });
    prefs.shortcuts = [];

    await this.dbs.usersDB.put(user._id, user);
    return prefs.shortcuts;
  }

  public async createView(username: string, viewData: DBCamviewLayout): Promise<DBCamviewLayout> {
    const user = this.findByName(username);
    if (user) {
      user.preferences.camview.views.push(viewData);
      await this.dbs.usersDB.put(user._id, user);
    }
    return viewData;
  }

  public async patchViewById(username: string, viewid: string, viewData: Partial<DBCamviewLayout> = {}): Promise<DBCamviewLayout | undefined> {
    const user = this.findByName(username);
    const view = user?.preferences.camview.views.find((v) => v._id === viewid);

    if (user && view) {
      mergeWith(view, viewData, (source: any, target: any) => {
        if (Array.isArray(source)) return target;
      });
      await this.dbs.usersDB.put(user._id, user);
    }

    return view;
  }

  public async removeViewById(username: string, viewid: string): Promise<DBCamviewLayout[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    user.preferences.camview.views = user.preferences.camview.views.filter((v) => v._id !== viewid);
    await this.dbs.usersDB.put(user._id, user);

    return user.preferences.camview.views;
  }

  public async removeAllViews(username: string): Promise<DBCamviewLayout[] | undefined> {
    const user = this.findByName(username);
    if (!user) return undefined;

    user.preferences.camview.views = [];
    await this.dbs.usersDB.put(user._id, user);

    return user.preferences.camview.views;
  }

  public async resetPreferences(username: string): Promise<void> {
    const user = this.findByName(username);
    if (!user) return;

    user.preferences = {
      camview: { views: [] },
      cameras: {},
    };

    await this.dbs.usersDB.put(user._id, user);
  }

  public async resetAllPreferences(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const { value: user } of this.dbs.usersDB.getRange()) {
      user.preferences = {
        camview: { views: [] },
        cameras: {},
      };
      tasks.push(this.dbs.usersDB.put(user._id, user));
    }
    await Promise.all(tasks);
  }

  public async removeCameraFromPreferences(cameraId: string): Promise<void> {
    await this.removeCameraFromAllShortcuts(cameraId);
    await this.removeCameraFromAllViews(cameraId);
  }

  public async removeCameraFromAllShortcuts(cameraId: string): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const { value: user } of this.dbs.usersDB.getRange()) {
      let mutated = false;

      for (const cameraPreference of Object.values(user.preferences.cameras)) {
        if (!cameraPreference) continue;

        const before = cameraPreference.shortcuts.length;
        cameraPreference.shortcuts = cameraPreference.shortcuts.filter((shortcut) => {
          // Remove camera shortcuts pointing to the deleted camera
          if (shortcut.type === 'camera') return shortcut.cameraId !== cameraId;
          // Remove sensor shortcuts belonging to the deleted camera
          if (shortcut.type === 'sensor') return shortcut.sensorCameraId !== cameraId;
          return true;
        });

        if (cameraPreference.shortcuts.length !== before) mutated = true;
      }

      if (mutated) tasks.push(this.dbs.usersDB.put(user._id, user));
    }

    await Promise.all(tasks);
  }

  public async removeCameraFromAllViews(cameraId: string): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    for (const { value: user } of this.dbs.usersDB.getRange()) {
      let mutated = false;

      for (const view of user.preferences.camview.views) {
        const before = view.cameras.length;
        view.cameras = view.cameras.filter((camera) => camera.cameraId !== cameraId);
        if (view.cameras.length !== before) mutated = true;
      }

      if (mutated) tasks.push(this.dbs.usersDB.put(user._id, user));
    }

    await Promise.all(tasks);
  }

  public getHiddenDevices(username: string): DBHiddenDevice[] {
    const user = this.findByName(username);
    return user?.preferences.discovery?.hiddenDevices ?? [];
  }

  public async hideDevice(username: string, device: DBHiddenDevice): Promise<DBHiddenDevice[]> {
    const user = this.findByName(username);
    if (!user) return [];

    const discovery = (user.preferences.discovery ??= { hiddenDevices: [] });

    if (!discovery.hiddenDevices.some((d) => d.id === device.id)) {
      discovery.hiddenDevices.push(device);
      await this.dbs.usersDB.put(user._id, user);
    }

    return discovery.hiddenDevices;
  }

  public async unhideDevice(username: string, deviceId: string): Promise<DBHiddenDevice[]> {
    const user = this.findByName(username);
    if (!user) return [];

    const discovery = (user.preferences.discovery ??= { hiddenDevices: [] });
    discovery.hiddenDevices = discovery.hiddenDevices.filter((d) => d.id !== deviceId);

    await this.dbs.usersDB.put(user._id, user);
    return discovery.hiddenDevices;
  }

  public async updateHiddenDevices(username: string, hiddenDevices: DBHiddenDevice[]): Promise<void> {
    const user = this.findByName(username);
    if (!user) return;

    user.preferences.discovery ??= { hiddenDevices: [] };
    user.preferences.discovery.hiddenDevices = hiddenDevices;

    await this.dbs.usersDB.put(user._id, user);
  }
}
