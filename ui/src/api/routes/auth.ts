import { useConnection } from '@/connection/index.js';
import { axiosInstance as api } from '..';

import { i18n } from '@/i18n/index.js';
import type { LoginUserInput } from '@/schemas/users.schema.js';
import type {
  JwtTokenResponse,
  LogoutResponse,
  MethodKeys,
  PaginationQuery,
  SessionInfo,
  SessionResponse,
  TwoFactorBackupCodesResponse,
  TwoFactorPendingResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  UserData,
} from '@shared/types';
import type { AxiosResponse } from 'axios';

export type LoginResponse = UserData | TwoFactorPendingResponse;

export async function checkFn(signal?: AbortSignal): Promise<SessionResponse> {
  const endpoint = useConnection().endpoint.value ?? window.location.origin;
  const response: AxiosResponse<SessionResponse> = await api.get('/tunnel/check', {
    signal,
    baseURL: endpoint,
  });
  return response.data;
}

export async function listSessionsFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<SessionInfo[]> {
  const response: AxiosResponse<{ result: SessionInfo[] }> = await api.get('/auth/sessions', {
    params: parameter,
    signal,
  });
  return response.data.result ?? [];
}

export async function listAllSessionsFn({ parameter, signal }: { parameter: PaginationQuery; signal: AbortSignal }): Promise<SessionInfo[]> {
  const response: AxiosResponse<{ result: SessionInfo[] }> = await api.get('/auth/sessions/all', {
    params: parameter,
    signal,
  });
  return response.data.result ?? [];
}

export async function revokeSessionFn({ id }: { id: string }): Promise<void> {
  await api.delete(`/auth/sessions/${id}`);
}

export async function revokeOtherSessionsFn(): Promise<void> {
  await api.delete('/auth/sessions');
}

export async function loginFn({ loginInformation }: { loginInformation: LoginUserInput }): Promise<LoginResponse> {
  const response: AxiosResponse<LoginResponse> = await api.post('/auth/login', loginInformation);
  return response.data;
}

export async function verify2FAFn({ tempToken, code }: { tempToken: string; code: string }): Promise<UserData> {
  const response: AxiosResponse<UserData> = await api.post('/auth/verify-2fa', { tempToken, code });
  return response.data;
}

export async function get2FAStatusFn(signal?: AbortSignal): Promise<TwoFactorStatusResponse> {
  const response: AxiosResponse<TwoFactorStatusResponse> = await api.get('/auth/2fa/status', { signal });
  return response.data;
}

export async function setup2FAFn(): Promise<TwoFactorSetupResponse> {
  const response: AxiosResponse<TwoFactorSetupResponse> = await api.post('/auth/2fa/setup');
  return response.data;
}

export async function enable2FAFn({ code }: { code: string }): Promise<TwoFactorBackupCodesResponse> {
  const response: AxiosResponse<TwoFactorBackupCodesResponse> = await api.post('/auth/2fa/enable', { code });
  return response.data;
}

export async function disable2FAFn({ code }: { code: string }): Promise<void> {
  await api.post('/auth/2fa/disable', { code });
}

export async function regenerateBackupCodesFn({ code }: { code: string }): Promise<TwoFactorBackupCodesResponse> {
  const response: AxiosResponse<TwoFactorBackupCodesResponse> = await api.post('/auth/2fa/backup-codes', { code });
  return response.data;
}

export async function logoutFn(): Promise<LogoutResponse> {
  const response: AxiosResponse<LogoutResponse> = await api.post('/auth/logout');
  return response.data;
}

export async function refreshFn({ refresh_token, signal }: { refresh_token: string; signal?: AbortSignal }): Promise<JwtTokenResponse> {
  // Explicit 10s timeout + abort signal — without it, a refresh launched
  // against a stale endpoint (network mode changed, Cloudflare URL rotated,
  // server restarted) hangs for ~60-75s on iOS WebKit's TCP timeout. While
  // it hangs the session-store's `_refreshInFlight` lock blocks ALL retry
  // attempts, including axios's own 401-Token-expired retry path. The
  // session-store abort is the fast recovery path (orchestrator triggers
  // it on endpoint-swap, ~50ms); the timeout is the safety net (10s) for
  // cases where no swap happens to clear the lock.
  const response: AxiosResponse<JwtTokenResponse> = await api.post('/auth/refresh', { refresh_token: refresh_token }, { timeout: 10_000, signal });

  return response.data;
}

