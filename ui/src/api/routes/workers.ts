import { axiosInstance as api } from '..';

import type { CamerasResponse, PatchWorkerInput, PatchWorkersConfigInput, WorkerInfo, WorkerPairingResponse, WorkersConfigResponse } from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function getWorkers(): Promise<WorkerInfo[]> {
  const response: AxiosResponse<WorkerInfo[]> = await api.get('/workers');
  return response.data;
}

export async function getWorkersConfig(): Promise<WorkersConfigResponse> {
  const response: AxiosResponse<WorkersConfigResponse> = await api.get('/workers/config');
  return response.data;
}

export async function patchWorkersConfig(patch: PatchWorkersConfigInput): Promise<PatchWorkersConfigInput> {
  const response: AxiosResponse<PatchWorkersConfigInput> = await api.patch('/workers/config', patch);
  return response.data;
}

export async function createWorkerPairing(): Promise<WorkerPairingResponse> {
  const response: AxiosResponse<WorkerPairingResponse> = await api.post('/workers/pairings');
  return response.data;
}

export async function removeWorker(agentId: string): Promise<void> {
  await api.delete(`/workers/${agentId}`);
}

export async function restartWorker(agentId: string): Promise<void> {
  await api.post(`/workers/${agentId}/restart`);
}

export async function updateWorker({ agentId, version }: { agentId: string; version?: string }): Promise<void> {
  await api.post(`/workers/${agentId}/update`, version ? { version } : {});
}

export async function patchWorker({ agentId, ...patch }: PatchWorkerInput & { agentId: string }): Promise<void> {
  await api.patch(`/workers/${agentId}`, patch);
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

  public updateWorkerQuery() {
    return useMutation({
      mutationFn: updateWorker,
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 5000 });
      },
    });
  }

  public patchWorkerQuery() {
    return useMutation({
      mutationFn: patchWorker,
      onError: (error) => {
        this.toast.add({ severity: 'error', detail: error, life: 3000 });
      },
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
