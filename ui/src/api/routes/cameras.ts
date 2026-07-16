import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { CreateCameraInput, PatchCameraInput, PreviewCameraInput } from '@/schemas/cameras.schema.js';
import type { DetectionLine, DetectionZone, FormSubmitResponse, ProbeConfig, SensorType } from '@camera.ui/sdk';
import type {
  CamerasResponse,
  DBCamera,
  Go2RTCProbe,
  MethodKeys,
  PaginationQuery,
  PatchStorateInput,
  PluginExtension,
  PluginExtensionConfig,
  SetStorageInput,
  SubmitStorageInput,
} from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function createCameraFn({ cameraData }: { cameraData: CreateCameraInput }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.post('/cameras', cameraData);
  return response.data;
}

export async function previewCameraFn({ cameraData }: { cameraData: PreviewCameraInput }): Promise<string> {
  const response: AxiosResponse<string> = await api.post('/cameras/preview', cameraData);
  return response.data;
}

export async function getRoomsFn({ signal }: { signal: AbortSignal }): Promise<string[]> {
  const response: AxiosResponse<string[]> = await api.get('/cameras/rooms', { signal });
  return response.data;
}

export async function getCameraFn({ cameraname, signal }: { cameraname: string; signal: AbortSignal }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.get(`/cameras/${cameraname}`, { signal });
  return response.data;
}

export async function clearLogFn({ cameraname }: { cameraname: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/cameras/${cameraname}/log`);
  return response.data;
}

export async function downloadLogFn({ cameraname, signal }: { cameraname: string; signal: AbortSignal }): Promise<BlobPart> {
  const response: AxiosResponse<BlobPart> = await api.get(`/cameras/${cameraname}/log/download`, { signal });
  return response.data;
}

export async function streamSourceInfoFn({ cameraname, sourcename, signal }: { cameraname: string; sourcename: string; signal?: AbortSignal }): Promise<Go2RTCProbe> {
  const response: AxiosResponse<Go2RTCProbe> = await api.get(`/cameras/${cameraname}/info/${sourcename}`, {
    signal,
  });
  return response.data;
}

export async function probeCameraSourceFn({
  cameraname,
  sourcename,
  probeConfig,
  force,
  signal,
}: {
  cameraname: string;
  sourcename: string;
  probeConfig?: ProbeConfig;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<{ rtspUrl: string; onvifUrl: string; probe: Go2RTCProbe }> {
  const response: AxiosResponse<{ rtspUrl: string; onvifUrl: string; probe: Go2RTCProbe }> = await api.get(`/cameras/${cameraname}/probe/${sourcename}`, {
    params: { ...probeConfig, ...(force ? { refresh: true } : {}) },
    signal,
  });
  return response.data;
}

export async function getCameraSnapshotFn({ cameraname, forceNew, signal }: { cameraname: string; forceNew?: boolean; signal?: AbortSignal }): Promise<string> {
  const response: AxiosResponse<string> = await api.get(`/cameras/${cameraname}/snapshot`, { signal, params: { forceNew } });
  return response.data;
}

export async function getCamerasFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<CamerasResponse> {
  const response: AxiosResponse<CamerasResponse> = await api.get('/cameras', { params: parameter, signal });
  return response.data;
}

export async function patchCameraFn({ cameraname, cameraData }: { cameraname: string; cameraData: PatchCameraInput }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.patch(`/cameras/${cameraname}`, cameraData);
  return response.data;
}

export async function getCameraExtensionsFn({ cameraname, signal }: { cameraname: string; signal: AbortSignal }): Promise<PluginExtension[]> {
  const response: AxiosResponse<PluginExtension[]> = await api.get(`/cameras/${cameraname}/extensions`, { signal });
  return response.data;
}

export async function getCameraExtensionConfigFn({
  cameraname,
  pluginname,
  signal,
}: {
  cameraname: string;
  pluginname: string;
  signal: AbortSignal;
}): Promise<PluginExtensionConfig> {
  const response: AxiosResponse<PluginExtensionConfig> = await api.get(`/cameras/${cameraname}/${pluginname}/config`, { signal });
  return response.data;
}

export async function patchCameraExtensionConfigFn({
  cameraname,
  pluginname,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  configData: PatchStorateInput;
}): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.patch(`/cameras/${cameraname}/${pluginname}/config`, configData);
  return response.data;
}

export async function setCameraExtensionConfigFn({
  cameraname,
  pluginname,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  configData: SetStorageInput;
}): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/cameras/${cameraname}/${pluginname}/config`, configData);
  return response.data;
}

