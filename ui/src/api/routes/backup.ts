import { dataOrNull } from '@/api/errors.js';
import { axiosInstance as api } from '..';

import type {
  BackupDownloadLink,
  BackupJob,
  BackupKeyInfo,
  DBBackupSchedulerLastRun,
  DBBackupSchedulerSettings,
  MoveOffer,
  MovePullStatus,
  MoveState,
  MoveStatus,
  RestoreMode,
  RestoreNotice,
  RestoreOverview,
  RestoreStarted,
  RestoreStatus,
  RestoreUpload,
  ScheduledBackupEntry,
  UiLocalStorage,
} from '@shared/types';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface BackupSchedulerState {
  settings: DBBackupSchedulerSettings;
  backups: ScheduledBackupEntry[];
  defaultDestination: string;
  destination?: string;
  lastBackupAt?: number;
}

export type BackupDownloadSource = { url: string; filename: string } | { blob: Blob };

const BACKUP_TIMEOUT_MS = 300_000;

export async function backupDownloadSourceFn(localStorage?: Partial<UiLocalStorage>): Promise<BackupDownloadSource> {
  const link = await dataOrNull<BackupDownloadLink>(api.post('/backup/download/link', { localStorage }, { timeout: BACKUP_TIMEOUT_MS }));
  return link ? { url: link.url, filename: link.filename } : { blob: new Blob([await downloadBackupFn(localStorage)]) };
}

export async function startBackupJobFn(localStorage?: Partial<UiLocalStorage>): Promise<BackupJob | null> {
  return dataOrNull<BackupJob>(api.post('/backup/jobs', { localStorage }));
}

export async function backupJobFn(): Promise<BackupJob | null> {
  return getOrNull('/backup/jobs');
}

export async function backupKeyFn(): Promise<BackupKeyInfo> {
  const response: AxiosResponse<BackupKeyInfo> = await api.get('/backup/key');
  return response.data;
}

export async function confirmBackupKeyFn(): Promise<BackupKeyInfo> {
  const response: AxiosResponse<BackupKeyInfo> = await api.post('/backup/key/confirm');
  return response.data;
}

export async function scheduledBackupDownloadSourceFn(filename: string): Promise<BackupDownloadSource> {
  const link = await dataOrNull<BackupDownloadLink>(api.post(`/backup/scheduler/backups/${encodeURIComponent(filename)}/link`));
  return link ? { url: link.url, filename: link.filename } : { blob: new Blob([await downloadScheduledBackupFn(filename)]) };
}

export async function downloadBackupFn(localStorage?: Partial<UiLocalStorage>): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.post('/backup/download', { localStorage }, { responseType: 'arraybuffer', timeout: BACKUP_TIMEOUT_MS });
  return response.data;
}

export async function createRestoreUploadFn(size: number, name: string): Promise<RestoreUpload> {
  const response: AxiosResponse<RestoreUpload> = await api.post('/backup/restore/uploads', { size, name });
  return response.data;
}

export async function restoreUploadStatusFn(id: string): Promise<RestoreUpload> {
  const response: AxiosResponse<RestoreUpload> = await api.get(`/backup/restore/uploads/${id}`);
  return response.data;
}

export async function appendRestoreUploadFn(id: string, offset: number, chunk: Blob, onUploadProgress?: (loaded: number) => void): Promise<RestoreUpload> {
  const response: AxiosResponse<RestoreUpload> = await api.patch(`/backup/restore/uploads/${id}`, chunk, {
    headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) },
    timeout: BACKUP_TIMEOUT_MS,
    onUploadProgress: (e) => onUploadProgress?.(e.loaded),
  });
  return response.data;
}

export async function completeRestoreUploadFn(id: string, key?: string): Promise<RestoreStarted> {
  const response: AxiosResponse<RestoreStarted> = await api.post(`/backup/restore/uploads/${id}/complete`, key ? { key } : undefined, { timeout: BACKUP_TIMEOUT_MS });
  return response.data;
}

export async function removeRestoreUploadFn(id: string): Promise<void> {
  await api.delete(`/backup/restore/uploads/${id}`);
}

