import { resetClientState } from '@camera.ui/browser';
import { clearEventDataCache, resetEventStore } from '@camera.ui/nvr';
import { localAccessExpiry } from '@camera.ui/transport';

import { createInstanceFn, deleteInstanceFn, getInstancesFn, isRequires2fa, loginToRemoteFn, toggleFavoriteFn, updateInstanceFn } from '@/api/routes/instances.js';
import InstanceTwoFactorPrompt from '@/components/CuiDialog/templates/InstanceTwoFactorPrompt/InstanceTwoFactorPrompt.vue';
import { createStorageAdapter } from '@/connection/adapters/storage.js';
import { getServerKey } from '@/connection/cloudHandoff.js';
import { getConnection, instanceOverride } from '@/connection/instance.js';
import { isCapacitor } from '@/connection/runtime.js';
import { i18n } from '@/i18n/index.js';
import router, { resolveLandingPage } from '@/router/index.js';

import type { CreateInstancePayload, UpdateInstancePayload } from '@/api/routes/instances.js';
import type { InstanceEntry, InstanceTokenEntry, InstanceTokens, RedirectInfo } from '@/components/CuiInstanceSwitcher/types.js';
import type { Endpoint, Tokens } from '@camera.ui/transport';
import type { DBInstance, UserData } from '@shared/types';

const SWITCH_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 5_000;
const HOME_SLOT = '__home__';
const ACTIVE_KEY = 'activeInstanceId';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const SLOT_SECRET_PREFIX = 'instanceTokens.';

const log = useLogger('Instances');
const slotSecrets = isCapacitor ? createStorageAdapter() : null;

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

function withLocalExpiry(data: UserData): UserData {
  return { ...data, access_token_expires_at: localAccessExpiry(data.access_token, data.access_token_expires_at) ?? data.access_token_expires_at };
}

