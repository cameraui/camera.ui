import { useEventListener, useLocalStorage } from '@vueuse/core';

import { getMeFn } from '@/api/routes/auth.js';
import { UsersQuery } from '@/api/routes/users.js';
import { isEmbedded, proxyLogoutUrl, runtimeBase } from '@/common/base.js';
import { login as connectionLogin, verify2FA as connectionVerify2FA, getServerKey, isTwoFactorPending, logoutCurrent, useConnection } from '@/connection/index.js';
import router, { resolveLandingPage } from '@/router/index.js';

import type { NavLayoutSettings } from '@shared/types';
import type { UserLanguage } from '@shared/types';
import type { LoginCredentials, LoginUserData } from '@/connection/index.js';
import type { PatchUserInput } from '@/schemas/users.schema.js';

export interface PersistedUser {
  _id: string;
  username: string;
  role: string;
  firstLogin?: boolean;
  avatar?: string;
  navLayout?: NavLayoutSettings | null;
}

const log = useLogger('Auth');

function userStorageKey(): string {
  if (isEmbedded()) return `user:${runtimeBase()}`;

  const serverId = getServerKey();
  if (!serverId) return 'user';

  const key = `user:${serverId}`;
  // keeps an open session signed in, refreshUser corrects a user from another server
  const shared = localStorage.getItem('user');
  if (shared && !localStorage.getItem(key)) localStorage.setItem(key, shared);
  return key;
}

function readUser(raw: string | null): PersistedUser | null {
  return raw ? (JSON.parse(raw) as PersistedUser) : null;
}

export const useAuthStore = defineStore('auth', () => {
  const usersQuery = new UsersQuery();
  const connection = useConnection();

  const storageKey = userStorageKey();
  const user = useLocalStorage<PersistedUser | null>(storageKey, null, {
    listenToStorageChanges: false,
    serializer: { read: readUser, write: (v) => JSON.stringify(v) },
  });

  const pending2FA = ref<{ tempToken: string } | null>(null);
  const loginLoading = ref(false);
  const verify2FALoading = ref(false);
  const logoutLoading = ref(false);

  const { mutateAsync: patchUserFn, isPending: patchUserPending } = usersQuery.patchUserQuery();

  const isLoggedIn = computed(() => user.value !== null && !connection.isNeedsAuth.value);
  const requires2FA = computed(() => pending2FA.value !== null);
  const totalLoginLoading = computed(() => loginLoading.value || verify2FALoading.value || logoutLoading.value || patchUserPending.value);

  function setUserFromLogin(data: LoginUserData | undefined): void {
    if (!data?._id || !data.username || !data.role) {
      return;
    }

    user.value = {
      _id: data._id,
      username: data.username,
      role: data.role,
      firstLogin: data.firstLogin,
      avatar: data.avatar,
      navLayout: data.navLayout ?? null,
    };

    if (data.language) {
      useLocaleStore().applyServerLanguage(data.language as UserLanguage);
    }
  }

  async function refreshUser(): Promise<void> {
    // an embedded page follows the language of its host
    if (isEmbedded()) return;

    try {
      setUserFromLogin(await getMeFn());
    } catch (err) {
      log.warn('failed to refresh the user:', err);
    }
  }

  async function login(credentials: LoginCredentials): Promise<void> {
    if (isLoggedIn.value) return;
    loginLoading.value = true;
    try {
      const outcome = await connectionLogin(credentials);
      if (isTwoFactorPending(outcome)) {
        pending2FA.value = { tempToken: outcome.tempToken };
        return;
      }
      setUserFromLogin(outcome.user);
      router.push(resolveLandingPage());
    } finally {
      loginLoading.value = false;
    }
  }

  async function verify2FA(code: string): Promise<void> {
    if (!pending2FA.value) return;
    verify2FALoading.value = true;
    try {
      const result = await connectionVerify2FA(pending2FA.value.tempToken, code);
      setUserFromLogin(result.user);
      pending2FA.value = null;
      router.push(resolveLandingPage());
    } finally {
      verify2FALoading.value = false;
    }
  }

  function cancel2FA(): void {
    pending2FA.value = null;
  }

  async function logout(): Promise<void> {
    logoutLoading.value = true;
    try {
      await logoutCurrent();
    } finally {
      user.value = null;
      pending2FA.value = null;
      logoutLoading.value = false;
      resetCuiBus();
      const exit = proxyLogoutUrl();
      if (exit) window.location.assign(exit);
      else router.push('/');
    }
  }

  async function updateUser(userData?: PatchUserInput, formData?: FormData): Promise<void> {
    if (!user.value) return;

    if (userData) {
      await patchUserFn({ username: user.value.username, userData });
    }

    if (formData) {
      await patchUserFn(
        { username: user.value.username, userData: formData },
        {
          onSuccess: () => {
            const uploadData = formData.get('upload') as unknown as File | null;
            if (uploadData && user.value) {
              const ext = uploadData.type.split('/').pop();
              user.value.avatar = `${user.value._id}_avatar.${ext}`;
            }
          },
        },
      );
    }
  }

  // another tab can sit on another instance, its user must not replace the one of this tab
  useEventListener(window, 'storage', (event) => {
    if (event.key !== storageKey) return;
    const next = readUser(event.newValue);
    if (!next || !user.value || next._id === user.value._id) user.value = next;
  });

  // local teardown only, revoking again here would log every tab out in a cascade
  watch(user, (next, prev) => {
    if (loginLoading.value || logoutLoading.value) return;
    if (next === null && prev !== null) {
      pending2FA.value = null;
      resetCuiBus();
      if (!connection.isNeedsAuth.value) {
        connection.reset();
        connection.boot('default');
      }
      router.push('/');
    }
  });

  watch(
    () => connection.isNeedsAuth.value,
    (needsAuth) => {
      if (needsAuth && user.value !== null) {
        user.value = null;
      }
    },
  );

  return {
    user,
    isLoggedIn,
    requires2FA,
    pending2FA,
    loginLoading: totalLoginLoading,
    login,
    logout,
    verify2FA,
    cancel2FA,
    updateUser,
    setUserFromLogin,
    refreshUser,
  };
});
