import { i18n } from '@/i18n/index.js';
import { axiosInstance as api } from '..';

import type { CreateUserInput, PatchUserInput } from '@/schemas/users.schema.js';
import type {
  CreateShortcutInput,
  CreateViewInput,
  DBCameraShortcut,
  DBCamviewLayout,
  DBUser,
  MethodKeys,
  PaginationQuery,
  PatchShortcutInput,
  PatchViewInput,
  UsersResponse,
  ViewsResponse,
} from '@shared/types';
import type { AxiosResponse } from 'axios';
import type { AckResponse } from '..';

export async function createUserFn({ userData }: { userData: CreateUserInput }): Promise<DBUser> {
  const response: AxiosResponse<DBUser> = await api.post('/users', userData);
  return response.data;
}

export async function getUserFn({ username, signal }: { username: string; signal: AbortSignal }): Promise<DBUser> {
  const response: AxiosResponse<DBUser> = await api.get(`/users/${username}`, { signal });
  return response.data;
}

export async function getUsersFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<UsersResponse> {
  const response: AxiosResponse<UsersResponse> = await api.get('/users', { params: parameter, signal });
  return response.data;
}

export async function patchUserFn({ username, userData }: { username: string; userData: PatchUserInput | FormData }): Promise<DBUser> {
  const response: AxiosResponse<DBUser> = await api.patch(`/users/${username}`, userData);
  return response.data;
}

export async function removeUserFn({ username }: { username: string }): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete(`/users/${username}`);
  return response.data;
}

export async function removeUsersFn(): Promise<AckResponse> {
  const response: AxiosResponse<AckResponse> = await api.delete('/users');
  return response.data;
}

export async function createShortcutFn({
  username,
  cameraname,
  shortcutData,
}: {
  username: string;
  cameraname: string;
  shortcutData: CreateShortcutInput;
}): Promise<DBCameraShortcut[]> {
  const response: AxiosResponse<DBCameraShortcut[]> = await api.post(`/users/${username}/preferences/cameras/${cameraname}/shortcuts`, shortcutData);
  return response.data;
}

export async function getShortcutFn({
  username,
  cameraname,
  shortcutid,
  signal,
}: {
  username: string;
  cameraname: string;
  shortcutid: string;
  signal: AbortSignal;
}): Promise<DBCameraShortcut> {
  const response: AxiosResponse<DBCameraShortcut> = await api.get(`/users/${username}/preferences/cameras/${cameraname}/shortcuts/${shortcutid}`, { signal });
  return response.data;
}

export async function getShortcutsFn({ username, cameraname, signal }: { username: string; cameraname: string; signal: AbortSignal }): Promise<DBCameraShortcut[]> {
  const response: AxiosResponse<DBCameraShortcut[]> = await api.get(`/users/${username}/preferences/cameras/${cameraname}/shortcuts`, { signal });
  return response.data;
}

export async function patchShortcutFn({
  username,
  cameraname,
  shortcutid,
  shortcutData,
}: {
  username: string;
  cameraname: string;
  shortcutid: string;
  shortcutData: PatchShortcutInput;
}): Promise<DBCameraShortcut[]> {
  const response: AxiosResponse<DBCameraShortcut[]> = await api.patch(`/users/${username}/preferences/cameras/${cameraname}/shortcuts/${shortcutid}`, shortcutData);
  return response.data;
}

export async function removeShortcutFn({ username, cameraname, shortcutid }: { username: string; cameraname: string; shortcutid: string }): Promise<DBCameraShortcut[]> {
  const response: AxiosResponse<DBCameraShortcut[]> = await api.delete(`/users/${username}/preferences/cameras/${cameraname}/shortcuts/${shortcutid}`);
  return response.data;
}

export async function removeShortcutsFn({ username, cameraname }: { username: string; cameraname: string }): Promise<DBCameraShortcut[]> {
  const response: AxiosResponse<DBCameraShortcut[]> = await api.delete(`/users/${username}/preferences/cameras/${cameraname}/shortcuts`);
  return response.data;
}

export async function createViewFn({ username, viewData }: { username: string; viewData: CreateViewInput }): Promise<DBCamviewLayout> {
  const response: AxiosResponse<DBCamviewLayout> = await api.post(`/users/${username}/preferences/camview/views`, viewData);
  return response.data;
}

export async function getViewFn({ username, viewid, signal }: { username: string; viewid: string; signal: AbortSignal }): Promise<DBCamviewLayout> {
  const response: AxiosResponse<DBCamviewLayout> = await api.get(`/users/${username}/preferences/camview/views/${viewid}`, { signal });
  return response.data;
}

export async function getViewsFn({ username, parameter, signal }: { username: string; parameter: PaginationQuery; signal: AbortSignal }): Promise<ViewsResponse> {
  const response: AxiosResponse<ViewsResponse> = await api.get(`/users/${username}/preferences/camview/views`, { params: parameter, signal });
  return response.data;
}

export async function patchViewFn({ username, viewid, viewData }: { username: string; viewid: string; viewData: PatchViewInput }): Promise<DBCamviewLayout> {
  const response: AxiosResponse<DBCamviewLayout> = await api.patch(`/users/${username}/preferences/camview/views/${viewid}`, viewData);
  return response.data;
}

