import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { AutomationInputType, AutomationStoreBlueprint } from '@/components/CuiAutomation/types.js';
import type { AutomationRun, DBAutomation, MethodKeys } from '@shared/types';
import type { AxiosResponse } from 'axios';

export interface PluginMethodParam {
  name: string;
  labelKey: string;
  type: string;
  placeholder?: string;
}

export interface PluginMethodDef {
  id: string;
  labelKey: string;
  settingsMethod?: string;
  params: PluginMethodParam[];
}

export type PluginMethodsResponse = Record<string, PluginMethodDef[]>;

export interface AutomationRequiredInput {
  type: AutomationInputType;
  count?: number;
}

export interface AutomationCatalogEntry {
  id: string;
  title: string;
  description?: string;
  category?: string;
  author?: string;
  featured?: boolean;
  tags?: string[];
  requiredPlugins?: string[];
  requiredInputs?: AutomationRequiredInput[];
  blueprint: string;
}

export async function getAutomationsFn({ signal }: { signal: AbortSignal }): Promise<DBAutomation[]> {
  const response: AxiosResponse<DBAutomation[]> = await api.get('/automations', { signal });
  return response.data;
}

export async function getAutomationFn({ id, signal }: { id: string; signal: AbortSignal }): Promise<DBAutomation> {
  const response: AxiosResponse<DBAutomation> = await api.get(`/automations/${id}`, { signal });
  return response.data;
}

export async function getAutomationRunsFn({ id, signal }: { id: string; signal: AbortSignal }): Promise<AutomationRun[]> {
  const response: AxiosResponse<AutomationRun[]> = await api.get(`/automations/${id}/runs`, { signal });
  return response.data;
}

export async function createAutomationFn({ data }: { data: Partial<DBAutomation> }): Promise<DBAutomation> {
  const response: AxiosResponse<DBAutomation> = await api.post('/automations', data);
  return response.data;
}

export async function patchAutomationFn({ id, data }: { id: string; data: Partial<DBAutomation> }): Promise<DBAutomation> {
  const response: AxiosResponse<DBAutomation> = await api.patch(`/automations/${id}`, data);
  return response.data;
}

export async function deleteAutomationFn({ id }: { id: string }): Promise<void> {
  await api.delete(`/automations/${id}`);
}

export async function triggerAutomationFn({ id }: { id: string }): Promise<{ output?: Record<string, string> }> {
  const { data } = await api.post(`/automations/${id}/trigger`);
  return data;
}

export async function importBlueprintFn({ blueprint }: { blueprint: Record<string, unknown> }): Promise<DBAutomation> {
  const response: AxiosResponse<DBAutomation> = await api.post('/automations/import', blueprint);
  return response.data;
}

export async function exportBlueprintFn({ id, signal }: { id: string; signal: AbortSignal }): Promise<Record<string, unknown>> {
  const response: AxiosResponse<Record<string, unknown>> = await api.get(`/automations/${id}/export`, { signal });
  return response.data;
}

export async function getPluginMethodsFn({ signal }: { signal: AbortSignal }): Promise<PluginMethodsResponse> {
  const response: AxiosResponse<PluginMethodsResponse> = await api.get('/automations/plugin-methods', { signal });
  return response.data;
}

export interface AutomationStoreItem extends Omit<AutomationCatalogEntry, 'blueprint'> {
  blueprint: AutomationStoreBlueprint;
}

export async function getAutomationStoreFn({ refresh, signal }: { refresh?: boolean; signal: AbortSignal }): Promise<AutomationCatalogEntry[]> {
  const response: AxiosResponse<AutomationCatalogEntry[]> = await api.get('/automations/store', { params: refresh ? { refresh: true } : {}, signal });
  return response.data;
}

export async function getAutomationStoreItemFn({ id, signal }: { id: string; signal: AbortSignal }): Promise<AutomationStoreItem> {
  const response: AxiosResponse<AutomationStoreItem> = await api.get(`/automations/store/${id}`, { signal });
  return response.data;
}

export class AutomationsQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<AutomationsQuery>; enabled: boolean }[]>([
    { name: 'getAutomationsQuery', enabled: true },
    { name: 'getAutomationQuery', enabled: true },
  ]);

  public getAutomationsQuery() {
    return useQueryEnhanced({
      queryKey: ['automationsList'],
      queryFn: ({ signal }) => getAutomationsFn({ signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((q) => q.name === 'getAutomationsQuery' && q.enabled),
    });
  }

  public getAutomationQuery(id: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['automation', id],
      queryFn: ({ signal }) => getAutomationFn({ id: unref(id), signal }),
      enabled: () => !!unref(id) && unref(id) !== 'new' && this.queryActivator.value.some((q) => q.name === 'getAutomationQuery' && q.enabled),
    });
  }

  public getAutomationRunsQuery(id: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['automationRuns', id],
      queryFn: ({ signal }) => getAutomationRunsFn({ id: unref(id), signal }),
      enabled: () => !!unref(id),
    });
  }

  public createAutomationQuery() {
    return useMutation({
      mutationFn: createAutomationFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['automationsList'] });
        this.toast.add({ severity: 'success', detail: this.t('views.automation.saved'), life: 3000 });
      },
    });
  }

  public patchAutomationQuery() {
    return useMutation({
      mutationFn: patchAutomationFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['automationsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['automation', variables.id] });
      },
    });
  }

  public deleteAutomationQuery() {
    return useMutation({
      mutationFn: deleteAutomationFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['automationsList'] });
      },
    });
  }

  public triggerAutomationQuery() {
    return useMutation({
      mutationFn: triggerAutomationFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['automationsList'] });
        await this._queryClient.refetchQueries({ queryKey: ['automation', variables.id] });
      },
    });
  }

  public getPluginMethodsQuery() {
    return useQueryEnhanced({
      queryKey: ['automationPluginMethods'],
      queryFn: ({ signal }) => getPluginMethodsFn({ signal }),
    });
  }

  public getAutomationStoreQuery(refresh?: Ref<boolean>) {
    return useQueryEnhanced({
      queryKey: ['automationStore'],
      queryFn: ({ signal }) => getAutomationStoreFn({ refresh: unref(refresh), signal }),
      placeholderData: (previousData: any) => previousData,
    });
  }

  public getAutomationStoreItemQuery(id: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['automationStoreItem', id],
      queryFn: ({ signal }) => getAutomationStoreItemFn({ id: unref(id), signal }),
      enabled: () => !!unref(id),
    });
  }

  public importBlueprintQuery() {
    return useMutation({
      mutationFn: importBlueprintFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['automationsList'] });
        this.toast.add({ severity: 'success', detail: this.t('views.automations.import_success'), life: 3000 });
      },
    });
  }
}
