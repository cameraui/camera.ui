import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { NotifierDevice } from '@camera.ui/sdk';
import type { DBNotificationSettings, MethodKeys, NotifierDeviceWithSource, ResolvedNotification, SourcesListing } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface RegisterNotifierDeviceBody {
  pluginName: string;
  input: Record<string, unknown>;
}

export interface UpdateNotifierDevicePatch {
  name?: string;
  active?: boolean;
}

export async function getNotificationSettingsFn({ signal }: { signal: AbortSignal }): Promise<DBNotificationSettings> {
  const response: AxiosResponse<DBNotificationSettings> = await api.get('/notifications/settings', { signal });
  return response.data;
}

export async function setNotificationSettingsFn({ settings }: { settings: DBNotificationSettings }): Promise<DBNotificationSettings> {
  const response: AxiosResponse<DBNotificationSettings> = await api.put('/notifications/settings', settings);
  return response.data;
}

export async function listNotifierDevicesFn({ signal }: { signal: AbortSignal }): Promise<NotifierDeviceWithSource[]> {
  const response: AxiosResponse<NotifierDeviceWithSource[]> = await api.get('/notifications/devices', { signal });
  return response.data;
}

export async function listNotificationSourcesFn({ signal }: { signal: AbortSignal }): Promise<SourcesListing> {
  const response: AxiosResponse<SourcesListing> = await api.get('/notifications/sources', { signal });
  return response.data;
}

export async function getNotificationHistoryFn({ signal }: { signal: AbortSignal }): Promise<ResolvedNotification[]> {
  const response: AxiosResponse<ResolvedNotification[]> = await api.get('/notifications/history', { signal });
  return response.data;
}

export async function clearNotificationHistoryFn(): Promise<void> {
  await api.delete('/notifications/history');
}

export async function revokeNotifierDeviceFn({ deviceId }: { deviceId: string }): Promise<void> {
  await api.delete(`/notifications/devices/${encodeURIComponent(deviceId)}`);
}

export async function registerNotifierDeviceFn(body: RegisterNotifierDeviceBody): Promise<NotifierDevice> {
  const response: AxiosResponse<NotifierDevice> = await api.post('/notifications/devices', body);
  return response.data;
}

export async function updateNotifierDeviceFn({ deviceId, patch }: { deviceId: string; patch: UpdateNotifierDevicePatch }): Promise<NotifierDevice> {
  const response: AxiosResponse<NotifierDevice> = await api.patch(`/notifications/devices/${encodeURIComponent(deviceId)}`, patch);
  return response.data;
}

export class NotificationsQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<NotificationsQuery>; enabled: boolean }[]>([
    { name: 'getSettingsQuery', enabled: true },
    { name: 'listDevicesQuery', enabled: true },
    { name: 'listSourcesQuery', enabled: true },
    { name: 'getHistoryQuery', enabled: true },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public getSettingsQuery() {
    return useQueryEnhanced({
      queryKey: ['notifications', 'settings'],
      queryFn: ({ signal }) => getNotificationSettingsFn({ signal }),
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getSettingsQuery' && q.enabled),
    });
  }

  public setSettingsQuery() {
    return useMutation({
      mutationFn: setNotificationSettingsFn,
      onSuccess: (saved) => {
        this._queryClient.setQueryData(['notifications', 'settings'], saved);
        this.toast.add({ severity: 'success', detail: this.t('views.settings.notifications.saved'), life: 3000 });
      },
      onError: (err: any) => {
        this.toast.add({ severity: 'error', detail: err, life: 3000 });
      },
    });
  }

  public setSettingsQuerySilent() {
    return useMutation({
      mutationFn: setNotificationSettingsFn,
      onSuccess: (saved) => {
        this._queryClient.setQueryData(['notifications', 'settings'], saved);
      },
    });
  }

  public listDevicesQuery(enabled?: () => boolean) {
    return useQueryEnhanced({
      queryKey: ['notifications', 'devices'],
      queryFn: ({ signal }) => listNotifierDevicesFn({ signal }),
      enabled: () => (enabled?.() ?? true) && this.queryActivator.value.some((q) => q.name === 'listDevicesQuery' && q.enabled),
    });
  }

  public listSourcesQuery() {
    return useQueryEnhanced({
      queryKey: ['notifications', 'sources'],
      queryFn: ({ signal }) => listNotificationSourcesFn({ signal }),
      enabled: () => this.queryActivator.value.some((q) => q.name === 'listSourcesQuery' && q.enabled),
    });
  }

  public getHistoryQuery() {
    return useQueryEnhanced({
      queryKey: ['notifications', 'history'],
      queryFn: ({ signal }) => getNotificationHistoryFn({ signal }),
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getHistoryQuery' && q.enabled),
    });
  }

  public clearHistoryQuery() {
    return useMutation({
      mutationFn: clearNotificationHistoryFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['notifications', 'history'] });
      },
    });
  }

  public revokeDeviceQuery() {
    return useMutation({
      mutationFn: revokeNotifierDeviceFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['notifications', 'devices'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.notifications.device_revoked'), life: 3000 });
      },
      onError: (err: any) => {
        this.toast.add({ severity: 'error', detail: err, life: 3000 });
      },
    });
  }

  public updateDeviceQuery() {
    return useMutation({
      mutationFn: updateNotifierDeviceFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['notifications', 'devices'] });
      },
      onError: (err: any) => {
        this.toast.add({ severity: 'error', detail: err, life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<NotificationsQuery>, state: boolean) {
    const query = this.queryActivator.value.find((q) => q.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