export async function removeViewFn({ username, viewid }: { username: string; viewid: string }): Promise<DBCamviewLayout[]> {
  const response: AxiosResponse<DBCamviewLayout[]> = await api.delete(`/users/${username}/preferences/camview/views/${viewid}`);
  return response.data;
}

export async function removeViewsFn({ username }: { username: string }): Promise<DBCamviewLayout[]> {
  const response: AxiosResponse<DBCamviewLayout[]> = await api.delete(`/users/${username}/preferences/camview/views`);
  return response.data;
}

export class UsersQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<UsersQuery>; enabled: boolean }[]>([
    {
      name: 'getUserQuery',
      enabled: true,
    },
    {
      name: 'getUsersQuery',
      enabled: true,
    },
    {
      name: 'getShortcutQuery',
      enabled: true,
    },
    {
      name: 'getShortcutsQuery',
      enabled: true,
    },
    {
      name: 'getViewQuery',
      enabled: true,
    },
    {
      name: 'getViewsQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public createUserQuery() {
    return useMutation({
      mutationFn: createUserFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['usersList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.user_added'), life: 3000 });
      },
    });
  }

  public getUserQuery(username: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['users', username],
      queryFn: ({ signal }) => getUserFn({ username: unref(username), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getUserQuery' && query.enabled),
    });
  }

  public getUsersQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['usersList', pagination],
      queryFn: ({ signal }) => getUsersFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getUsersQuery' && query.enabled),
    });
  }

  public patchUserQuery() {
    return useMutation({
      mutationFn: async ({ username, userData }: { username: string; userData: PatchUserInput | FormData }) => {
        await patchUserFn({ username, userData });
      },
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['users', variables.username] });
        // this.toast.add({ severity: 'success', detail: this.t('components.toast.user_updated'), life: 3000 });
      },
    });
  }

  public removeUserQuery() {
    return useMutation({
      mutationFn: removeUserFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['usersList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.user_removed'), life: 3000 });
      },
    });
  }

  public removeUsersQuery() {
    return useMutation({
      mutationFn: removeUsersFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['usersList'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.users_removed'), life: 3000 });
      },
    });
  }

  public createShortcutQuery() {
    return useMutation({
      mutationFn: createShortcutFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['shortcutsList', variables.username] });
      },
    });
  }

  public getShortcutQuery(username: string | Ref<string>, cameraname: string | Ref<string>, shortcutid: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['shortcutsList', username, cameraname, shortcutid],
      queryFn: ({ signal }) => getShortcutFn({ username: unref(username), cameraname: unref(cameraname), shortcutid: unref(shortcutid), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getShortcutQuery' && query.enabled),
    });
  }

  public getShortcutsQuery(username: string | Ref<string>, cameraname: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['shortcutsList', username, cameraname],
      queryFn: ({ signal }) => getShortcutsFn({ username: unref(username), cameraname: unref(cameraname), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getShortcutsQuery' && query.enabled),
    });
  }

  public patchShortcutQuery() {
    return useMutation({
      mutationFn: patchShortcutFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['shortcutsList', variables.username] });
      },
    });
  }

  public removeShortcutQuery() {
    return useMutation({
      mutationFn: removeShortcutFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['shortcutsList', variables.username] });
      },
    });
  }

  public removeShortcutsQuery() {
    return useMutation({
      mutationFn: removeShortcutsFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['shortcutsList', variables.username] });
      },
    });
  }

  public createViewQuery() {
    return useMutation({
      mutationFn: createViewFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['viewsList', variables.username] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.view_added'), life: 3000 });
      },
    });
  }

  public getViewQuery(username: string | Ref<string>, viewid: string | Ref<string>) {
    return useQueryEnhanced({
      queryKey: ['viewsList', username],
      queryFn: ({ signal }) => getViewFn({ username: unref(username), viewid: unref(viewid), signal }),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getUserQuery' && query.enabled),
    });
  }

  public getViewsQuery(username: string | Ref<string>, pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['viewsList', username, pagination],
      queryFn: ({ signal }) => getViewsFn({ username: unref(username), parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'getViewsQuery' && query.enabled),
    });
  }

  public patchViewQuery() {
    return useMutation({
      mutationFn: patchViewFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['viewsList', variables.username] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.view_updated'), life: 3000 });
      },
    });
  }

  public patchViewQuerySilent() {
    return useMutation({
      mutationFn: patchViewFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.invalidateQueries({ queryKey: ['viewsList', variables.username], refetchType: 'none' });
      },
    });
  }

  public removeViewQuery() {
    return useMutation({
      mutationFn: removeViewFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['viewsList', variables.username] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.view_removed'), life: 3000 });
      },
    });
  }

  public removeViewsQuery() {
    return useMutation({
      mutationFn: removeViewsFn,
      onSuccess: async (_data, variables) => {
        await this._queryClient.refetchQueries({ queryKey: ['viewsList', variables.username] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.views_removed'), life: 3000 });
      },
    });
  }

  public toggleQueryActivator(name: MethodKeys<UsersQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
