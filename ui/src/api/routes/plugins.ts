import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { InstallPluginInput } from '@/schemas/plugins.schema.js';
import type { FormSubmitResponse, JsonSchema } from '@camera.ui/sdk';
import type {
  CameraUiPlugin,
  EngineCompatResult,
  ExtensionsResponse,
  INpmPluginState,
  MethodKeys,
  PaginationQuery,
  PatchStorateInput,
  PluginContractResponse,
  PluginExtensionConfig,
  PluginsProgressResponse,
  PluginsResponse,
  SetStorageInput,
  SubmitStorageInput,
  PluginsQuery as _PluginsQuery,
} from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

const PLUGIN_INSTALL_TIMEOUT_MS = 600_000;
const PLUGIN_UNINSTALL_TIMEOUT_MS = 120_000;

export async function installPluginFn({ pluginData }: { pluginData: InstallPluginInput }): Promise<CameraUiPlugin> {
  const response: AxiosResponse<CameraUiPlugin> = await api.post('/plugins', pluginData, { timeout: PLUGIN_INSTALL_TIMEOUT_MS });
  return response.data;
}

export async function getPluginFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<CameraUiPlugin> {
  const response: AxiosResponse<CameraUiPlugin> = await api.get(`/plugins/${pluginName}`, { signal });
  return response.data;
}

export async function getPluginVersionsFn({
  pluginname,
  signal,
}: {
  pluginname: string;
  signal: AbortSignal;
}): Promise<{ versions: string[]; 'dist-tags': Record<string, string> }> {
  const response: AxiosResponse<{ versions: string[]; 'dist-tags': Record<string, string> }> = await api.get(`/plugins/${pluginname}/versions`, { signal });
  return response.data;
}

export async function getPluginUpdateFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<INpmPluginState | undefined> {
  const response: AxiosResponse<INpmPluginState> = await api.get(`/plugins/${pluginName}/update`, { signal });
  return response.data;
}

export async function getPluginLogoFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<string> {
  const response: AxiosResponse<string> = await api.get(`/plugins/${pluginName}/logo`, { signal });
  return response.data;
}

export async function getPluginConfigFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<PluginExtensionConfig> {
  const response: AxiosResponse<PluginExtensionConfig> = await api.get(`/plugins/${pluginName}/config`, { signal });
  return response.data;
}

export async function getPluginContractFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<PluginContractResponse | undefined> {
  const response: AxiosResponse<PluginContractResponse> = await api.get(`/plugins/${pluginName}/contract`, { signal });
  return response.data;
}

export async function getPluginReadmeFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<string> {
  const response: AxiosResponse<string> = await api.get(`/plugins/${pluginName}/readme`, { signal });
  return response.data;
}

export async function getPluginChangelogFn({ pluginName, query, signal }: { pluginName: string; query?: _PluginsQuery; signal: AbortSignal }): Promise<string> {
  const response: AxiosResponse<string> = await api.get(`/plugins/${pluginName}/changelog`, { params: query, signal });
  return response.data;
}

export async function getPluginCompatFn({ pluginName, query, signal }: { pluginName: string; query?: _PluginsQuery; signal: AbortSignal }): Promise<EngineCompatResult> {
  const response: AxiosResponse<EngineCompatResult> = await api.get(`/plugins/${pluginName}/compat`, { params: query, signal });
  return response.data;
}

export async function getPluginInterfaceFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<JsonSchema[] | void> {
  const response: AxiosResponse<JsonSchema[] | void> = await api.get(`/plugins/${pluginName}/interface`, { signal });
  return response.data;
}

export async function getPluginsFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<PluginsResponse> {
  const response: AxiosResponse<PluginsResponse> = await api.get('/plugins', { params: parameter, signal });
  return response.data;
}

export async function getExtensionsFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<ExtensionsResponse> {
  const response: AxiosResponse<ExtensionsResponse> = await api.get('/plugins/extensions', { params: parameter, signal });
  return response.data;
}

export async function clearLogFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/plugins/${pluginName}/log`);
  return response.data;
}

export async function downloadLogFn({ pluginName, signal }: { pluginName: string; signal: AbortSignal }): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.get(`/plugins/${pluginName}/log/download`, { signal });
  return response.data;
}

export async function getPluginsProgress({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<PluginsProgressResponse> {
  const response: AxiosResponse<PluginsProgressResponse> = await api.get('/plugins/progress', { params: parameter, signal });
  return response.data;
}

export async function searchPluginsFn({
  query,
  parameter,
  refresh,
  signal,
}: {
  query?: _PluginsQuery;
  parameter: PaginationQuery;
  refresh?: boolean;
  signal: AbortSignal;
}): Promise<PluginsResponse> {
  const response: AxiosResponse<PluginsResponse> = await api.get('/plugins/search', {
    params: {
      ...query,
      ...parameter,
      ...(refresh ? { refresh: true } : {}),
    },
    signal,
  });
  return response.data;
}

export async function enablePluginFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginName}/enable`);
  return response.data;
}

