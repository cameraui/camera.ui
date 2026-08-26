import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { CreateVirtualSensorInput, MethodKeys, PatchSensorInput, TransformedSensor } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface SensorHistoryEntry {
  property: string;
  value: unknown;
  timestamp: number;
}

export async function getSensorsFn({ signal, cameraId }: { signal: AbortSignal; cameraId?: string }): Promise<TransformedSensor[]> {
  const response: AxiosResponse<{ sensors: TransformedSensor[] }> = await api.get('/sensors', { signal, params: cameraId ? { camera: cameraId } : undefined });
  return response.data.sensors;
}

export async function createVirtualSensorFn({ data }: { data: CreateVirtualSensorInput }): Promise<TransformedSensor> {
  const response: AxiosResponse<TransformedSensor> = await api.post('/sensors', data);
  return response.data;
}

export async function patchSensorFn({ id, data }: { id: string; data: PatchSensorInput }): Promise<TransformedSensor> {
  const response: AxiosResponse<TransformedSensor> = await api.patch(`/sensors/${id}`, data);
  return response.data;
}

export async function deleteSensorFn({ id }: { id: string }): Promise<void> {
  await api.delete(`/sensors/${id}`);
}

export async function bulkDeleteSensorsFn({ ids }: { ids: string[] }): Promise<{ deleted: number; skipped: string[] }> {
  const response: AxiosResponse<{ deleted: number; skipped: string[] }> = await api.delete('/sensors', { data: { ids } });
  return response.data;
}

export async function getSensorHistoryFn({ id, signal }: { id: string; signal?: AbortSignal }): Promise<SensorHistoryEntry[]> {
  const response: AxiosResponse<{ history: SensorHistoryEntry[] }> = await api.get(`/sensors/${id}/history`, { signal });
  return response.data.history;
}

export class SensorsQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<SensorsQuery>; enabled: boolean }[]>([
    { name: 'getSensorsQuery', enabled: true },
    { name: 'getCameraSensorsQuery', enabled: true },
  ]);

  public getSensorsQuery() {
    return useQueryEnhanced({
      queryKey: ['sensorsList'],
      queryFn: ({ signal }) => getSensorsFn({ signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getSensorsQuery' && q.enabled),
    });
  }

  public getCameraSensorsQuery(cameraId: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['sensorsList', cameraId],
      queryFn: ({ signal }) => getSensorsFn({ signal, cameraId: unref(cameraId) }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getCameraSensorsQuery' && q.enabled),
    });
  }

  public createVirtualSensorQuery() {
    return useMutation({
      mutationFn: createVirtualSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['sensorsList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.camera_options.virtual_sensor_created'), life: 3000 });
      },
    });
  }

  public patchSensorQuery() {
    return useMutation({
      mutationFn: patchSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['sensorsList'] });
      },
    });
  }

  public deleteSensorQuery() {
    return useMutation({
      mutationFn: deleteSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['sensorsList'] });
      },
    });
  }

  public bulkDeleteSensorsQuery() {
    return useMutation({
      mutationFn: bulkDeleteSensorsFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['sensorsList'] });
      },
    });
  }
}
