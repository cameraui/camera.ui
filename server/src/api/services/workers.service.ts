import { createHash, randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { container } from 'tsyringe';

import { Database } from '../database/index.js';

import type { KnownWorker } from '../../workers/types.js';
import type { DBSettings, DBWorkerConnection, DBWorkerCredential, DBWorkerPairing } from '../database/types.js';

const PAIRING_TTL_MS = 15 * 60 * 1000;

export class WorkersService {
  private dbs: Database;

  constructor() {
    this.dbs = container.resolve<Database>('dbs');
  }

  public getOrCreateAgentId(workerName: string): string {
    const existing = this.dbs.workerStateDB.get('state');
    if (existing?.agentId) return existing.agentId;

    const agentId = createHash('sha256').update(`${hostname()}:${workerName}:${Date.now()}`).digest('hex').slice(0, 16);

    this.dbs.workerStateDB.putSync('state', { agentId });
    return agentId;
  }

  public getWorkerConnection(): DBWorkerConnection | undefined {
    return this.dbs.workerStateDB.get('state')?.connection;
  }

  public saveWorkerConnection(connection: DBWorkerConnection): void {
    const state = this.dbs.workerStateDB.get('state');
    if (!state) {
      throw new Error('Worker state not initialized');
    }
    this.dbs.workerStateDB.putSync('state', { ...state, connection });
  }

  public listKnownWorkers(): KnownWorker[] {
    return this.dbs.settingsDB.get('settings')?.knownWorkers ?? [];
  }

  public async rememberWorker(agentId: string, name: string): Promise<void> {
    await this.commitSettings((settings) => {
      const known = settings.knownWorkers ?? [];
      const existing = known.find((worker) => worker.agentId === agentId);

      if (existing) {
        // Only persist on change — this runs on every heartbeat.
        if (existing.name === name && Date.now() - existing.lastSeen < 60_000) {
          return undefined;
        }
        existing.name = name;
        existing.lastSeen = Date.now();
      } else {
        known.push({ agentId, name, lastSeen: Date.now() });
      }

      settings.knownWorkers = known;

      return settings;
    });
  }

  public getWorkerDisplayName(agentId: string): string | undefined {
    return this.listKnownWorkers().find((worker) => worker.agentId === agentId)?.displayName;
  }

  public async renameWorker(agentId: string, displayName: string): Promise<void> {
    if (!this.listKnownWorkers().some((worker) => worker.agentId === agentId)) {
      throw new Error(`Worker ${agentId} is unknown`);
    }

    await this.commitSettings((settings) => {
      const known = settings.knownWorkers?.find((worker) => worker.agentId === agentId);
      if (!known) return undefined;

      known.displayName = displayName;

      return settings;
    });
  }

  public getWorkerServerAddresses(agentId: string): string[] {
    return this.listKnownWorkers().find((worker) => worker.agentId === agentId)?.serverAddresses ?? [];
  }

  public async setWorkerServerAddresses(agentId: string, serverAddresses: string[]): Promise<void> {
    if (!this.listKnownWorkers().some((worker) => worker.agentId === agentId)) {
      throw new Error(`Worker ${agentId} is unknown`);
    }

    await this.commitSettings((settings) => {
      const known = settings.knownWorkers?.find((worker) => worker.agentId === agentId);
      if (!known) return undefined;

      known.serverAddresses = serverAddresses;

      return settings;
    });
  }

  public async forgetWorker(agentId: string): Promise<void> {
    await this.commitSettings((settings) => {
      if (!settings.knownWorkers?.length) return undefined;

      settings.knownWorkers = settings.knownWorkers.filter((worker) => worker.agentId !== agentId);

      return settings;
    });
  }

  public async createPairingCode(): Promise<DBWorkerPairing> {
    const pairing: DBWorkerPairing = {
      code: randomBytes(8).toString('base64url'),
      expiresAt: Date.now() + PAIRING_TTL_MS,
    };

    await this.commitSettings((settings) => {
      settings.workerPairings = [...this.prunePairings(settings), pairing];

      return settings;
    });

    return pairing;
  }

  public isPairingCodeValid(code: string): boolean {
    const settings = this.readSettings();
    return this.prunePairings(settings).some((pairing) => pairing.code === code);
  }

  public async consumePairingCode(code: string): Promise<void> {
    await this.commitSettings((settings) => {
      settings.workerPairings = this.prunePairings(settings).filter((pairing) => pairing.code !== code);

      return settings;
    });
  }

  public listCredentials(): DBWorkerCredential[] {
    return this.dbs.settingsDB.get('settings')?.workerCredentials ?? [];
  }

  public async issueCredentials(agentId: string, name: string): Promise<DBWorkerCredential> {
    const credential: DBWorkerCredential = {
      agentId,
      name,
      user: `worker-${agentId}`,
      secret: randomBytes(32).toString('base64url'),
      createdAt: Date.now(),
    };

    await this.commitSettings((settings) => {
      settings.workerCredentials = [...(settings.workerCredentials ?? []).filter((cred) => cred.agentId !== agentId), credential];

      return settings;
    });

    return credential;
  }

  public async revokeCredentials(agentId: string): Promise<boolean> {
    const settings = await this.commitSettings((current) => {
      const credentials = current.workerCredentials ?? [];
      const remaining = credentials.filter((cred) => cred.agentId !== agentId);

      if (remaining.length === credentials.length) {
        return undefined;
      }

      current.workerCredentials = remaining;

      return current;
    });

    return settings !== undefined;
  }

  private readSettings(): DBSettings {
    return this.dbs.settingsDB.get('settings') ?? { version: Database.VERSION };
  }

  private async commitSettings(apply: (settings: DBSettings) => DBSettings | undefined): Promise<DBSettings | undefined> {
    return this.dbs.commit(this.dbs.settingsDB, 'settings', (current) => apply(current ?? { version: Database.VERSION }));
  }

  private prunePairings(settings: DBSettings): DBWorkerPairing[] {
    return (settings.workerPairings ?? []).filter((pairing) => pairing.expiresAt > Date.now());
  }
}
