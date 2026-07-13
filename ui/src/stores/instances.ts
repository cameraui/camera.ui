import { resetClientState } from '@camera.ui/browser';
import { clearEventDataCache, resetEventStore } from '@camera.ui/nvr';

import { createInstanceFn, deleteInstanceFn, getInstancesFn, isRequires2fa, loginToRemoteFn, toggleFavoriteFn, updateInstanceFn } from '@/api/routes/instances.js';
import InstanceTwoFactorPrompt from '@/components/CuiDialog/templates/InstanceTwoFactorPrompt/InstanceTwoFactorPrompt.vue';
import { getConnection, instanceOverride } from '@/connection/instance.js';
import { i18n } from '@/i18n/index.js';

import type { CreateInstancePayload, UpdateInstancePayload } from '@/api/routes/instances.js';
import type { InstanceEntry, InstanceTokens, RedirectInfo } from '@/components/CuiInstanceSwitcher/types.js';
import type { Endpoint, Tokens } from '@camera.ui/transport';
import type { DBInstance, UserData } from '@shared/types';

const SWITCH_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const HOME_SLOT = '__home__';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const log = useLogger('Instances');

async function probeInstanceReachability(url: string, externalSignal?: AbortSignal): Promise<boolean> {
  try {
    const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
    const signal = externalSignal ? AbortSignal.any([timeout, externalSignal]) : timeout;
    const response = await fetch(`${url}/api/health`, { signal });
    log.debug('[probe]', `${url} → ${response.ok ? 'OK' : `HTTP ${response.status}`}`);
    return response.ok;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug('[probe]', `${url} → FAIL`, msg);
    return false;
  }
}

function tokensFromUserData(data: UserData): Tokens {
  return {
    access: data.access_token,
    accessExpiresAt: data.access_token_expires_at,
    refresh: data.refresh_token,
    refreshExpiresAt: data.refresh_token_expires_at,
  };
}

function serializeUserData(tokens: Tokens, user?: { _id: string; username: string; email?: string; role: string; firstLogin?: boolean; avatar?: string }): UserData {
  return {
    _id: user?._id ?? '',
    username: user?.username ?? '',
    email: user?.email,
    role: user?.role ?? '',
    firstLogin: user?.firstLogin,
    avatar: user?.avatar,
    language: 'auto',
    access_token: tokens.access,
    refresh_token: tokens.refresh ?? '',
    token_type: 'Bearer',
    access_token_expires_at: tokens.accessExpiresAt ?? 0,
    refresh_token_expires_at: tokens.refreshExpiresAt ?? 0,
    internalAddresses: [],
    externalAddresses: [],
  } as UserData;
}