export async function restoreScheduledBackupFn(filename: string, key?: string): Promise<RestoreStarted> {
  const response: AxiosResponse<RestoreStarted> = await api.post(`/backup/scheduler/backups/${encodeURIComponent(filename)}/restore`, key ? { key } : undefined, {
    timeout: BACKUP_TIMEOUT_MS,
  });
  return response.data;
}

export async function getRestoreFn(): Promise<RestoreOverview> {
  const response: AxiosResponse<RestoreOverview> = await api.get('/backup/restore');
  return response.data;
}

async function getOrNull<T>(url: string, config?: AxiosRequestConfig): Promise<T | null> {
  return dataOrNull<T>(api.get(url, config));
}

export async function restoreStatusFn(ticket?: string): Promise<RestoreStatus | RestoreNotice | null> {
  return getOrNull('/backup/restore/status', { headers: ticket ? { 'X-Restore-Ticket': ticket } : undefined, timeout: 5000 });
}

export async function confirmRestoreFn(mode: RestoreMode): Promise<RestoreStatus> {
  const response: AxiosResponse<RestoreStatus> = await api.post('/backup/restore/confirm', { mode });
  return response.data;
}

export async function cancelRestoreFn(): Promise<RestoreStatus> {
  const response: AxiosResponse<RestoreStatus> = await api.delete('/backup/restore');
  return response.data;
}

export async function undoRestoreFn(): Promise<RestoreStarted> {
  const response: AxiosResponse<RestoreStarted> = await api.post('/backup/restore/undo');
  return response.data;
}

export async function retryRestorePluginFn(name: string): Promise<RestoreStatus | null> {
  const response: AxiosResponse<RestoreStatus | null> = await api.post('/backup/restore/plugins/retry', { name }, { timeout: BACKUP_TIMEOUT_MS });
  return response.data;
}

export async function discardRestorePluginFn(name: string): Promise<RestoreStatus> {
  const response: AxiosResponse<RestoreStatus> = await api.post('/backup/restore/plugins/discard', { name });
  return response.data;
}

export async function startMovePullFn(code: string, address?: string): Promise<MovePullStatus> {
  const response: AxiosResponse<MovePullStatus> = await api.post('/backup/restore/move', { code, address: address || undefined });
  return response.data;
}

export async function movePullStatusFn(): Promise<MovePullStatus | null> {
  return getOrNull('/backup/restore/move');
}

export async function cancelMovePullFn(): Promise<void> {
  await api.delete('/backup/restore/move');
}

export async function createMoveFn(hosts: string[]): Promise<MoveOffer> {
  const response: AxiosResponse<MoveOffer> = await api.post('/backup/move', { hosts });
  return response.data;
}

export async function moveStatusFn(): Promise<MoveStatus | null> {
  return getOrNull('/backup/move');
}

export async function cancelMoveFn(): Promise<{ restart: boolean }> {
  const response: AxiosResponse<{ restart: boolean }> = await api.delete('/backup/move');
  return response.data;
}

export async function movedAwayStateFn(): Promise<MoveState | null> {
  return (await getOrNull<{ state: MoveState }>('/backup/move/state', { timeout: 5000 }))?.state ?? null;
}

export async function getBackupSchedulerFn(): Promise<BackupSchedulerState> {
  const response: AxiosResponse<BackupSchedulerState> = await api.get('/backup/scheduler');
  return response.data;
}

export async function patchBackupSchedulerFn(settings: Partial<DBBackupSchedulerSettings>): Promise<DBBackupSchedulerSettings> {
  const response: AxiosResponse<DBBackupSchedulerSettings> = await api.patch('/backup/scheduler', settings);
  return response.data;
}

export async function runBackupSchedulerFn(): Promise<DBBackupSchedulerLastRun> {
  const response: AxiosResponse<DBBackupSchedulerLastRun> = await api.post('/backup/scheduler/run');
  return response.data;
}

export async function downloadScheduledBackupFn(filename: string): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.get(`/backup/scheduler/backups/${encodeURIComponent(filename)}`, {
    responseType: 'arraybuffer',
    timeout: BACKUP_TIMEOUT_MS,
  });
  return response.data;
}

export async function deleteScheduledBackupFn(filename: string): Promise<void> {
  await api.delete(`/backup/scheduler/backups/${encodeURIComponent(filename)}`);
}