export async function patchPluginConfigFn({ pluginName, configData }: { pluginName: string; configData: PatchStorateInput }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.patch(`/plugins/${pluginName}/config`, configData);
  return response.data;
}

export async function setPluginConfigFn({ pluginname, configData }: { pluginname: string; configData: SetStorageInput }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginname}/config`, configData);
  return response.data;
}

export async function submitPluginConfigFn({ pluginname, configData }: { pluginname: string; configData: SubmitStorageInput }): Promise<FormSubmitResponse | void> {
  const response: AxiosResponse<FormSubmitResponse | void> = await api.post(`/plugins/${pluginname}/config`, configData);
  return response.data;
}

export async function disablePluginFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginName}/disable`);
  return response.data;
}

export async function startPluginFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginName}/start`);
  return response.data;
}

export async function stopPluginFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginName}/stop`);
  return response.data;
}

export async function restartPluginFn({ pluginName }: { pluginName: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/plugins/${pluginName}/restart`);
  return response.data;
}

export async function uninstallPluginFn({ pluginName, removeStorage }: { pluginName: string; removeStorage?: boolean }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/plugins/${pluginName}`, { params: { removeStorage }, timeout: PLUGIN_UNINSTALL_TIMEOUT_MS });
  return response.data;
}

export async function uninstallPluginsFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete('/plugins', { timeout: PLUGIN_UNINSTALL_TIMEOUT_MS });
  return response.data;
}