function serializeUserData(tokens: Tokens, user?: { _id: string; username: string; role: string; firstLogin?: boolean; avatar?: string }): UserData {
  return {
    _id: user?._id ?? '',
    username: user?.username ?? '',
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

function homeSlotKey(): string {
  const serverId = getServerKey();
  return serverId ? `${HOME_SLOT}:${serverId}` : HOME_SLOT;
}

function activeStorageKey(): string {
  const serverId = getServerKey();
  if (!serverId) return ACTIVE_KEY;

  const key = `${ACTIVE_KEY}:${serverId}`;
  // moved, not copied: a copy would send every other server to this remote too
  const shared = localStorage.getItem(ACTIVE_KEY);
  if (shared !== null) {
    localStorage.setItem(key, shared);
    localStorage.removeItem(ACTIVE_KEY);
  }
  return key;
}

export const useInstanceStore = defineStore('instances', () => {
  const authStore = useAuthStore();
  const toast = useCuiToast();
  const dialog = useCuiDialog();
  const queryClient = useQueryClient();
  const { t } = i18n.global;

  const instanceTokens = useLocalStorage<InstanceTokens>('instanceTokens', {});
  // per tab, another tab keeps its own connection when this one switches
  const activeId = useLocalStorage<string | null>(activeStorageKey(), null, { listenToStorageChanges: false });
  const homeSlot = homeSlotKey();

  const isSwitching = ref(false);
  const switchTargetName = ref<string | null>(null);
  const switchKey = ref(0);
  let _switchGeneration = 0;
  const slotTokenCache = new Map<string, Tokens>();

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
    const slot = instanceTokens.value[homeSlot];
    // with a remote instance active the live target is that remote, so home comes from the saved slot
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
    if (activeId.value === null) return homeEntry();

    const remote = instances.value.find((i) => i.id === activeId.value);
    if (remote) return remote;

    // on a remote the list is its own, which does not contain it
    const slot = instanceTokens.value[activeId.value];
    return slot?.name ? { ...homeEntry(), ...slot, id: activeId.value, isHome: false } : homeEntry();
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
    forgetSlotSecret(id);
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
    const slot = activeId.value ?? homeSlot;
    writeSlot(slot, {
      userData: serializeUserData(target.tokens, authStore.user ?? undefined),
      lastConnectedAt: Date.now(),
      url: target.endpoint.url,
    });
    log.debug('[save-tokens]', `slot=${slot} url=${target.endpoint.url}`);
  }

  function writeSlot(slot: string, entry: InstanceTokenEntry): void {
    instanceTokens.value[slot] = { ...instanceTokens.value[slot], ...entry };
    if (!slotSecrets) return;
    if (!entry.userData?.access_token) {
      forgetSlotSecret(slot);
      return;
    }
    const access = entry.userData.access_token;
    const tokens = tokensFromUserData(entry.userData);
    slotTokenCache.set(slot, tokens);
    // blank the plain copy only once secure storage has it, a failed write keeps the slot usable
    Promise.resolve(slotSecrets.set(SLOT_SECRET_PREFIX + slot, JSON.stringify(tokens)))
      .then(() => {
        const current = instanceTokens.value[slot];
        if (!current?.userData || current.userData.access_token !== access) return;
        instanceTokens.value[slot] = { ...current, userData: { ...current.userData, access_token: '', refresh_token: '' } };
      })
      .catch((err) => log.warn('[slot-secret]', `write failed slot=${slot}`, err));
  }

  function forgetSlotSecret(slot: string): void {
    slotTokenCache.delete(slot);
    if (!slotSecrets) return;
    Promise.resolve(slotSecrets.del(SLOT_SECRET_PREFIX + slot)).catch((err) => log.warn('[slot-secret]', `delete failed slot=${slot}`, err));
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
      // the backend may reach a LAN url the browser cannot, check before disconnecting
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

      let freshUserData: UserData | null = null;
      if (targetId !== null && target.hasCredentials) {
        try {
          let result = await loginToRemoteFn(targetId);

          if (isRequires2fa(result)) {
            // release the switching overlay so the code dialog shows
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
            freshUserData = withLocalExpiry(result);
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

      saveCurrentTokens();

      const slot = targetId ?? homeSlot;
      const tokens = freshUserData ? tokensFromUserData(freshUserData) : await slotTokens(slot);
      log.debug('[switch]', `tokens source: ${freshUserData ? 'fresh' : tokens ? 'cached' : 'none'} (slot=${slot})`);

      if (targetId !== null && needsUrlHandoff(target.url)) {
        log.debug('[switch]', 'URL handoff required — leaving SPA');
        await urlHandoff(target, freshUserData);
        return;
      }

      // RESET clears the caches, otherwise the next server reuses old NATS subscriptions for a few ms
      const connection = getConnection();
      connection.reset();
      log.debug('[switch]', 'kernel RESET');
      resetClientState();
      resetEventStore();
      clearEventDataCache();

      // query keys don't include the instance, the remounted views would get the old data
      queryClient.clear();
      log.debug('[switch]', 'vue-query cleared');

      activeId.value = targetId;
      instanceOverride.value = targetId === null ? null : target.url;
      log.debug('[switch]', `activeId=${targetId} instanceOverride=${instanceOverride.value ?? 'null'}`);

      if (targetId !== null) {
        const entry = instanceTokens.value[targetId];
        instanceTokens.value[targetId] = { userData: entry?.userData ?? null, lastConnectedAt: entry?.lastConnectedAt ?? null, name: target.name, url: target.url };
      }

      if (tokens && freshUserData) {
        writeSlot(slot, {
          userData: freshUserData,
          lastConnectedAt: Date.now(),
          url: target.url,
        });
      }

      const knownUser = freshUserData ?? instanceTokens.value[slot]?.userData;
      if (tokens && knownUser?.username) {
        authStore.user = {
          _id: knownUser._id,
          username: knownUser.username,
          role: knownUser.role,
          firstLogin: knownUser.firstLogin,
          avatar: knownUser.avatar,
        };
      }

      if (tokens) {
        const endpoint: Endpoint = { url: target.url, mode: 'direct-lan', priority: 0 };
        log.debug('[switch]', `seedAndRetry → ${endpoint.url}`);
        await Promise.race([
          connection.seedAndRetry({ endpoint, tokens }, targetId ?? 'home'),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('switch_timeout')), SWITCH_TIMEOUT_MS)),
        ]);
      } else {
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

      // no fetchInstances here, App.vue runs it once online, earlier it races the probe
      switchKey.value++;
      const landing = resolveLandingPage();
      log.debug('[switch]', `DONE gen=${generation} → ${landing}`);
      router.push(landing);
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

  async function leaveRemote(): Promise<void> {
    if (activeId.value !== null) await switchInstance(null);
  }

  async function slotTokens(slot: string): Promise<Tokens | null> {
    const entry = instanceTokens.value[slot];
    if (entry?.userData?.access_token) return tokensFromUserData(entry.userData);
    if (!slotSecrets || !entry) return null;
    const cached = slotTokenCache.get(slot);
    if (cached) return cached;
    try {
      const raw = await slotSecrets.get(SLOT_SECRET_PREFIX + slot);
      const tokens = raw ? (JSON.parse(raw) as Tokens) : null;
      if (!tokens?.access) return null;
      slotTokenCache.set(slot, tokens);
      return tokens;
    } catch (err) {
      log.warn('[slot-secret]', `read failed slot=${slot}`, err);
      return null;
    }
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

  async function adoptSharedHomeSlot(): Promise<void> {
    const shared = instanceTokens.value[HOME_SLOT];
    if (homeSlot === HOME_SLOT || !shared) return;

    // the old shared slot belongs to the server the app ran on last, the one opening now
    const tokens = await slotTokens(HOME_SLOT);
    if (tokens && !instanceTokens.value[homeSlot]) {
      writeSlot(homeSlot, { ...shared, userData: serializeUserData(tokens, shared.userData ?? undefined) });
    }
    delete instanceTokens.value[HOME_SLOT];
    forgetSlotSecret(HOME_SLOT);
  }

  function reset(): void {
    for (const slot of Object.keys(instanceTokens.value)) forgetSlotSecret(slot);
    instanceTokens.value = {};
    activeId.value = null;
    instanceOverride.value = null;
    redirectInfo.value = null;
    serverInstances.value = [];
    serverHomeId.value = null;
    log.debug('[reset]', 'store cleared');
  }

  if (slotSecrets) {
    for (const [slot, entry] of Object.entries(instanceTokens.value)) {
      if (entry.userData?.access_token) writeSlot(slot, entry);
    }
  }

  adoptSharedHomeSlot();

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
    leaveRemote,
    probeInstance,
    complete2FALogin,
    reset,
    saveCurrentTokens,
    restoreActiveOverride,
  };
});
