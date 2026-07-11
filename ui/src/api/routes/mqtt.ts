import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { MqttInfo, MqttStatus, MqttTestResult, PatchMqttInput } from '@shared/types';
import type { AxiosResponse } from 'axios';

export async function getMqttInfo({ signal }: { signal: AbortSignal }): Promise<MqttInfo> {
  const response: AxiosResponse<MqttInfo> = await api.get('/mqtt', { signal });
  return response.data;
}

export async function patchMqttInfo(patch: PatchMqttInput): Promise<MqttInfo> {
  const response: AxiosResponse<MqttInfo> = await api.patch('/mqtt', patch);
  return response.data;
}

export async function getMqttStatus({ signal }: { signal?: AbortSignal } = {}): Promise<MqttStatus> {
  const response: AxiosResponse<MqttStatus> = await api.get('/mqtt/status', { signal });
  return response.data;
}

export async function testMqttConnection(patch: PatchMqttInput): Promise<MqttTestResult> {
  const response: AxiosResponse<MqttTestResult> = await api.post('/mqtt/test', patch);
  return response.data;
}

export class MqttQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  get queryClient() {
    return this._queryClient;
  }

  public getMqttInfoQuery() {
    return useQueryEnhanced({
      queryKey: ['mqtt'],
      queryFn: ({ signal }) => getMqttInfo({ signal }),
      staleTime: 1000,
    });
  }

  public patchMqttInfoMutation() {
    return useMutation({
      mutationFn: patchMqttInfo,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['mqtt'], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.mqtt_updated'), life: 3000 });
      },
    });
  }

  public testMqttConnectionMutation() {
    return useMutation({
      mutationFn: testMqttConnection,
    });
  }
}
