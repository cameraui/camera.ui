import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { Go2RtcConfig, IConfig, MethodKeys, SettingsPatchInput, SettingsUpdate, SettingsView } from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function getConfigFn({ json, signal }: { json: boolean; signal: AbortSignal }): Promise<string | IConfig> {
  const response: AxiosResponse<string | IConfig> = await api.get('/config', {
    params: {
      json,
    },
    signal,
  });
  return response.data;
}

export async function getGo2RtcConfigFn({ json, signal }: { json: boolean; signal: AbortSignal }): Promise<string | Go2RtcConfig> {
  const response: AxiosResponse<string | Go2RtcConfig> = await api.get('/config/go2rtc', {
    params: {
      json,
    },
    signal,
  });
  return response.data;
}

export async function patchConfigFn({ configData }: { configData: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.patch('/config', configData, {
    headers: {
      'Content-Type': 'text/yaml',
    },
  });
  return response.data;
}

export async function patchGo2RtcConfigFn({ configData }: { configData: string }): Promise<{ streamingRestarted: boolean }> {
  const response: AxiosResponse<{ streamingRestarted: boolean }> = await api.patch('/config/go2rtc', configData, {
    headers: {
      'Content-Type': 'text/yaml',
    },
  });
  return response.data;
}

export async function getSettingsFn({ signal }: { signal: AbortSignal }): Promise<SettingsView> {
  const response: AxiosResponse<SettingsView> = await api.get('/config/settings', { signal });
  return response.data;
}

export async function patchSettingsFn(patch: SettingsPatchInput): Promise<SettingsUpdate> {
  const response: AxiosResponse<SettingsUpdate> = await api.patch('/config/settings', patch);
  return response.data;
}

export async function deleteConfigFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete('/config');
  return response.data;
}

export async function deleteGo2RtcConfigFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete('/config/go2rtc');
  return response.data;
}

export class ConfigQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<ConfigQuery>; enabled: boolean }[]>([
    {
      name: 'getConfigQuery',
      enabled: true,
    },
    {
      name: 'getGo2RtcConfigQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public getConfigQuery(json: boolean | Ref<boolean> | ComputedRef<boolean> = false) {
    return useQueryEnhanced({
      queryKey: ['config', { json }],
      queryFn: ({ signal }) => getConfigFn({ json: unref(json), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getConfigQuery' && query.enabled),
    });
  }

  public getGo2RtcConfigQuery(json: boolean | Ref<boolean> | ComputedRef<boolean> = false) {
    return useQueryEnhanced({
      queryKey: ['go2rtcConfig'],
      queryFn: ({ signal }) => getGo2RtcConfigFn({ json: unref(json), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getGo2RtcConfigQuery' && query.enabled),
    });
  }

  public patchConfigQuery() {
    return useMutation({
      mutationFn: patchConfigFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['config'] });
        await this._queryClient.invalidateQueries({ queryKey: ['settings'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.config_updated'), life: 3000 });
      },
    });
  }

  public patchGo2RtcConfigQuery() {
    return useMutation({
      mutationFn: patchGo2RtcConfigFn,
      onSuccess: async ({ streamingRestarted }) => {
        await this._queryClient.refetchQueries({ queryKey: ['go2rtcConfig'] });
        await this._queryClient.invalidateQueries({ queryKey: ['settings'] });
        const detail = streamingRestarted ? 'components.toast.config_go2rtc_updated_restarted' : 'components.toast.config_go2rtc_updated';
        this.toast.add({ severity: 'success', detail: this.t(detail), life: 3000 });
      },
    });
  }

  public getSettingsQuery() {
    return useQueryEnhanced({
      queryKey: ['settings'],
      queryFn: ({ signal }) => getSettingsFn({ signal }),
    });
  }

  public patchSettingsMutation() {
    return useMutation({
      mutationFn: patchSettingsFn,
      onSuccess: async (settings) => {
        this._queryClient.setQueryData(['settings'], settings);
        await Promise.all([this._queryClient.invalidateQueries({ queryKey: ['config'] }), this._queryClient.invalidateQueries({ queryKey: ['go2rtcConfig'] })]);
        const detail = settings.streamingRestarted ? 'components.toast.settings_updated_restarted' : 'components.toast.settings_updated';
        this.toast.add({ severity: 'success', detail: this.t(detail), life: 3000 });
      },
    });
  }

  public delteConfigQuery() {
    return useMutation({
      mutationFn: deleteConfigFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['config'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.config_deleted'), life: 3000 });
      },
    });
  }

  public delteGo2RtcConfigQuery() {
    return useMutation({
      mutationFn: deleteGo2RtcConfigFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['go2rtcConfig'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.config_go2rtc_deleted'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<ConfigQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
