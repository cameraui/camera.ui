import { axiosInstance as api } from '..';

import type { CamerasResponse } from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export interface WorkerInfo {
  agentId: string;
  name: string;
  online: boolean;
  lastHeartbeat: number;
  cameras: string[];
  capabilities: string[];
  version?: string;
  versionMismatch?: boolean;
  platform?: { os: string; arch: string };
  pid?: number;
  cpuLoad?: string;
  memLoad?: string;
}

export interface WorkerPairing {
  code: string;
  expiresAt: number;
  address: string | null;
  leafPort: number;
  apiPort: number;
}

export interface WorkersConfig {
  enabled: boolean;
  address: string;
  port: number;
  suggestedAddresses: string[];
  pairedWorkers: number;
}

export type WorkersConfigPatch = Partial<Pick<WorkersConfig, 'enabled' | 'address' | 'port'>>;

export async function getWorkers(): Promise<WorkerInfo[]> {
  const response: AxiosResponse<WorkerInfo[]> = await api.get('/workers');
  return response.data;
}

export async function getWorkersConfig(): Promise<WorkersConfig> {
  const response: AxiosResponse<WorkersConfig> = await api.get('/workers/config');
  return response.data;
}

export async function patchWorkersConfig(patch: WorkersConfigPatch): Promise<WorkersConfigPatch> {
  const response: AxiosResponse<WorkersConfigPatch> = await api.patch('/workers/config', patch);
  return response.data;
}

export async function createWorkerPairing(): Promise<WorkerPairing> {
  const response: AxiosResponse<WorkerPairing> = await api.post('/workers/pairings');
  return response.data;
}

export async function removeWorker(agentId: string): Promise<void> {
  await api.delete(`/workers/${agentId}`);
}

export async function restartWorker(agentId: string): Promise<void> {
  await api.post(`/workers/${agentId}/restart`);
}

export async function assignCameraToWorker({ cameraId, agentId }: { cameraId: string; agentId: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.post('/workers/assign', { cameraId, agentId });
  return response.data;
}

export async function unassignCameraFromWorker({ cameraId }: { cameraId: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.post('/workers/unassign', { cameraId });
  return response.data;
}

export async function assignPluginToWorker({ pluginName, agentId }: { pluginName: string; agentId: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.post('/workers/assign-plugin', { pluginName, agentId });
  return response.data;
}

export async function unassignPluginFromWorker({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.post('/workers/unassign-plugin', { pluginName });
  return response.data;
}

export class WorkersQuery {
  private _queryClient = useQueryClient();
  private toast = useCuiToast();

  public getConfigQuery() {
    return useQueryEnhanced({
      queryKey: ['workersConfig'],
      queryFn: () => getWorkersConfig(),
      retry: false,
    });
  }

  public patchConfigQuery() {
    return useMutation({
      mutationFn: patchWorkersConfig,
      onSuccess: () => this._queryClient.invalidateQueries({ queryKey: ['workersConfig'] }),
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
    });
  }

  public createPairingQuery() {
    return useMutation({
      mutationFn: createWorkerPairing,
    });
  }

  public removeWorkerQuery() {
    return useMutation({
      mutationFn: removeWorker,
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
      onSettled: () => this._queryClient.invalidateQueries({ queryKey: ['camerasList'] }),
    });
  }

  public assignCameraQuery() {
    return useMutation({
      mutationFn: assignCameraToWorker,
      onMutate: ({ cameraId, agentId }) => this.patchCameraWorker(cameraId, agentId),
      onError: (error, _variables, context) => {
        context?.rollback();
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
      onSettled: () => this._queryClient.invalidateQueries({ queryKey: ['camerasList'] }),
    });
  }

  public unassignCameraQuery() {
    return useMutation({
      mutationFn: unassignCameraFromWorker,
      onMutate: ({ cameraId }) => this.patchCameraWorker(cameraId, undefined),
      onError: (error, _variables, context) => {
        context?.rollback();
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
      onSettled: () => this._queryClient.invalidateQueries({ queryKey: ['camerasList'] }),
    });
  }

  public restartWorkerQuery() {
    return useMutation({
      mutationFn: restartWorker,
    });
  }

  public assignPluginQuery() {
    return useMutation({
      mutationFn: assignPluginToWorker,
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
      onSettled: () => this._queryClient.invalidateQueries({ queryKey: ['pluginsList'] }),
    });
  }

  public unassignPluginQuery() {
    return useMutation({
      mutationFn: unassignPluginFromWorker,
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
      onSettled: () => this._queryClient.invalidateQueries({ queryKey: ['pluginsList'] }),
    });
  }

  private patchCameraWorker(cameraId: string, agentId: string | undefined): { rollback: () => void } {
    const snapshots: [readonly unknown[], CamerasResponse | undefined][] = [];
    for (const [key, data] of this._queryClient.getQueriesData<CamerasResponse>({ queryKey: ['camerasList'] })) {
      if (!data?.result) continue;
      snapshots.push([key, data]);
      this._queryClient.setQueryData<CamerasResponse>(key, {
        ...data,
        result: data.result.map((cam) => (cam._id === cameraId ? { ...cam, workerAgentId: agentId } : cam)),
      });
    }
    return {
      rollback: () => {
        for (const [key, data] of snapshots) this._queryClient.setQueryData(key, data);
      },
    };
  }
}