export async function submitCameraExtensionConfigFn({
  cameraname,
  pluginname,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  configData: SubmitStorageInput;
}): Promise<FormSubmitResponse | void> {
  const response: AxiosResponse<FormSubmitResponse | void> = await api.post(`/cameras/${cameraname}/${pluginname}/config`, configData);
  return response.data;
}

export async function getSensorConfigFn({
  cameraname,
  pluginname,
  sensorId,
  signal,
}: {
  cameraname: string;
  pluginname: string;
  sensorId: string;
  signal: AbortSignal;
}): Promise<PluginExtensionConfig> {
  const response: AxiosResponse<PluginExtensionConfig> = await api.get(`/cameras/${cameraname}/${pluginname}/sensor/${sensorId}/config`, { signal });
  return response.data;
}

export async function patchSensorConfigFn({
  cameraname,
  pluginname,
  sensorId,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  sensorId: string;
  configData: PatchStorateInput;
}): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.patch(`/cameras/${cameraname}/${pluginname}/sensor/${sensorId}/config`, configData);
  return response.data;
}

export async function setSensorConfigFn({
  cameraname,
  pluginname,
  sensorId,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  sensorId: string;
  configData: SetStorageInput;
}): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.put(`/cameras/${cameraname}/${pluginname}/sensor/${sensorId}/config`, configData);
  return response.data;
}

export async function submitSensorConfigFn({
  cameraname,
  pluginname,
  sensorId,
  configData,
}: {
  cameraname: string;
  pluginname: string;
  sensorId: string;
  configData: SubmitStorageInput;
}): Promise<FormSubmitResponse | void> {
  const response: AxiosResponse<FormSubmitResponse | void> = await api.post(`/cameras/${cameraname}/${pluginname}/sensor/${sensorId}/config`, configData);
  return response.data;
}

type AssignmentType = SensorType | 'hub' | 'cameraController';

export async function enableCameraExtensionFn({ cameraname, pluginname, type }: { cameraname: string; pluginname: string; type: AssignmentType }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.put(`/cameras/${cameraname}/${pluginname}/enable`, null, { params: { type } });
  return response.data;
}

export async function disableCameraExtensionFn({ cameraname, pluginname, type }: { cameraname: string; pluginname: string; type: AssignmentType }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.put(`/cameras/${cameraname}/${pluginname}/disable`, null, { params: { type } });
  return response.data;
}

export async function addCameraExtensionFn({ cameraname, pluginname, type }: { cameraname: string; pluginname: string; type: AssignmentType }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.post(`/cameras/${cameraname}/${pluginname}`, null, { params: { type } });
  return response.data;
}

export async function removeCameraExtensionFn({ cameraname, pluginname, type }: { cameraname: string; pluginname: string; type: AssignmentType }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.delete(`/cameras/${cameraname}/${pluginname}`, { params: { type } });
  return response.data;
}

export async function activateCameraExtensionFn({ cameraname, pluginname }: { cameraname: string; pluginname: string }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.post(`/cameras/${cameraname}/${pluginname}/activate`);
  return response.data;
}

export async function deactivateCameraExtensionFn({ cameraname, pluginname }: { cameraname: string; pluginname: string }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.delete(`/cameras/${cameraname}/${pluginname}/deactivate`);
  return response.data;
}

