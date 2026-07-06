import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { ConnectionInfo, DBRemote, DeepPartial, ManagedTunnelStatus, MethodKeys, RemoteInfo, RemoteTestResult, TunnelStatus } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface PairInitResponse {
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  pollInterval: number;
}

export interface PairPollResponse {
  state: 'pending' | 'confirmed' | 'expired' | 'denied' | 'slow_down';
}

export async function getRemoteInfo({ signal }: { signal: AbortSignal }): Promise<RemoteInfo> {
  const response: AxiosResponse<RemoteInfo> = await api.get('/remote', { signal });
  return response.data;
}

export async function patchRemoteInfo(systemData: DeepPartial<DBRemote>): Promise<DBRemote> {
  const response: AxiosResponse<DBRemote> = await api.patch('/remote', systemData);
  return response.data;
}

export async function pairInit(name?: string): Promise<PairInitResponse> {
  const response: AxiosResponse<PairInitResponse> = await api.post('/remote/pair/init', name ? { name } : {});
  return response.data;
}

export async function pairPoll({ name }: { name?: string } = {}): Promise<PairPollResponse> {
  const response: AxiosResponse<PairPollResponse> = await api.post('/remote/pair/poll', name ? { name } : {});
  return response.data;
}

export async function unregisterServer(): Promise<void> {
  await api.delete('/remote/unregister');
}

export async function getRegistrationStatus({ signal }: { signal: AbortSignal }): Promise<{ isRegistered: boolean; needsReauth: boolean; serverName?: string }> {
  const response: AxiosResponse<{ isRegistered: boolean; needsReauth: boolean; serverName?: string }> = await api.get('/remote/status', { signal });
  return response.data;
}

export async function updateServerName(name: string): Promise<void> {
  await api.patch('/remote/name', { name });
}

export async function getTunnelStatus({ signal }: { signal: AbortSignal }): Promise<TunnelStatus> {
  const response: AxiosResponse<TunnelStatus> = await api.get('/remote/tunnel', { signal });
  return response.data;
}

export async function getConnectionInfo({ signal }: { signal?: AbortSignal } = {}): Promise<ConnectionInfo> {
  const response: AxiosResponse<ConnectionInfo> = await api.get('/remote/connection-info', { signal });
  return response.data;
}

export async function testRemoteMode(mode: 'cloudflare' | 'customDomain'): Promise<RemoteTestResult> {
  const response: AxiosResponse<RemoteTestResult> = await api.post(`/remote/test/${mode}`);
  return response.data;
}

export async function getCloudflareManagedStatus({ signal }: { signal?: AbortSignal } = {}): Promise<ManagedTunnelStatus> {
  const response: AxiosResponse<ManagedTunnelStatus> = await api.get('/remote/cloudflare/managed/status', { signal });
  return response.data;
}

export async function cloudflareManagedConnect(hostname: string): Promise<void> {
  await api.post('/remote/cloudflare/managed/connect', { hostname });
}

export async function cloudflareManagedCancel(): Promise<void> {
  await api.post('/remote/cloudflare/managed/cancel');
}

export async function cloudflareManagedDisconnect(): Promise<void> {
  await api.post('/remote/cloudflare/managed/disconnect');
}

export async function cloudflareManagedLogout(): Promise<void> {
  await api.post('/remote/cloudflare/managed/logout');
}

export class RemoteQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<RemoteQuery>; enabled: boolean }[]>([
    {
      name: 'getRemoteInfoQuery',
      enabled: true,
    },
    {
      name: 'getRegistrationStatusQuery',
      enabled: true,
    },
    {
      name: 'getTunnelStatusQuery',
      enabled: true,
    },
    {
      name: 'getConnectionInfoQuery',
      enabled: true,
    },
    {
      name: 'getCloudflareManagedStatusQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public getRemoteInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['remote'],
      queryFn: ({ signal }) => getRemoteInfo({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getRemoteInfoQuery' && query.enabled),
      staleTime: 1000,
    });
  }

  public patchRemoteInfoQuery() {
    return useMutation({
      mutationFn: patchRemoteInfo,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.remote_updated'), life: 3000 });
      },
    });
  }

  public getRegistrationStatusQuery() {
    return useQueryEnhanced({
      queryKey: ['remote', 'status'],
      queryFn: ({ signal }) => getRegistrationStatus({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getRegistrationStatusQuery' && query.enabled),
      staleTime: 1000,
    });
  }

  public pairInitMutation() {
    return useMutation({
      mutationFn: pairInit,
    });
  }

  public pairPollMutation() {
    return useMutation({
      mutationFn: pairPoll,
      onSuccess: async (data) => {
        if (data.state === 'confirmed') {
          await this._queryClient.refetchQueries({ queryKey: ['remote'], exact: true });
          await this._queryClient.refetchQueries({ queryKey: ['remote', 'status'], exact: true });
          this.toast.add({ severity: 'success', detail: this.t('components.toast.remote_registered'), life: 3000 });
        }
      },
    });
  }

  public unregisterServerQuery() {
    return useMutation({
      mutationFn: unregisterServer,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote'], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'status'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.remote_unregistered'), life: 3000 });
      },
    });
  }

  public getTunnelStatusQuery() {
    return useQueryEnhanced({
      queryKey: ['remote', 'tunnel'],
      queryFn: ({ signal }) => getTunnelStatus({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getTunnelStatusQuery' && query.enabled),
      refetchInterval: 30000,
      staleTime: 10000,
    });
  }

  public updateServerNameQuery() {
    return useMutation({
      mutationFn: updateServerName,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'status'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.server_name_updated'), life: 3000 });
      },
    });
  }

  public getConnectionInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['remote', 'connection-info'],
      queryFn: ({ signal }) => getConnectionInfo({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getConnectionInfoQuery' && query.enabled),
      refetchInterval: 10000,
    });
  }

  public testRemoteModeMutation() {
    return useMutation({
      mutationFn: testRemoteMode,
    });
  }

  public getCloudflareManagedStatusQuery() {
    return useQueryEnhanced({
      queryKey: ['remote', 'cloudflare', 'managed'],
      queryFn: ({ signal }) => getCloudflareManagedStatus({ signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getCloudflareManagedStatusQuery' && query.enabled),
      refetchInterval: (q) => {
        const state = q.state.data?.state;
        if (state === 'awaiting_login' || state === 'creating_tunnel' || state === 'setting_dns') return 2_000;
        return false;
      },
      refetchOnWindowFocus: true,
      staleTime: 1_000,
    });
  }

  public cloudflareManagedConnectMutation() {
    return useMutation({
      mutationFn: cloudflareManagedConnect,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'cloudflare', 'managed'], exact: true });
      },
    });
  }

  public cloudflareManagedCancelMutation() {
    return useMutation({
      mutationFn: cloudflareManagedCancel,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'cloudflare', 'managed'], exact: true });
      },
    });
  }

  public cloudflareManagedDisconnectMutation() {
    return useMutation({
      mutationFn: cloudflareManagedDisconnect,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote'], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'cloudflare', 'managed'], exact: true });
      },
    });
  }

  public cloudflareManagedLogoutMutation() {
    return useMutation({
      mutationFn: cloudflareManagedLogout,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['remote'], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['remote', 'cloudflare', 'managed'], exact: true });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<RemoteQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
