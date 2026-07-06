import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { UpdateServerInput } from '@/schemas/server.schema.js';
import type { DBServer, Go2RtcInfo, MethodKeys, ServerInfo } from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function getServerInfo(): Promise<ServerInfo> {
  const response: AxiosResponse<ServerInfo> = await api.get('/server');
  return response.data;
}

export async function patchServerInfo(systemData: Partial<DBServer>): Promise<DBServer> {
  const response: AxiosResponse<DBServer> = await api.patch('/server', systemData);
  return response.data;
}

export async function updateServerFn({ serverData }: { serverData: UpdateServerInput }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.post('/server/update', serverData, { timeout: 360_000 });
  return response.data;
}

export async function checkVersion({ signal }: { signal: AbortSignal }): Promise<{ versions: string[]; 'dist-tags': Record<string, string> }> {
  const response: AxiosResponse<{ versions: string[]; 'dist-tags': Record<string, string> }> = await api.get('/server/version', { signal });
  return response.data;
}

export async function clearLogFn(source?: string): Promise<AckResponse> {
  const params = source && source !== 'all' ? { source } : undefined;
  const response: AxiosResponse<AckResponse> = await api.delete('/server/log', { params });
  return response.data;
}

export async function downloadLogFn({ signal, source }: { signal: AbortSignal; source?: string }): Promise<BlobPart> {
  const params = source && source !== 'all' ? { source } : undefined;
  const response: AxiosResponse<BlobPart> = await api.get('/server/log/download', { signal, params });
  return response.data;
}

export async function downloadCertFn(): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.post('/server/cert', { responseType: 'arraybuffer' });
  return response.data;
}

export async function go2rtcInfo({ signal }: { signal: AbortSignal }): Promise<Go2RtcInfo> {
  const response: AxiosResponse<Go2RtcInfo> = await api.get('/server/go2rtc', { signal });
  return response.data;
}

export async function restartSystemFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put('/server/restart');
  return response.data;
}

export async function restartGo2RtcFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put('/server/restart/go2rtc');
  return response.data;
}

export async function resetSystemFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put('/server/reset');
  return response.data;
}

export class ServerQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<ServerQuery>; enabled: boolean }[]>([
    {
      name: 'downloadLogQuery',
      enabled: true,
    },
    {
      name: 'getGo2RtcInfoQuery',
      enabled: true,
    },
    {
      name: 'checkVersionQuery',
      enabled: true,
    },
    {
      name: 'getServerInfoQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public getServerInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['server'],
      queryFn: getServerInfo,
    });
  }

  public patchSystemInfoQuery() {
    return useMutation({
      mutationFn: patchServerInfo,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['server'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.server_updated'), life: 3000 });
      },
    });
  }

  public updateServerQuery() {
    return useMutation({
      mutationFn: updateServerFn,
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.server_updated'), life: 3000 });
      },
    });
  }

  public downloadLogQuery(source?: Ref<string> | ComputedRef<string> | string) {
    return useQueryEnhanced({
      queryKey: ['logs', 'server', source ?? 'all'],
      queryFn: ({ signal }) => downloadLogFn({ signal, source: unref(source) }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'downloadLogQuery' && query.enabled),
    });
  }

  public downloadCertQuery() {
    return useMutation({
      mutationFn: downloadCertFn,
    });
  }

  public clearLogQuery() {
    return useMutation({
      mutationFn: (source?: string) => clearLogFn(source),
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['logs', 'server'], exact: false });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.log_cleared'), life: 3000 });
      },
    });
  }

  public checkVersionQuery() {
    return useQueryEnhanced({
      queryKey: ['version'],
      queryFn: ({ signal }) => checkVersion({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'checkVersionQuery' && query.enabled),
    });
  }

  public getGo2RtcInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['go2rtc'],
      queryFn: ({ signal }) => go2rtcInfo({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getGo2RtcInfoQuery' && query.enabled),
    });
  }

  public restartGo2RtcQuery() {
    return useMutation({
      mutationFn: restartGo2RtcFn,
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.go2rtc_restarted'), life: 3000 });
      },
    });
  }

  public restartServerQuery() {
    return useMutation({
      mutationFn: restartSystemFn,
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.server_restarted'), life: 3000 });
      },
      onError: (error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === undefined || status >= 500) {
          this.toast.add({ severity: 'success', detail: this.t('components.toast.server_restarted'), life: 3000 });
          return;
        }
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
    });
  }

  public resetServerQuery() {
    return useMutation({
      mutationFn: resetSystemFn,
      onSuccess: async () => {
        this.toast.add({ severity: 'success', detail: this.t('components.toast.server_resetted'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<ServerQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
