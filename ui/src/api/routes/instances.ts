import { useQueries } from '@tanstack/vue-query';

import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { BulkResult, DBInstance, UserData } from '@shared/types';
import type { AxiosResponse } from 'axios';

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

export interface CreateInstancePayload {
  name: string;
  url: string;
  credentials: {
    username: string;
    password: string;
  };
}

export interface UpdateInstancePayload {
  name?: string;
  url?: string;
  credentials?: {
    username: string;
    password: string;
  } | null;
}

export interface InstancesResponse {
  instances: DBInstance[];
  homeId: string;
}

export type InstanceMutationResponse = DBInstance & { requires2fa?: boolean };

export type InstanceLoginResult = UserData | { requires2fa: true };

export function isRequires2fa(result: InstanceLoginResult): result is { requires2fa: true } {
  return 'requires2fa' in result && result.requires2fa === true;
}

export async function getInstancesFn(signal?: AbortSignal): Promise<InstancesResponse> {
  const response: AxiosResponse<InstancesResponse> = await api.get('/instances', { signal });
  return response.data;
}

export async function getIdentityFn(url: string, token: string): Promise<{ homeId: string }> {
  const response = await fetch(`${url}/api/instances/identity`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Identity fetch failed (${response.status})`);
  return (await response.json()) as { homeId: string };
}

export async function getServerIdentityFn(): Promise<{ homeId: string; name?: string }> {
  const response: AxiosResponse<{ homeId: string; name?: string }> = await api.get('/instances/identity');
  return response.data;
}

export async function createInstanceFn(data: CreateInstancePayload): Promise<InstanceMutationResponse> {
  const response: AxiosResponse<InstanceMutationResponse> = await api.post('/instances', data);
  return response.data;
}

export async function updateInstanceFn({ id, data }: { id: string; data: UpdateInstancePayload }): Promise<InstanceMutationResponse> {
  const response: AxiosResponse<InstanceMutationResponse> = await api.put(`/instances/${id}`, data);
  return response.data;
}

export async function deleteInstanceFn(id: string): Promise<void> {
  await api.delete(`/instances/${id}`);
}

export async function bulkDeleteInstancesFn({ ids }: { ids: string[] }): Promise<BulkResult> {
  const response: AxiosResponse<BulkResult> = await api.delete('/instances', { data: { ids } });
  return response.data;
}

export async function toggleFavoriteFn(id: string): Promise<{ favorite: boolean }> {
  const response: AxiosResponse<{ favorite: boolean }> = await api.patch(`/instances/${id}/favorite`);
  return response.data;
}

export async function loginToRemoteFn(id: string, code?: string): Promise<InstanceLoginResult> {
  const response: AxiosResponse<InstanceLoginResult> = await api.post(`/instances/${id}/login`, code ? { code } : {});
  return response.data;
}

export async function getRemoteStatusFn(id: string, signal?: AbortSignal): Promise<ServerStatus> {
  const response: AxiosResponse<ServerStatus> = await api.get(`/instances/${id}/status`, { signal });
  return response.data;
}

export class InstancesQuery {
  private _queryClient = useQueryClient();
  private toast = useCuiToast();
  private t = i18n.global.t;

  public listQuery() {
    return useQueryEnhanced({
      queryKey: ['instances'],
      queryFn: ({ signal }) => getInstancesFn(signal),
    });
  }

  public statusQueries(instances: MaybeRefOrGetter<DBInstance[]>) {
    return useQueries({
      queries: computed(() =>
        toValue(instances).map((si) => ({
          queryKey: ['instances', si.id, 'status'] as const,
          queryFn: ({ signal }: { signal: AbortSignal }) => getRemoteStatusFn(si.id, signal),
          refetchInterval: 15_000,
          retry: false,
        })),
      ),
    });
  }

  public createMutation() {
    return useMutation({
      mutationFn: createInstanceFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.instances.added'), life: 3000 });
      },
    });
  }

  public updateMutation() {
    return useMutation({
      mutationFn: updateInstanceFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.instances.updated'), life: 3000 });
      },
    });
  }

  public deleteMutation() {
    return useMutation({
      mutationFn: async (id: string) => {
        await deleteInstanceFn(id);
        // the status query would 404 for the deleted instance
        await this._queryClient.cancelQueries({ queryKey: ['instances', id, 'status'] });
        this._queryClient.removeQueries({ queryKey: ['instances', id, 'status'] });
      },
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.instances.removed'), life: 3000 });
      },
    });
  }

  public bulkDeleteMutation() {
    return useMutation({
      mutationFn: async ({ ids }: { ids: string[] }) => {
        const result = await bulkDeleteInstancesFn({ ids });
        for (const id of ids) {
          await this._queryClient.cancelQueries({ queryKey: ['instances', id, 'status'] });
          this._queryClient.removeQueries({ queryKey: ['instances', id, 'status'] });
        }
        return result;
      },
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
      },
    });
  }

  public toggleFavoriteMutation() {
    return useMutation({
      mutationFn: toggleFavoriteFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
      },
    });
  }

  public loginMutation() {
    return useMutation({
      mutationFn: (id: string) => loginToRemoteFn(id),
      onError: () => {
        // handled by the caller
      },
    });
  }
}
