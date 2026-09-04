import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { container } from 'tsyringe';

import type { LoggerService } from '@camera.ui/sdk';
import type { Database } from '../api/database/index.js';
import type { DBTrainingCandidate, DBTrainingSettings } from '../api/database/types.js';
import type { SocketService } from '../api/websocket/index.js';
import type { TrainingNamespace } from '../api/websocket/nsp/training.js';
import type { CloudApi } from '../remote/api/index.js';
import type { ProxyServer } from '../rpc/index.js';
import type { TrainingCandidateIngest, TrainingIngestResult } from '../rpc/interfaces/core.js';
import type { ConfigService } from '../services/config/index.js';
import type { TrainingSubmission, TrainingSubmitProgress, TrainingSubmitResult } from './types.js';

const DEFAULT_SETTINGS: DBTrainingSettings = { enabled: true, perCameraLimit: 200, minIntervalSeconds: 10, retentionDays: 14 };
const SUBMIT_ITEM_DELAY_MS = 750;
const SUBMIT_EMIT_INTERVAL_MS = 1000;
const RETENTION_SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class TrainingCandidateManager {
  private logger: LoggerService;
  private dbs: Database;
  private imagesDir: string;
  private lastIngestAt = new Map<string, number>();
  private submitQueue: string[] = [];
  private submitQueued = new Set<string>();
  private submitWorker?: Promise<void>;
  private submitProgress = { total: 0, done: 0, failed: 0 };
  private lastSubmitEmitAt = 0;
  private retentionTimer?: NodeJS.Timeout;

  constructor() {
    this.logger = container.resolve<LoggerService>('logger');
    this.dbs = container.resolve<Database>('dbs');
    this.imagesDir = join(container.resolve<ConfigService>('configService').STORAGE_PATH, 'training-candidates');
    container.registerInstance('trainingCandidateManager', this);
  }

  public async register(): Promise<void> {
    await mkdir(this.imagesDir, { recursive: true }).catch(() => {});
    this.pruneOrphanImages().catch(() => {});
    this.resetUploadLeftovers().catch(() => {});
    this.pruneExpired().catch(() => {});
    this.retentionTimer = setInterval(() => this.pruneExpired().catch(() => {}), RETENTION_SWEEP_INTERVAL_MS);
  }

  public async destroy(): Promise<void> {
    clearInterval(this.retentionTimer);
  }

  public getSettings(): DBTrainingSettings {
    return { ...DEFAULT_SETTINGS, ...this.dbs.settingsDB.get('settings')?.training };
  }

  public async updateSettings(patch: Partial<DBTrainingSettings>): Promise<DBTrainingSettings> {
    const next = { ...this.getSettings(), ...patch };
    await this.dbs.commit(this.dbs.settingsDB, 'settings', (settings) => (settings ? { ...settings, training: next } : undefined));
    if (patch.enabled !== undefined) {
      container.resolve<ProxyServer>('proxy').coreManager?.publishCoreManagerEvent('trainingSettingsChanged', { enabled: next.enabled });
    }
    return next;
  }

  public list(filter?: { cameraId?: string; status?: DBTrainingCandidate['status'] }): DBTrainingCandidate[] {
    const items: DBTrainingCandidate[] = [];
    for (const { value } of this.dbs.trainingCandidatesDB.getRange()) {
      if (filter?.cameraId && value.cameraId !== filter.cameraId) continue;
      if (filter?.status && value.status !== filter.status) continue;
      items.push(value);
    }
    return items.sort((a, b) => b.createdAt - a.createdAt);
  }

  public get(id: string): DBTrainingCandidate | undefined {
    return this.dbs.trainingCandidatesDB.get(id);
  }

  public imagePath(id: string): string | null {
    return this.dbs.trainingCandidatesDB.get(id) ? join(this.imagesDir, `${id}.jpg`) : null;
  }

  public async update(id: string, patch: Pick<Partial<DBTrainingCandidate>, 'boxes' | 'status'>): Promise<DBTrainingCandidate | undefined> {
    if (!this.dbs.trainingCandidatesDB.get(id)) return undefined;
    await this.dbs.commit(this.dbs.trainingCandidatesDB, id, (candidate) =>
      candidate ? { ...candidate, ...patch, upload: undefined, uploadError: undefined } : undefined,
    );
    const updated = this.dbs.trainingCandidatesDB.get(id);
    this.emitChanged(updated?.cameraId);
    return updated;
  }

  public async queueSubmit(ids: string[]): Promise<TrainingSubmitResult> {
    let queued = 0;
    for (const id of ids) {
      const candidate = this.dbs.trainingCandidatesDB.get(id);
      if (candidate?.status !== 'verified' || this.isUploadLocked(candidate) || this.submitQueued.has(id)) continue;
      await this.dbs.commit(this.dbs.trainingCandidatesDB, id, (c) => (c ? { ...c, upload: 'queued' as const, uploadError: undefined } : undefined));
      this.submitQueued.add(id);
      this.submitQueue.push(id);
      queued++;
    }

    if (queued > 0) {
      this.submitProgress.total += queued;
      this.emitChanged();
      this.emitSubmitProgress(true);
      this.submitWorker ??= this.runSubmitQueue().finally(() => {
        this.submitWorker = undefined;
      });
    }
    return { queued };
  }

  public isUploadLocked(candidate: DBTrainingCandidate): boolean {
    return candidate.upload === 'queued' || candidate.upload === 'uploading';
  }

  public currentSubmitProgress(): TrainingSubmitProgress {
    return { active: this.submitWorker !== undefined, ...this.submitProgress };
  }

  public async listSubmissions(): Promise<TrainingSubmission[]> {
    const items = await container.resolve<CloudApi>('cloudApi').trainRoute.list();
    return items.map((s) => ({
      id: s.id,
      labels: s.labels,
      imageBytes: s.image_bytes,
      createdAt: s.created_at,
      usedInWave: s.used_in_wave,
      imageUrl: s.image_url,
    }));
  }

  public async removeSubmission(id: string): Promise<void> {
    await container.resolve<CloudApi>('cloudApi').trainRoute.remove(id);
  }

  public async remove(id: string): Promise<boolean> {
    const candidate = this.dbs.trainingCandidatesDB.get(id);
    if (!candidate) return false;
    await this.dbs.trainingCandidatesDB.remove(id);
    await unlink(join(this.imagesDir, `${id}.jpg`)).catch(() => {});
    this.emitChanged(candidate.cameraId);
    return true;
  }

  public async ingest(payload: TrainingCandidateIngest): Promise<TrainingIngestResult> {
    const settings = this.getSettings();
    if (!settings.enabled) return 'disabled';
    if (payload.boxes.length === 0 || payload.scene.length === 0) return 'skip';

    const last = this.lastIngestAt.get(payload.cameraId) ?? 0;
    if (payload.capturedAt - last < settings.minIntervalSeconds * 1000) return 'skip';
    this.lastIngestAt.set(payload.cameraId, payload.capturedAt);

    const id = randomUUID();
    await writeFile(join(this.imagesDir, `${id}.jpg`), payload.scene);
    this.dbs.trainingCandidatesDB.put(id, {
      id,
      cameraId: payload.cameraId,
      eventId: payload.eventId,
      createdAt: payload.capturedAt,
      status: 'new',
      boxes: payload.boxes,
    });

    await this.enforceCameraLimit(payload.cameraId, settings.perCameraLimit);
    this.emitChanged(payload.cameraId);
    return 'stored';
  }

  private async enforceCameraLimit(cameraId: string, limit: number): Promise<void> {
    // verified candidates are the user's work, eviction only eats unreviewed ones
    const candidates = this.list({ cameraId });
    const evictable = candidates.filter((c) => c.status !== 'verified');
    const overflow = candidates.length - limit;
    if (overflow <= 0) return;
    for (const candidate of evictable.slice(-overflow)) {
      await this.dbs.trainingCandidatesDB.remove(candidate.id);
      await unlink(join(this.imagesDir, `${candidate.id}.jpg`)).catch(() => {});
    }
  }

  private async pruneExpired(): Promise<void> {
    const cutoff = Date.now() - this.getSettings().retentionDays * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const { key, value } of this.dbs.trainingCandidatesDB.getRange()) {
      if (value.status !== 'new' || value.createdAt >= cutoff || this.isUploadLocked(value)) continue;
      const id = String(key);
      await this.dbs.trainingCandidatesDB.remove(id);
      await unlink(join(this.imagesDir, `${id}.jpg`)).catch(() => {});
      removed++;
    }
    if (removed > 0) {
      this.logger.debug(`Training: pruned ${removed} expired candidates`);
      this.emitChanged();
    }
  }

  private async pruneOrphanImages(): Promise<void> {
    const files = await readdir(this.imagesDir).catch(() => [] as string[]);
    if (files.length === 0) return;
    const referenced = new Set<string>();
    for (const { key } of this.dbs.trainingCandidatesDB.getRange()) referenced.add(String(key));
    for (const file of files) {
      if (referenced.has(file.replace(/\.jpg$/, ''))) continue;
      await unlink(join(this.imagesDir, file)).catch(() => {});
    }
  }

  private async runSubmitQueue(): Promise<void> {
    const cloudApi = container.resolve<CloudApi>('cloudApi');

    for (;;) {
      const id = this.submitQueue.shift();
      if (!id) break;
      this.submitQueued.delete(id);
      const candidate = this.dbs.trainingCandidatesDB.get(id);
      if (candidate?.status !== 'verified') continue;

      await this.dbs.commit(this.dbs.trainingCandidatesDB, id, (c) => (c ? { ...c, upload: 'uploading' as const } : undefined));

      try {
        const image = await readFile(join(this.imagesDir, `${id}.jpg`));
        await cloudApi.trainRoute.submit(candidate.boxes, candidate.createdAt, image);
        await this.dbs.trainingCandidatesDB.remove(id);
        await unlink(join(this.imagesDir, `${id}.jpg`)).catch(() => {});
        this.submitProgress.done++;
      } catch (error: any) {
        const message = error?.message ?? String(error);
        await this.dbs.commit(this.dbs.trainingCandidatesDB, id, (c) => (c ? { ...c, upload: 'failed' as const, uploadError: message } : undefined));
        this.submitProgress.failed++;
      }
      const now = Date.now();
      if (now - this.lastSubmitEmitAt >= SUBMIT_EMIT_INTERVAL_MS || this.submitQueue.length === 0) {
        this.lastSubmitEmitAt = now;
        this.emitChanged(candidate.cameraId);
        this.emitSubmitProgress(true);
      }

      if (this.submitQueue.length > 0) await new Promise((resolve) => setTimeout(resolve, SUBMIT_ITEM_DELAY_MS));
    }

    this.emitSubmitProgress(false);
    this.submitProgress = { total: 0, done: 0, failed: 0 };
  }

  private async resetUploadLeftovers(): Promise<void> {
    for (const { key, value } of this.dbs.trainingCandidatesDB.getRange()) {
      const id = String(key);
      if (value.submittedAt || (value.status as string) === 'ignored') {
        await this.dbs.trainingCandidatesDB.remove(id);
        await unlink(join(this.imagesDir, `${id}.jpg`)).catch(() => {});
        continue;
      }
      if (this.isUploadLocked(value)) {
        await this.dbs.commit(this.dbs.trainingCandidatesDB, id, (c) => (c ? { ...c, upload: undefined } : undefined));
      }
    }
  }

  private emitSubmitProgress(active: boolean): void {
    this.trainingNamespace()?.emitSubmitProgress({ active, ...this.submitProgress });
  }

  private trainingNamespace(): TrainingNamespace | undefined {
    try {
      return container.resolve<SocketService>('socketService').namespaces.get('/training') as TrainingNamespace | undefined;
    } catch {
      return undefined;
    }
  }

  private emitChanged(cameraId?: string): void {
    this.trainingNamespace()?.emitCandidatesChanged(cameraId);
  }
}
