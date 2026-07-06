import { useLocalStorage } from '@vueuse/core';

import { UsersQuery } from '@/api/routes/users.js';
import { login as connectionLogin, verify2FA as connectionVerify2FA, isTwoFactorPending, logoutCurrent, useConnection } from '@/connection/index.js';

import type { UserLanguage } from '@shared/types';
import type { LoginCredentials, LoginUserData } from '@/connection/index.js';
import type { PatchUserInput } from '@/schemas/users.schema.js';

export interface PersistedUser {
  _id: string;
  username: string;
  email?: string;
  role: string;
  firstLogin?: boolean;
  avatar?: string;
}

export const useAuthStore = defineStore('auth', () => {
  const usersQuery = new UsersQuery();
  const router = useRouter();
  const connection = useConnection();

  const user = useLocalStorage<PersistedUser | null>('user', null, {
    serializer: {
      read: (v) => (v ? (JSON.parse(v) as PersistedUser) : null),
      write: (v) => JSON.stringify(v),
    },
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
      email: data.email,
      role: data.role,
      firstLogin: data.firstLogin,
      avatar: data.avatar,
    };

    if (data.language) {
      useLocaleStore().applyServerLanguage(data.language as UserLanguage);
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
      router.push('/home');
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
      router.push('/home');
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
      router.push('/');
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

  // External user → null (e.g. cross-tab logout via localStorage) triggers
  // local logout. Identity changes (different user) are NOT handled here —
  // instance switching is a legitimate identity change; spurious tokens would
  // hit 401 → needs-auth on the next request anyway.
  //
  // LOCAL teardown only, no API logout: the initiating tab already revoked
  // the session server-side. Revoking again from here would destroy FRESH
  // tokens when the trigger was a spurious needs-auth in another tab
  // (refresh-rotation race) — logging every tab out in a cascade.
  watch(user, (next, prev) => {
    if (loginLoading.value || logoutLoading.value) return;
    if (next === null && prev !== null) {
      pending2FA.value = null;
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
  };
});
