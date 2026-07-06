import { useQueries } from '@tanstack/vue-query';

import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { DBInstance, UserData } from '@shared/types';
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

export async function createInstanceFn(data: CreateInstancePayload): Promise<DBInstance> {
  const response: AxiosResponse<DBInstance> = await api.post('/instances', data);
  return response.data;
}

export async function updateInstanceFn({ id, data }: { id: string; data: UpdateInstancePayload }): Promise<DBInstance> {
  const response: AxiosResponse<DBInstance> = await api.put(`/instances/${id}`, data);
  return response.data;
}

export async function deleteInstanceFn(id: string): Promise<void> {
  await api.delete(`/instances/${id}`);
}

export async function toggleFavoriteFn(id: string): Promise<{ favorite: boolean }> {
  const response: AxiosResponse<{ favorite: boolean }> = await api.patch(`/instances/${id}/favorite`);
  return response.data;
}

export async function loginToRemoteFn(id: string): Promise<UserData> {
  const response: AxiosResponse<UserData> = await api.post(`/instances/${id}/login`);
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
        // Immediately remove the status query for the deleted instance to prevent 404 errors
        await this._queryClient.cancelQueries({ queryKey: ['instances', id, 'status'] });
        this._queryClient.removeQueries({ queryKey: ['instances', id, 'status'] });
      },
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['instances'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.instances.removed'), life: 3000 });
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
      mutationFn: loginToRemoteFn,
      onError: () => {
        // Error handled by caller
      },
    });
  }
}