export async function getZonesFn({ cameraname, signal }: { cameraname: string; signal: AbortSignal }): Promise<DetectionZone[] | undefined> {
  const response: AxiosResponse<DetectionZone[]> = await api.get(`/cameras/${cameraname}/zones`, { signal });
  return response.data;
}

export async function patchZonesFn({ cameraname, zoneData }: { cameraname: string; zoneData: DetectionZone[] }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.patch(`/cameras/${cameraname}/zones`, zoneData);
  return response.data;
}

export async function getLinesFn({ cameraname, signal }: { cameraname: string; signal: AbortSignal }): Promise<DetectionLine[] | undefined> {
  const response: AxiosResponse<DetectionLine[]> = await api.get(`/cameras/${cameraname}/lines`, { signal });
  return response.data;
}

export async function patchLinesFn({ cameraname, lineData }: { cameraname: string; lineData: DetectionLine[] }): Promise<DBCamera> {
  const response: AxiosResponse<DBCamera> = await api.patch(`/cameras/${cameraname}/lines`, lineData);
  return response.data;
}

export async function removeCameraFn({ cameraname }: { cameraname: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/cameras/${cameraname}`);
  return response.data;
}

export async function removeCamerasFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete('/cameras');
  return response.data;
}

export class CamerasQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<CamerasQuery>; enabled: boolean }[]>([
    {
      name: 'getCameraQuery',
      enabled: true,
    },
    {
      name: 'getCamerasQuery',
      enabled: true,
    },
    {
      name: 'getCameraSnapshotQuery',
      enabled: true,
    },
    {
      name: 'getCameraExtensionsQuery',
      enabled: true,
    },
    {
      name: 'getCameraExtensionConfigQuery',
      enabled: true,
    },
    {
      name: 'getZonesQuery',
      enabled: true,
    },
    {
      name: 'streamSourceInfoQuery',
      enabled: true,
    },
    {
      name: 'probeCameraSourceQuery',
      enabled: true,
    },
    {
      name: 'downloadLogQuery',
      enabled: true,
    },
    {
      name: 'getSensorConfigQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public createCameraQuery() {
    return useMutation({
      mutationFn: createCameraFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.camera_added'), life: 3000 });
      },
    });
  }

  public previewCameraQuery() {
    return useMutation({
      mutationFn: previewCameraFn,
    });
  }

  public getCameraQuery(cameraname: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['cameras', cameraname],
      queryFn: ({ signal }) => getCameraFn({ cameraname: unref(cameraname), signal }),
      initialData: () => {
        const name = unref(cameraname);
        const lists = this._queryClient.getQueriesData<CamerasResponse>({ queryKey: ['camerasList'] });
        for (const [, data] of lists) {
          const cam = data?.result?.find((c) => c.name === name);
          if (cam) return cam;
        }
        return undefined;
      },
      initialDataUpdatedAt: 0,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getCameraQuery' && query.enabled),
    });
  }

  public getCameraExtensionsQuery(cameraname: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['camerasExtensions', cameraname],
      queryFn: ({ signal }) => getCameraExtensionsFn({ cameraname: unref(cameraname), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getCameraExtensionsQuery' && query.enabled),
    });
  }

  public streamSourceInfoQuery(cameraname: string | Ref<string> | ComputedRef<string>, sourcename: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['cameras', cameraname, 'info', sourcename],
      queryFn: ({ signal }) =>
        streamSourceInfoFn({
          cameraname: unref(cameraname),
          sourcename: unref(sourcename),
          signal,
        }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'streamSourceInfoQuery' && query.enabled),
    });
  }

  public probeCameraSourceQuery(
    cameraname: string | Ref<string> | ComputedRef<string>,
    sourcename: string | Ref<string> | ComputedRef<string>,
    probeConfig?: MaybeRef<ProbeConfig>,
  ) {
    return useQueryEnhanced({
      queryKey: ['cameras', cameraname, 'probe', sourcename],
      queryFn: ({ signal }) =>
        probeCameraSourceFn({
          cameraname: unref(cameraname),
          sourcename: unref(sourcename),
          probeConfig: unref(probeConfig),
          signal,
        }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'probeCameraSourceQuery' && query.enabled),
    });
  }

  public getCameraSnapshotQuery(cameraname: string | Ref<string> | ComputedRef<string>, forceNew?: boolean | Ref<boolean> | ComputedRef<boolean>) {
    return useQueryEnhanced({
      queryKey: ['camerasSnapshot', cameraname],
      queryFn: ({ signal }) => getCameraSnapshotFn({ cameraname: unref(cameraname), forceNew: unref(forceNew), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getCameraSnapshotQuery' && query.enabled),
      retry: false,
    });
  }

  public getCamerasQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['camerasList', pagination],
      queryFn: ({ signal }) => getCamerasFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getCamerasQuery' && query.enabled),
    });
  }

  public getRoomsQuery() {
    return useQueryEnhanced({
      queryKey: ['camerasRooms'],
      queryFn: ({ signal }) => getRoomsFn({ signal }),
    });
  }

  public patchCameraQuery() {
    return useMutation({
      mutationFn: patchCameraFn,
      onSuccess: async (data, variables) => {
        const cameraNameChanged = variables.cameraData.name && variables.cameraData.name !== variables.cameraname;
        const roomChanged = variables.cameraData.room !== undefined;

        if (cameraNameChanged) {
          const oldCameraName = variables.cameraname;
          this._queryClient.setQueryData(['cameras', variables.cameraData.name], data);
          this._queryClient.removeQueries({ predicate: (query) => query.queryKey.includes(oldCameraName), type: 'inactive' });
          await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
        } else {
          await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
          await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });
          await this._queryClient.refetchQueries({ queryKey: ['cameras', 'extensions', variables.cameraname], type: 'active' });
          if (roomChanged) {
            await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
            await this._queryClient.refetchQueries({ queryKey: ['camerasRooms'] });
          }
        }

        this.toast.add({ severity: 'success', detail: this.t('components.toast.camera_updated'), life: 3000 });
      },
    });
  }

  public getCameraExtensionConfigQuery(
    cameraname: string | Ref<string> | ComputedRef<string>,
    pluginname: string | Ref<string> | ComputedRef<string>,
    refetch: Ref<boolean>,
  ) {
    return useQueryEnhanced({
      queryKey: ['cameras', 'extensions', cameraname, pluginname],
      queryFn: ({ signal }) =>
        getCameraExtensionConfigFn({
          cameraname: unref(cameraname),
          pluginname: unref(pluginname),
          signal,
        }),
      enabled: () => !!unref(pluginname) && this.queryActivator.value.some((query) => query.name === 'getCameraExtensionConfigQuery' && query.enabled),
      refetchInterval() {
        if (refetch.value) {
          return 10000;
        }
      },
      retry: 10,
      retryDelay: 500,
      staleTime: 0,
    });
  }

  public patchCameraExtensionConfigQuery() {
    return useMutation({
      mutationFn: patchCameraExtensionConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'extensions', variables.cameraname], type: 'active' });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });

        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_config_updated'), life: 3000 });
      },
    });
  }

  public setCameraExtensionConfigQuery() {
    return useMutation({
      mutationFn: setCameraExtensionConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'extensions', variables.cameraname], type: 'active' });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });

        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_config_submitted'), life: 3000 });
      },
    });
  }

  public submitCameraExtensionConfigQuery() {
    return useMutation({
      mutationFn: submitCameraExtensionConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'extensions', variables.cameraname], type: 'active' });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });

        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_config_submitted'), life: 3000 });
      },
    });
  }

  public getSensorConfigQuery(
    cameraname: string | Ref<string> | ComputedRef<string>,
    pluginname: string | Ref<string> | ComputedRef<string>,
    sensorId: string | Ref<string> | ComputedRef<string>,
    refetch: Ref<boolean>,
  ) {
    return useQueryEnhanced({
      queryKey: ['cameras', 'sensor', cameraname, pluginname, sensorId],
      queryFn: ({ signal }) =>
        getSensorConfigFn({
          cameraname: unref(cameraname),
          pluginname: unref(pluginname),
          sensorId: unref(sensorId),
          signal,
        }),
      enabled: () => {
        const pluginnameValue = unref(pluginname);
        const sensorIdValue = unref(sensorId);
        // Don't fire if parameters are empty
        if (!pluginnameValue || !sensorIdValue) return false;
        return this.queryActivator.value.some((query) => query.name === 'getSensorConfigQuery' && query.enabled);
      },
      refetchInterval() {
        if (refetch.value) {
          return 10000;
        }
      },
      retry: 3,
      retryDelay: 500,
      staleTime: 0,
    });
  }

  public patchSensorConfigQuery() {
    return useMutation({
      mutationFn: patchSensorConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'sensor', variables.cameraname, variables.pluginname, variables.sensorId] });
      },
    });
  }

  public setSensorConfigQuery() {
    return useMutation({
      mutationFn: setSensorConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'sensor', variables.cameraname, variables.pluginname, variables.sensorId] });
      },
    });
  }

  public submitSensorConfigQuery() {
    return useMutation({
      mutationFn: submitSensorConfigFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['cameras', 'sensor', variables.cameraname, variables.pluginname, variables.sensorId] });
      },
    });
  }

  public enableCameraExtensionQuery() {
    return useMutation({
      mutationFn: enableCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });

        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_enabled'), life: 3000 });
      },
    });
  }

  public disableCameraExtensionQuery() {
    return useMutation({
      mutationFn: disableCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });

        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_disabled'), life: 3000 });
      },
    });
  }

  public addCameraExtensionQuery() {
    return useMutation({
      mutationFn: addCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });
      },
    });
  }

  public activateCameraExtensionQuery() {
    return useMutation({
      mutationFn: activateCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });
      },
    });
  }

  public deactivateCameraExtensionQuery() {
    return useMutation({
      mutationFn: deactivateCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });
      },
    });
  }

  public getZonesQuery(cameraname: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['cameras', cameraname, 'zones'],
      queryFn: ({ signal }) =>
        getZonesFn({
          cameraname: unref(cameraname),
          signal,
        }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getZonesQuery' && query.enabled),
    });
  }

  public patchZonesQuery() {
    return useMutation({
      mutationFn: patchZonesFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.zone_updated'), life: 3000 });
      },
    });
  }

  public patchLinesQuery() {
    return useMutation({
      mutationFn: patchLinesFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.line_updated'), life: 3000 });
      },
    });
  }

  public removeCameraExtensionQuery() {
    return useMutation({
      mutationFn: removeCameraExtensionFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['cameras', variables.cameraname], exact: true });
        await this._queryClient.refetchQueries({ queryKey: ['camerasExtensions', variables.cameraname] });
        // this.toast.add({ severity: 'success',  detail: this.t('components.toast.plugin_removed'), life: 3000 });
      },
    });
  }

  public removeCameraQuery() {
    return useMutation({
      mutationFn: removeCameraFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.camera_removed'), life: 3000 });
      },
    });
  }

  public removeCamerasQuery() {
    return useMutation({
      mutationFn: removeCamerasFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['camerasList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.cameras_removed'), life: 3000 });
      },
    });
  }

  public downloadLogQuery(cameraname: string | Ref<string> | ComputedRef<string>) {
    return useQueryEnhanced({
      queryKey: ['logs', cameraname],
      queryFn: ({ signal }) => downloadLogFn({ cameraname: unref(cameraname), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'downloadLogQuery' && query.enabled),
    });
  }

  public clearLogQuery() {
    return useMutation({
      mutationFn: clearLogFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['logs', variables.cameraname], exact: true });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.log_cleared'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<CamerasQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