export class AuthQuery {
  private _queryClient = useQueryClient();
  private t = i18n.global.t;
  private toast = useCuiToast();

  private queryActivator = ref<{ name: MethodKeys<AuthQuery>; enabled: boolean }[]>([
    {
      name: 'checkQuery',
      enabled: true,
    },
    {
      name: 'listSessionsQuery',
      enabled: true,
    },
    {
      name: 'listAllSessionsQuery',
      enabled: true,
    },
    {
      name: 'get2FAStatusQuery',
      enabled: true,
    },
  ]);

  get queryClient() {
    return this._queryClient;
  }

  public checkQuery() {
    return useQueryEnhanced({
      queryKey: ['auth', 'check'],
      queryFn: ({ signal }) => checkFn(signal),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'checkQuery' && query.enabled),
    });
  }

  public listSessionsQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['auth', 'sessions', pagination],
      queryFn: ({ signal }) => listSessionsFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'listSessionsQuery' && query.enabled),
    });
  }

  public listAllSessionsQuery(pagination: PaginationQuery | Ref<PaginationQuery> | ComputedRef<PaginationQuery>) {
    return useQueryEnhanced({
      queryKey: ['auth', 'sessions', 'all', pagination],
      queryFn: ({ signal }) => listAllSessionsFn({ parameter: unref(pagination), signal }),
      placeholderData: (previousData: any) => previousData,
      enabled: () => this.queryActivator.value.some((query) => query.name === 'listAllSessionsQuery' && query.enabled),
    });
  }

  public loginQuery() {
    return useMutation({
      mutationFn: loginFn,
      // Override global onError to prevent logout/reload on failed login
      onError: () => {
        // Error handling is done in Login.vue
      },
    });
  }

  public logoutQuery() {
    return useMutation({
      mutationFn: logoutFn,
    });
  }

  public revokeSessionQuery() {
    return useMutation({
      mutationFn: revokeSessionFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['auth', 'sessions'] });
        this.toast.add({ severity: 'success', detail: this.t('components.toast.user_logged_out'), life: 3000 });
      },
    });
  }

  public revokeOtherSessionsQuery() {
    return useMutation({
      mutationFn: revokeOtherSessionsFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['auth', 'sessions'] });
        this.toast.add({ severity: 'success', detail: this.t('views.settings.active_sessions.revoke_others_success'), life: 3000 });
      },
    });
  }

  public refreshQuery() {
    return useMutation({
      mutationFn: refreshFn,
    });
  }

  public verify2FAQuery() {
    return useMutation({
      mutationFn: verify2FAFn,
      // Override global onError to prevent logout on 401 during 2FA verification
      onError: () => {
        // Error handling is done in Login.vue
      },
    });
  }

  public get2FAStatusQuery() {
    return useQueryEnhanced({
      queryKey: ['auth', '2fa', 'status'],
      queryFn: ({ signal }) => get2FAStatusFn(signal),
      enabled: () => this.queryActivator.value.some((query) => query.name === 'get2FAStatusQuery' && query.enabled),
    });
  }

  public setup2FAQuery() {
    return useMutation({
      mutationFn: setup2FAFn,
    });
  }

  public enable2FAQuery() {
    return useMutation({
      mutationFn: enable2FAFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['auth', '2fa', 'status'] });
      },
    });
  }

  public disable2FAQuery() {
    return useMutation({
      mutationFn: disable2FAFn,
      onSuccess: async () => {
        await this._queryClient.refetchQueries({ queryKey: ['auth', '2fa', 'status'] });
      },
    });
  }

  public regenerateBackupCodesQuery() {
    return useMutation({
      mutationFn: regenerateBackupCodesFn,
    });
  }

  public toggleQueryActivator(name: MethodKeys<AuthQuery>, state: boolean) {
    const query = this.queryActivator.value.find((query) => query.name === name);

    if (query) {
      query.enabled = state;
    }

    return this;
  }
}
