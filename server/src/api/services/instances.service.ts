import { randomUUID } from 'node:crypto';
import { cpus, loadavg, platform } from 'node:os';
import { currentLoad, mem } from 'systeminformation';
import { container } from 'tsyringe';

import { ConfigService } from '../../services/config/index.js';
import { decryptPassword, encryptPassword } from '../utils/encryption.js';

import type { CameraUiAPI } from '../../api.js';
import type { PluginManager } from '../../plugins/index.js';
import type { Database } from '../database/index.js';
import type { DBInstance, DBInstancesConfig } from '../database/types.js';
import type { CreateInstanceInput, UpdateInstanceInput } from '../schemas/instances.schema.js';
import type { UserData } from '../types/index.js';

export interface ServerStatus {
  name: string;
  version: string;
  cpuUsage: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  cameras: {
    total: number;
    online: number;
    recording: number;
  };
}

// Cache local status for 5 seconds
let _localStatusCache: { data: ServerStatus; ts: number } | null = null;
const LOCAL_STATUS_TTL = 5_000;

export class InstancesService {
  private dbs: Database;
  private configService: ConfigService;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
    this.configService = container.resolve<ConfigService>('configService');
  }

  public getHomeId(): string {
    return this.getConfig().homeId;
  }

  public getIdentity(): { homeId: string } {
    return { homeId: this.getHomeId() };
  }

  public getAll(): { instances: DBInstance[]; homeId: string } {
    const instances = this.getInstances().map((inst) => this.maskInstance(inst));
    return { instances, homeId: this.getHomeId() };
  }

  public getById(id: string): DBInstance | undefined {
    const instance = this.getInstances().find((i) => i.id === id);
    if (!instance) return undefined;
    return this.maskInstance(instance);
  }

  public async create(input: CreateInstanceInput, username: string): Promise<DBInstance> {
    const instances = this.getInstances();

    const instance: DBInstance = {
      id: randomUUID(),
      name: input.name,
      url: input.url.replace(/\/+$/, ''),
      favorite: true,
      addedAt: Date.now(),
      addedBy: username,
    };

    const { encrypted, iv } = encryptPassword(input.credentials.password, this.secret);
    instance.credentials = {
      username: input.credentials.username,
      encryptedPassword: encrypted,
      iv,
    };

    // Try to login and cache tokens, then fetch remote homeId for self-reference detection
    try {
      const userData = await this.loginRemote(instance.url, input.credentials.username, input.credentials.password);
      instance.tokenCache = {
        accessToken: userData.access_token,
        refreshToken: userData.refresh_token,
        cachedAt: Date.now(),
      };

      // With a valid token, fetch the remote server's homeId
      try {
        const res = await fetch(`${instance.url}/api/instances/identity`, {
          headers: { Authorization: `Bearer ${userData.access_token}` },
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const data = (await res.json()) as { homeId: string };
          if (data.homeId) {
            instance.remoteHomeId = data.homeId;
          }
        }
      } catch {
        // Remote doesn't support identity endpoint yet — ignore
      }
    } catch {
      // Login failed — still save the instance, tokens will be fetched later
    }

    instances.push(instance);
    await this.saveInstances(instances);

    return this.maskInstance(instance);
  }

  public async update(id: string, input: UpdateInstanceInput): Promise<DBInstance | undefined> {
    const instances = this.getInstances();
    const instance = instances.find((i) => i.id === id);
    if (!instance) return undefined;

    if (input.name !== undefined) instance.name = input.name;
    if (input.url !== undefined) instance.url = input.url.replace(/\/+$/, '');

    if (input.credentials === null) {
      delete instance.credentials;
      delete instance.tokenCache;
    } else if (input.credentials) {
      const { encrypted, iv } = encryptPassword(input.credentials.password, this.secret);
      instance.credentials = {
        username: input.credentials.username,
        encryptedPassword: encrypted,
        iv,
      };
      delete instance.tokenCache;

      try {
        const userData = await this.loginRemote(instance.url, input.credentials.username, input.credentials.password);
        instance.tokenCache = {
          accessToken: userData.access_token,
          refreshToken: userData.refresh_token,
          cachedAt: Date.now(),
        };
      } catch {
        // Login failed — tokens will be fetched later
      }
    }

    await this.saveInstances(instances);

    return this.maskInstance(instance);
  }

  public async toggleFavorite(id: string): Promise<boolean | undefined> {
    const instances = this.getInstances();
    const instance = instances.find((i) => i.id === id);
    if (!instance) return undefined;

    instance.favorite = !(instance.favorite ?? true);
    await this.saveInstances(instances);
    return instance.favorite;
  }

  public async remove(id: string): Promise<boolean> {
    const instances = this.getInstances();
    const index = instances.findIndex((i) => i.id === id);
    if (index === -1) return false;

    instances.splice(index, 1);
    await this.saveInstances(instances);
    return true;
  }

  public getCredentials(id: string): { username: string; password: string } | null {
    const instance = this.getInstances().find((i) => i.id === id);
    if (!instance?.credentials) return null;

    const password = decryptPassword(instance.credentials.encryptedPassword, instance.credentials.iv, this.secret);
    return { username: instance.credentials.username, password };
  }

  public async loginToRemote(id: string): Promise<UserData> {
    const instance = this.getInstances().find((i) => i.id === id);
    if (!instance) throw new Error('Instance not found');

    const credentials = this.getCredentials(id);
    if (!credentials) throw new Error('No credentials configured for this instance');

    const userData = await this.loginRemote(instance.url, credentials.username, credentials.password);
    await this.cacheToken(id, userData.access_token, userData.refresh_token);
    return userData;
  }

  public async getLocalStatus(): Promise<ServerStatus> {
    if (_localStatusCache && Date.now() - _localStatusCache.ts < LOCAL_STATUS_TTL) {
      return _localStatusCache.data;
    }

    const api = container.resolve<CameraUiAPI>('api');
    const pluginManager = container.resolve<PluginManager>('pluginManager');

    // CPU
    let cpuUsage: number;
    if (platform() === 'freebsd') {
      cpuUsage = (loadavg()[0] * 100) / cpus().length;
    } else {
      cpuUsage = (await currentLoad()).currentLoad;
    }

    // Memory
    const memory = await mem();
    const memUsed = memory.total - memory.available;

    // Disk — try NVR plugin first, fallback to 0
    let diskUsed = 0;
    let diskTotal = 0;
    let recording = 0;

    const nvrPlugin = pluginManager.plugins.get('camera-ui-nvr') ?? pluginManager.plugins.get('@camera.ui/camera-ui-nvr');
    if (nvrPlugin?.worker) {
      try {
        const proxy = nvrPlugin.worker.pluginProxy as
          { getStorageStats?: () => Promise<{ diskTotalGB: number; diskUsedGB: number; cameras?: Record<string, { isRecording: boolean }> }> } | undefined;
        const storageStats = await proxy?.getStorageStats?.();
        if (storageStats) {
          diskTotal = Math.round(storageStats.diskTotalGB * 1000);
          diskUsed = Math.round(storageStats.diskUsedGB * 1000);
          // Count recording cameras
          const cameras = storageStats.cameras;
          if (cameras) {
            recording = Object.values(cameras).filter((c) => c.isRecording).length;
          }
        }
      } catch {
        // NVR not available
      }
    }

    // Cameras
    const allCameras = api.getCameras();
    const onlineCameras = allCameras.filter((c) => c.connected).length;

    const status: ServerStatus = {
      name: 'Local',
      version: ConfigService.VERSION,
      cpuUsage: Math.round(cpuUsage * 100) / 100,
      memUsed: Math.round(memUsed / (1024 * 1024)),
      memTotal: Math.round(memory.total / (1024 * 1024)),
      diskUsed,
      diskTotal,
      cameras: {
        total: allCameras.length,
        online: onlineCameras,
        recording,
      },
    };

    _localStatusCache = { data: status, ts: Date.now() };
    return status;
  }

  public async getRemoteStatus(id: string): Promise<ServerStatus> {
    const instance = this.getInstances().find((i) => i.id === id);
    if (!instance) throw new Error('Instance not found');

    const token = await this.getValidToken(id);

    const res = await fetch(`${instance.url}/api/instances/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Remote status failed (${res.status})`);
    }

    return (await res.json()) as ServerStatus;
  }

  private get secret(): string {
    return this.configService.SECRETS.jwtAccessKey;
  }

  private getInstances(): DBInstance[] {
    return [...this.dbs.instancesDB.getRange()].map(({ value }) => value);
  }

  private getConfig(): DBInstancesConfig {
    return this.dbs.instancesConfigDB.get('instancesConfig')!;
  }

  private maskInstance(inst: DBInstance): DBInstance {
    return {
      ...inst,
      favorite: inst.favorite ?? true,
      credentials: inst.credentials ? { username: inst.credentials.username, encryptedPassword: '***', iv: '' } : undefined,
      tokenCache: undefined,
    };
  }

  private async saveInstances(instances: DBInstance[]): Promise<void> {
    const newIds = new Set(instances.map((i) => i.id));

    // Single transaction: parallele Reader sehen entweder den alten oder
    // den vollen neuen Zustand, nie ein Mid-Transaction-Mix.
    await this.dbs.instancesDB.transaction(() => {
      for (const key of this.dbs.instancesDB.getKeys()) {
        if (!newIds.has(key)) {
          this.dbs.instancesDB.remove(key);
        }
      }
      for (const instance of instances) {
        this.dbs.instancesDB.put(instance.id, instance);
      }
    });
  }

  private async cacheToken(id: string, accessToken: string, refreshToken: string): Promise<void> {
    const instances = this.getInstances();
    const instance = instances.find((i) => i.id === id);
    if (!instance) return;

    instance.tokenCache = { accessToken, refreshToken, cachedAt: Date.now() };
    await this.saveInstances(instances);
  }

  private async getValidToken(id: string): Promise<string> {
    const instance = this.getInstances().find((i) => i.id === id);
    if (!instance) throw new Error('Instance not found');

    const cached = instance.tokenCache;

    // Try cached token first (test with a lightweight request)
    if (cached?.accessToken) {
      const ok = await this.testToken(instance.url, cached.accessToken);
      if (ok) return cached.accessToken;

      // Try refresh
      if (cached.refreshToken) {
        try {
          const tokens = await this.refreshToken(instance.url, cached.refreshToken);
          await this.cacheToken(id, tokens.access_token, tokens.refresh_token);
          return tokens.access_token;
        } catch {
          // Refresh failed, fall through to re-login
        }
      }
    }

    // Re-login with credentials
    const credentials = this.getCredentials(id);
    if (!credentials) throw new Error('No credentials configured for this instance');

    const userData = await this.loginRemote(instance.url, credentials.username, credentials.password);
    await this.cacheToken(id, userData.access_token, userData.refresh_token);
    return userData.access_token;
  }

  private async testToken(url: string, token: string): Promise<boolean> {
    try {
      const res = await fetch(`${url}/api/auth/check`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async refreshToken(url: string, refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const res = await fetch(`${url}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) throw new Error(`Refresh failed (${res.status})`);
    return (await res.json()) as { access_token: string; refresh_token: string };
  }

  private async loginRemote(url: string, username: string, password: string): Promise<UserData> {
    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        kind: 'native',
        persistent: true,
        device: {
          id: `cui:server:${this.getHomeId()}`,
          name: 'camera.ui server',
        },
      }),
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Remote login failed (${res.status}): ${body}`);
    }

    return (await res.json()) as UserData;
  }
}