export const useInstanceStore = defineStore('instances', () => {
  const authStore = useAuthStore();
  const router = useRouter();
  const toast = useCuiToast();
  const dialog = useCuiDialog();
  const queryClient = useQueryClient();
  const { t } = i18n.global;

  const instanceTokens = useLocalStorage<InstanceTokens>('instanceTokens', {});
  const activeId = useLocalStorage<string | null>('activeInstanceId', null);

  const isSwitching = ref(false);
  const switchTargetName = ref<string | null>(null);
  const switchKey = ref(0);
  let _switchGeneration = 0;

  const serverHomeId = ref<string | null>(null);
  const serverInstances = ref<DBInstance[]>([]);

  const redirectInfo = useSessionStorage<RedirectInfo | null>('redirectInfo', null, {
    serializer: {
      read: (v) => (v ? (JSON.parse(v) as RedirectInfo) : null),
      write: (v) => JSON.stringify(v),
    },
  });

  const isHomeActive = computed(() => activeId.value === null);
  const activeUrl = computed<string | null>(() => {
    if (activeId.value === null) return null;
    const si = serverInstances.value.find((s) => s.id === activeId.value);
    return si?.url ?? null;
  });

  async function fetchInstances(): Promise<void> {
    try {
      if (!hasPermission(undefined, 'admin')) return;
      const response = await getInstancesFn();
      serverInstances.value = response.instances;
      serverHomeId.value = response.homeId;
      log.debug('[fetch]', `loaded ${response.instances.length} instances`, { homeId: response.homeId });
    } catch (err) {
      log.warn('[fetch]', 'failed', err);
    }
  }

  const instances = computed<InstanceEntry[]>(() => {
    const ownHomeId = serverHomeId.value;
    return serverInstances.value
      .filter((si) => !(ownHomeId && si.remoteHomeId && si.remoteHomeId === ownHomeId))
      .map((si) => {
        const tokenEntry = instanceTokens.value[si.id];
        return {
          id: si.id,
          name: si.name,
          url: si.url,
          hasCredentials: !!si.credentials,
          favorite: si.favorite ?? true,
          userData: tokenEntry?.userData ?? null,
          lastConnectedAt: tokenEntry?.lastConnectedAt ?? null,
          isHome: false,
        };
      });
  });

  function homeEntry(): InstanceEntry {
    const slot = instanceTokens.value[HOME_SLOT];
    // Only the live kernel target counts as "current home URL" when activeId
    // is null — we ARE on home then. With a remote instance active, the live
    // target is that remote, NOT home, so we MUST fall back to the saved
    // __home__ slot URL (populated by `saveCurrentTokens` whenever we were
    // last on home) and only then to window.location.origin.
    const url = activeId.value === null ? (getConnection().target.value?.endpoint.url ?? slot?.url ?? window.location.origin) : (slot?.url ?? window.location.origin);
    return {
      id: 'home',
      name: t('navigation.home'),
      url,
      hasCredentials: false,
      favorite: false,
      userData: slot?.userData ?? null,
      lastConnectedAt: slot?.lastConnectedAt ?? null,
      isHome: true,
    };
  }

  const activeInstance = computed<InstanceEntry>(() => {
    if (activeId.value !== null) {
      const remote = instances.value.find((i) => i.id === activeId.value);
      if (remote) return remote;
    }
    return homeEntry();
  });

  const favoriteInstances = computed<InstanceEntry[]>(() => instances.value.filter((i) => i.favorite));
  const isMultiInstance = computed(() => favoriteInstances.value.length > 0 || activeId.value !== null || redirectInfo.value !== null);

  function isFavorite(id: string): boolean {
    const si = serverInstances.value.find((s) => s.id === id);
    return si?.favorite ?? true;
  }

  async function toggleFavorite(id: string): Promise<void> {
    const { favorite } = await toggleFavoriteFn(id);
    const si = serverInstances.value.find((s) => s.id === id);
    if (si) si.favorite = favorite;
  }

  async function addInstance(payload: CreateInstancePayload): Promise<DBInstance> {
    const created = await createInstanceFn(payload);
    serverInstances.value = [...serverInstances.value, created];
    return created;
  }

  async function removeInstance(id: string): Promise<void> {
    await deleteInstanceFn(id);
    serverInstances.value = serverInstances.value.filter((si) => si.id !== id);
    delete instanceTokens.value[id];
  }

  async function updateInstance(id: string, payload: UpdateInstancePayload): Promise<void> {
    const updated = await updateInstanceFn({ id, data: payload });
    const index = serverInstances.value.findIndex((si) => si.id === id);
    if (index !== -1) serverInstances.value[index] = updated;
  }

  async function probeInstance(id: string, signal?: AbortSignal): Promise<boolean> {
    const inst = serverInstances.value.find((s) => s.id === id);
    if (!inst) return false;
    return probeInstanceReachability(inst.url, signal);
  }

  function saveCurrentTokens(): void {
    const target = getConnection().target.value;
    if (!target?.tokens.access) {
      log.debug('[save-tokens]', 'skipped — no live access token');
      return;
    }
    const slot = activeId.value ?? HOME_SLOT;
    instanceTokens.value[slot] = {
      userData: serializeUserData(target.tokens, authStore.user ?? undefined),
      lastConnectedAt: Date.now(),
      url: target.endpoint.url,
    };
    log.debug('[save-tokens]', `slot=${slot} url=${target.endpoint.url}`);
  }

  function restoreActiveOverride(): void {
    if (activeId.value === null) {
      instanceOverride.value = null;
      log.debug('[restore-override]', 'no active instance — home target');
      return;
    }
    const slot = instanceTokens.value[activeId.value];
    const url = slot?.url ?? slot?.userData?.internalAddresses?.[0] ?? slot?.userData?.externalAddresses?.[0] ?? null;
    instanceOverride.value = url;
    log.debug('[restore-override]', `activeId=${activeId.value} → ${url ?? 'no cached url'}`);
  }

  async function switchInstance(targetId: string | null): Promise<void> {
    if (isSwitching.value) {
      log.warn('[switch]', 'ignored — another switch is already in progress');
      return;
    }

    const target: InstanceEntry = targetId === null ? homeEntry() : (instances.value.find((i) => i.id === targetId) ?? homeEntry());
    if (targetId !== null && needsUrlHandoff(target.url)) {
      const confirmed = await confirmInsecureHandoff(target.name);
      if (!confirmed) {
        log.debug('[switch]', 'URL handoff declined by user');
        return;
      }
    }

    const generation = ++_switchGeneration;
    isSwitching.value = true;
    switchTargetName.value = target.name;

    log.debug('[switch]', `START targetId=${targetId ?? 'home'} gen=${generation}`);
    log.debug('[switch]', `target resolved — name="${target.name}" url=${target.url} hasCreds=${target.hasCredentials}`);

    try {
      // 1. Browser-side reachability probe — backend may reach a LAN URL the
      //    browser cannot. Without this we'd disconnect from current and hang.
      if (targetId !== null) {
        const reachable = await probeInstanceReachability(target.url);
        if (generation !== _switchGeneration) {
          log.debug('[switch]', `aborted after probe — newer gen=${_switchGeneration}`);
          return;
        }
        if (!reachable) {
          log.warn('[switch]', `target unreachable — ${target.url}`);
          toast.add({ severity: 'warn', detail: t('instances.unreachable', { name: target.name }), life: 3000 });
          return;
        }
      }

      // 2. Get fresh tokens from the server-side relay if possible.
      let freshUserData: UserData | null = null;
      if (targetId !== null && target.hasCredentials) {
        try {
          let result = await loginToRemoteFn(targetId);

          if (isRequires2fa(result)) {
            // Release the switching overlay so the code dialog is visible.
            log.debug('[switch]', 'remote requires 2FA — prompting for code');
            isSwitching.value = false;
            const userData = await run2FALogin(targetId, target.name);
            if (generation !== _switchGeneration) return;
            isSwitching.value = true;

            if (!userData) {
              log.debug('[switch]', '2FA prompt cancelled — aborting switch');
              return;
            }
            result = userData;
          }

          if (!isRequires2fa(result)) {
            freshUserData = result;
            log.debug('[switch]', 'backend relay login OK');
          }
        } catch (err) {
          log.warn('[switch]', 'backend relay login FAILED — will try cached tokens', err);
        }
      }
      if (generation !== _switchGeneration) {
        log.debug('[switch]', `aborted after relay-login — newer gen=${_switchGeneration}`);
        return;
      }

      // 3. Snapshot current connection's tokens before tearing it down.
      saveCurrentTokens();

      // 4. Resolve final tokens (fresh > cached).
      const slot = targetId ?? HOME_SLOT;
      const tokens = freshUserData ? tokensFromUserData(freshUserData) : slotTokens(slot);
      log.debug('[switch]', `tokens source: ${freshUserData ? 'fresh' : tokens ? 'cached' : 'none'} (slot=${slot})`);

      // 5. Mixed-content + cross-localhost cases need a full-page URL handoff.
      if (targetId !== null && needsUrlHandoff(target.url)) {
        log.debug('[switch]', 'URL handoff required — leaving SPA');
        await urlHandoff(target, freshUserData);
        return;
      }

      // 6. Disconnect kernel — RESET clears persistence + browser/nvr caches
      //    via plugin subscribers. Without it, switching to a different
      //    server reuses old NATS subscriptions for a few ms.
      const connection = getConnection();
      connection.reset();
      log.debug('[switch]', 'kernel RESET');
      resetClientState();
      resetEventStore();
      clearEventDataCache();

      // Drop every vue-query cache entry. Without this, the new instance's
      // route components remount (via `switchKey`) but `useQuery` hands them
      // back the previous instance's cached data (queryKey doesn't include
      // the instance, and `staleTime: 10s` defers a refetch).
      queryClient.clear();
      log.debug('[switch]', 'vue-query cleared');

      activeId.value = targetId;
      instanceOverride.value = targetId === null ? null : target.url;
      log.debug('[switch]', `activeId=${targetId} instanceOverride=${instanceOverride.value ?? 'null'}`);

      // 7. Cache the resolved tokens + user identity.
      if (tokens && freshUserData) {
        instanceTokens.value[slot] = {
          userData: freshUserData,
          lastConnectedAt: Date.now(),
          url: target.url,
        };
        authStore.user = {
          _id: freshUserData._id,
          username: freshUserData.username,
          role: freshUserData.role,
          firstLogin: freshUserData.firstLogin,
          avatar: freshUserData.avatar,
        };
      }

      // 8. Seed the kernel and let the probe loop drive online.
      if (tokens) {
        const endpoint: Endpoint = { url: target.url, mode: 'direct-lan', priority: 0 };
        log.debug('[switch]', `seedAndRetry → ${endpoint.url}`);
        await Promise.race([
          connection.seedAndRetry({ endpoint, tokens }, targetId ?? 'home'),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('switch_timeout')), SWITCH_TIMEOUT_MS)),
        ]);
      } else {
        // No tokens — kernel goes offline + needs-auth, login form shows.
        log.warn('[switch]', 'no tokens — boot + route to login');
        connection.boot(targetId ?? 'home');
        authStore.user = null;
        router.push('/');
        return;
      }

      if (generation !== _switchGeneration) {
        log.debug('[switch]', `aborted after seedAndRetry — newer gen=${_switchGeneration}`);
        return;
      }

      // 9. Bump key so route components fully remount with new context.
      // `fetchInstances` is NOT called here — App.vue's `[isLoggedIn, isOnline]`
      // watcher fires it once the kernel reaches online with the new target.
      // Calling here would race the probe (transport still has no target during
      // `discovering`) and produce a spurious "no target" cancellation.
      switchKey.value++;
      log.debug('[switch]', `DONE gen=${generation} → /home`);
      router.push('/home');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'switch_timeout') {
        log.error('[switch]', `TIMEOUT after ${SWITCH_TIMEOUT_MS}ms`);
        toast.add({ severity: 'error', detail: t('instances.switch_timeout', { name: switchTargetName.value ?? '' }), life: 3000 });
      } else {
        log.error('[switch]', 'failed', err);
        toast.add({ severity: 'error', detail: err, life: 3000 });
      }
    } finally {
      if (generation === _switchGeneration) {
        isSwitching.value = false;
        switchTargetName.value = null;
      }
    }
  }

  function slotTokens(slot: string): Tokens | null {
    const entry = instanceTokens.value[slot];
    if (!entry?.userData?.access_token) return null;
    return tokensFromUserData(entry.userData);
  }

  function needsUrlHandoff(url: string): boolean {
    try {
      const targetUrl = new URL(url);
      const currentUrl = new URL(window.location.origin);
      const isMixedContent = currentUrl.protocol === 'https:' && targetUrl.protocol === 'http:';
      const isUnreachableLocalhost = LOCALHOST_HOSTS.has(targetUrl.hostname) && !LOCALHOST_HOSTS.has(currentUrl.hostname);
      return isMixedContent || isUnreachableLocalhost;
    } catch {
      return false;
    }
  }

  function prompt2FACode(instanceName: string): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: string | null): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      dialog.openComponentDialog(InstanceTwoFactorPrompt, {
        data: {
          title: t('instances.two_factor_title'),
          confirmText: t('views.login.2fa_verify'),
          contentProps: { instanceName },
        },
        onConfirm: async (code: string | null) => settle(code ?? null),
        onCancel: async () => settle(null),
      });
    });
  }

  // Re-prompts on a wrong code until the user cancels; null = cancelled.
  async function run2FALogin(id: string, name: string): Promise<UserData | null> {
    for (;;) {
      const code = await prompt2FACode(name);
      if (!code) return null;

      try {
        const result = await loginToRemoteFn(id, code);
        if (!isRequires2fa(result)) return result;
      } catch (err) {
        log.warn('[2fa]', 'verification failed', err);
        toast.add({ severity: 'error', detail: t('instances.two_factor_failed'), life: 3000 });
      }
    }
  }

  async function complete2FALogin(id: string, name: string): Promise<boolean> {
    const userData = await run2FALogin(id, name);
    if (!userData) return false;

    toast.add({ severity: 'success', detail: t('instances.two_factor_completed', { name }), life: 3000 });
    // The server cleared the instance's pending flag — refresh so the UI drops it.
    await fetchInstances().catch(() => {});
    return true;
  }

  function confirmInsecureHandoff(name: string): Promise<boolean> {
    log.warn('[switch]', `target "${name}" requires URL handoff — asking user confirmation`);
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      dialog.openTextDialog({
        data: {
          title: t('instances.insecure_handoff_title'),
          confirmText: t('instances.insecure_handoff_confirm'),
          contentText: t('instances.insecure_handoff_message', { name }),
          confirmButtonProps: { severity: 'danger' },
        },
        onConfirm: () => settle(true),
        onCancel: () => settle(false),
      });
    });
  }

  async function urlHandoff(target: InstanceEntry, freshUserData: UserData | null): Promise<void> {
    const payload: Record<string, unknown> = {
      _reset: true,
      _sourceUrl: window.location.origin,
      _instanceName: target.name,
    };
    if (freshUserData) Object.assign(payload, freshUserData);
    const authParam = encodeURIComponent(btoa(JSON.stringify(payload)));
    const baseUrl = target.url.split('#')[0];
    const dest = `${baseUrl}#auth=${authParam}`;
    log.debug('[url-handoff]', `→ ${target.url} (with token=${freshUserData ? 'yes' : 'no'})`);
    window.location.href = dest;
  }

  function reset(): void {
    instanceTokens.value = {};
    activeId.value = null;
    instanceOverride.value = null;
    redirectInfo.value = null;
    serverInstances.value = [];
    serverHomeId.value = null;
    log.debug('[reset]', 'store cleared');
  }

  return {
    instances,
    activeInstance,
    activeId,
    activeUrl,
    isHomeActive,
    isMultiInstance,
    isSwitching: readonly(isSwitching),
    switchTargetName: readonly(switchTargetName),
    switchKey: readonly(switchKey),
    serverHomeId,
    redirectInfo,
    serverInstances,
    instanceTokens,
    favoriteInstances,
    isFavorite,
    toggleFavorite,
    fetchInstances,
    addInstance,
    removeInstance,
    updateInstance,
    switchInstance,
    probeInstance,
    complete2FALogin,
    reset,
    saveCurrentTokens,
    restoreActiveOverride,
  };
});
