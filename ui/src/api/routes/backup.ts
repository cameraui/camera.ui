import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { DBBackupSchedulerLastRun, DBBackupSchedulerSettings, MethodKeys, ScheduledBackupEntry, UiLocalStorage } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface BackupSchedulerState {
  settings: DBBackupSchedulerSettings;
  backups: ScheduledBackupEntry[];
  defaultDestination: string;
}

const BACKUP_TIMEOUT_MS = 300_000;

export async function downloadBackupFn(localStorage?: Partial<UiLocalStorage>): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.post('/backup/download', { localStorage }, { responseType: 'arraybuffer', timeout: BACKUP_TIMEOUT_MS });
  return response.data;
}

export async function restoreBackupFn(formData: FormData, onUploadProgress?: (percent: number) => void): Promise<Partial<UiLocalStorage>> {
  const response: AxiosResponse<Partial<UiLocalStorage>> = await api.post('/backup/restore', formData, {
    timeout: BACKUP_TIMEOUT_MS,
    onUploadProgress: (e) => {
      if (e.total) onUploadProgress?.(Math.round((e.loaded / e.total) * 100));
    },
  });
  return response.data;
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

export class BackupQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<BackupQuery>; enabled: boolean }[]>([]);

  get queryClient() {
    return this._queryClient;
  }

  public downloadBackupQuery() {
    return useMutation({
      mutationFn: downloadBackupFn,
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.backup_downloaded'), life: 3000 });
      },
    });
  }

  public restoreBackupQuery() {
    return useMutation({
      mutationFn: (formData: FormData) => restoreBackupFn(formData),
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.backup_restored'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<BackupQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
