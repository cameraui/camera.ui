import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { CreateVirtualSensorInput, DBVirtualSensor, MethodKeys, PatchVirtualSensorInput } from '@shared/types';
import type { AxiosResponse } from 'axios';

export async function getVirtualSensorsFn({ signal }: { signal: AbortSignal }): Promise<DBVirtualSensor[]> {
  const response: AxiosResponse<DBVirtualSensor[]> = await api.get('/virtual-sensors', { signal });
  return response.data;
}

export async function createVirtualSensorFn({ data }: { data: CreateVirtualSensorInput }): Promise<DBVirtualSensor> {
  const response: AxiosResponse<DBVirtualSensor> = await api.post('/virtual-sensors', data);
  return response.data;
}

export async function patchVirtualSensorFn({ id, data }: { id: string; data: PatchVirtualSensorInput }): Promise<DBVirtualSensor> {
  const response: AxiosResponse<DBVirtualSensor> = await api.patch(`/virtual-sensors/${id}`, data);
  return response.data;
}

export async function deleteVirtualSensorFn({ id }: { id: string }): Promise<void> {
  await api.delete(`/virtual-sensors/${id}`);
}

export class VirtualSensorsQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<VirtualSensorsQuery>; enabled: boolean }[]>([{ name: 'getVirtualSensorsQuery', enabled: true }]);

  public getVirtualSensorsQuery() {
    return useQueryEnhanced({
      queryKey: ['virtualSensorsList'],
      queryFn: ({ signal }) => getVirtualSensorsFn({ signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getVirtualSensorsQuery' && q.enabled),
    });
  }

  public createVirtualSensorQuery() {
    return useMutation({
      mutationFn: createVirtualSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['virtualSensorsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.camera_options.virtual_sensor_created'), life: 3000 });
      },
    });
  }

  public patchVirtualSensorQuery() {
    return useMutation({
      mutationFn: patchVirtualSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['virtualSensorsList'] });
      },
    });
  }

  public deleteVirtualSensorQuery() {
    return useMutation({
      mutationFn: deleteVirtualSensorFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['virtualSensorsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
      },
    });
  }
}