export class PluginsQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<PluginsQuery>; enabled: boolean }[]>([
    {
      name: 'getPluginQuery',
      enabled: true,
    },
    {
      name: 'getPluginsQuery',
      enabled: true,
    },
    {
      name: 'getPluginsExtensionsQuery',
      enabled: true,
    },
    {
      name: 'searchPluginsQuery',
      enabled: true,
    },
    {
      name: 'getPluginVersionsQuery',
      enabled: true,
    },
    {
      name: 'getPluginUpdateQuery',
      enabled: true,
    },
    {
      name: 'getPluginLogoQuery',
      enabled: true,
    },
    {
      name: 'getPluginConfigQuery',
      enabled: true,
    },
    {
      name: 'getPluginContractQuery',
      enabled: true,
    },
    {
      name: 'getPluginReadmeQuery',
      enabled: true,
    },
    {
      name: 'getPluginInterfaceQuery',
      enabled: true,
    },
    {
      name: 'getPluginChangelogQuery',
      enabled: true,
    },
    {
      name: 'getPluginCompatQuery',
      enabled: true,
    },
    {
      name: 'getPluginsProgressQuery',
      enabled: true,
    },
    {
      name: 'installPluginQuery',
      enabled: true,
    },
    {
      name: 'enablePluginQuery',
      enabled: true,
    },
    {
      name: 'disablePluginQuery',
      enabled: true,
    },
    {
      name: 'patchPluginConfigQuery',
      enabled: true,
    },
    {
      name: 'setPluginConfigQuery',
      enabled: true,
    },
    {
      name: 'submitPluginConfigQuery',
      enabled: true,
    },
    {
      name: 'startPluginQuery',
      enabled: true,
    },
    {
      name: 'stopPluginQuery',
      enabled: true,
    },
    {
      name: 'restartPluginQuery',
      enabled: true,
    },
    {
      name: 'uninstallPluginQuery',
      enabled: true,
    },
    {
      name: 'uninstallPluginsQuery',
      enabled: true,
    },
    {
      name: 'downloadLogQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public installPluginQuery() {
    return useMutation({
      mutationFn: installPluginFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['plugins'] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsSearch'] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsProgress'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_installed'), life: 3000 });
      },
    });
  }

  public getPluginQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName],
      queryFn: ({ signal }) => getPluginFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginQuery' && query.enabled),
    });
  }

  public getPluginsQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['pluginsList', pagination],
      queryFn: ({ signal }) => getPluginsFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginsQuery' && query.enabled),
    });
  }

  public getPluginsExtensionsQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['extensionsList', pagination],
      queryFn: ({ signal }) => getExtensionsFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginsExtensionsQuery' && query.enabled),
    });
  }

  public getPluginsProgressQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['pluginsProgress', pagination],
      queryFn: ({ signal }) => getPluginsProgress({ parameter: unref(pagination), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginsProgressQuery' && query.enabled),
    });
  }

  public searchPluginsQuery(
    pluginQuery: _PluginsQuery | undefined | Ref<_PluginsQuery | undefined>,
    pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>,
    refresh?: Ref<boolean>,
  ) {
    return useQueryEnhanced({
      queryKey: ['pluginsSearch', pluginQuery, pagination],
      queryFn: ({ signal }) => searchPluginsFn({ query: unref(pluginQuery), parameter: unref(pagination), refresh: unref(refresh), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'searchPluginsQuery' && query.enabled),
    });
  }

  public getPluginVersionsQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'versions'],
      queryFn: ({ signal }) => getPluginVersionsFn({ pluginname: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginVersionsQuery' && query.enabled),
    });
  }

  public getPluginUpdateQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'update'],
      queryFn: ({ signal }) => getPluginUpdateFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginUpdateQuery' && query.enabled),
    });
  }

  public getPluginLogoQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'logo'],
      queryFn: ({ signal }) => getPluginLogoFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginLogoQuery' && query.enabled),
    });
  }

  public getPluginConfigQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'config'],
      queryFn: ({ signal }) => getPluginConfigFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginConfigQuery' && query.enabled),
    });
  }

  public getPluginContractQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'contract'],
      queryFn: ({ signal }) => getPluginContractFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginContractQuery' && query.enabled),
    });
  }

  public getPluginReadmeQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'readme'],
      queryFn: ({ signal }) => getPluginReadmeFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginReadmeQuery' && query.enabled),
      retry: (failerCount, error) => {
        if (error instanceof Error && error.message.includes('404')) {
          return false;
        }
        return failerCount < 3;
      },
    });
  }

  public getPluginInterfaceQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'interface'],
      queryFn: ({ signal }) => getPluginInterfaceFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginInterfaceQuery' && query.enabled),
    });
  }

  public getPluginChangelogQuery(pluginName: string | Ref<string> | ComputedRef<string>, pluginQuery?: _PluginsQuery | undefined | Ref<_PluginsQuery | undefined>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'changelog'],
      queryFn: ({ signal }) => getPluginChangelogFn({ pluginName: unref(pluginName), query: unref(pluginQuery), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginChangelogQuery' && query.enabled),
      retry: (failerCount, error) => {
        if (error instanceof Error && error.message.includes('404')) {
          return false;
        }
        return failerCount < 3;
      },
    });
  }

  public getPluginCompatQuery(pluginName: string | Ref<string> | ComputedRef<string>, pluginQuery?: _PluginsQuery | undefined | Ref<_PluginsQuery | undefined>) {
    return useQueryEnhanced({
      queryKey: ['plugins', pluginName, 'compat'],
      queryFn: ({ signal }) => getPluginCompatFn({ pluginName: unref(pluginName), query: unref(pluginQuery), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getPluginCompatQuery' && query.enabled),
    });
  }

  public patchPluginConfigQuery() {
    return useMutation({
      mutationFn: patchPluginConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_config_updated'), life: 3000 });
      },
    });
  }

  public startPluginQuery() {
    return useMutation({
      mutationFn: startPluginFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_started'), life: 3000 });
      },
    });
  }

  public stopPluginQuery() {
    return useMutation({
      mutationFn: stopPluginFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_stopped'), life: 3000 });
      },
    });
  }

  public restartPluginQuery() {
    return useMutation({
      mutationFn: restartPluginFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_restarted'), life: 3000 });
      },
    });
  }

  public setPluginConfigQuery() {
    return useMutation({
      mutationFn: setPluginConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginname, variables.configData] });
        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.action_executed'), life: 3000 });
      },
    });
  }

  public submitPluginConfigQuery() {
    return useMutation({
      mutationFn: submitPluginConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginname, variables.configData] });
        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.action_executed'), life: 3000 });
      },
    });
  }

  public enablePluginQuery() {
    return useMutation({
      mutationFn: enablePluginFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_enabled'), life: 3000 });
      },
    });
  }

  public disablePluginQuery() {
    return useMutation({
      mutationFn: disablePluginFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['plugins', variables.pluginName] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_disabled'), life: 3000 });
      },
    });
  }

  public uninstallPluginQuery() {
    return useMutation({
      mutationFn: uninstallPluginFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsSearch'] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsProgress'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugin_removed'), life: 3000 });
      },
    });
  }

  public uninstallPluginsQuery() {
    return useMutation({
      mutationFn: uninstallPluginsFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['pluginsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['pluginsSearch'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.plugins_removed'), life: 3000 });
      },
    });
  }

  public downloadLogQuery(pluginName: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['logs', pluginName],
      queryFn: ({ signal }) => downloadLogFn({ pluginName: unref(pluginName), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'downloadLogQuery' && query.enabled),
    });
  }

  public clearLogQuery() {
    return useMutation({
      mutationFn: clearLogFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['logs', variables.pluginName], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.log_cleared'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<PluginsQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
