import { setFullscreenRoot } from '@camera.ui/browser';
import { Logger } from '@camera.ui/logger';
import { createApp, shallowReactive, shallowRef } from 'vue';

import { bridgeConnectionToQueryOnline, installApiErrorHandling } from '@/api/index.js';
import { setAppRootElement } from '@/common/appRoot.js';
import { setFetchAuthorizer } from '@/connection/fetchAuth.js';
import { bootConnectionInstance } from '@/connection/instance.js';
import { buildHaMode, haProxyPath, haTarget } from '@/connection/modes/ha.js';
import { registerEcosystemPlugins } from '@/plugins/cameraui.js';
import { registerUiPlugins } from '@/plugins/index.js';
import { useAuthStore } from '@/stores/auth.js';
import { useLocaleStore } from '@/stores/locale.js';
import { useThemeStore } from '@/stores/theme.js';
import HaShell from './HaShell.vue';
import { navigate, panelPath } from './nav.js';
import { redirectOverlays } from './portal.js';
import { createHaRouter } from './router.js';
import { ensureDocumentStyles } from './styles.js';

import type { HaHost } from '@/connection/modes/ha.js';
import type { LoginUserData } from '@/connection/types.js';
import type { Component, ShallowRef } from 'vue';
import type { HomeAssistant } from './types.js';

export interface CardMount {
  readonly id: number;
  readonly el: Element;
  readonly component: Component;
  readonly props: Record<string, unknown>;
}

export interface Shell {
  readonly entryId: string;
  readonly hass: ShallowRef<HomeAssistant>;
  readonly mounts: Map<number, CardMount>;
  addMount(el: Element, component: Component, props: Record<string, unknown>): number;
  removeMount(id: number): void;
  registerThemeRoot(el: Element): () => void;
  update(hass: HomeAssistant): void;
}

const log = new Logger('HA');

let shell: Shell | null = null;
let starting: Promise<Shell> | null = null;
let nextMountId = 1;

export function ensureShell(hass: HomeAssistant, entryId: string): Promise<Shell> {
  if (shell) {
    if (shell.entryId !== entryId) log.warn(`cards for entry ${entryId} ignored, this page is bound to ${shell.entryId}`);
    shell.update(hass);
    return Promise.resolve(shell);
  }
  starting ??= start(hass, entryId).then((s) => {
    shell = s;
    return s;
  });
  return starting;
}

function hostFor(hassRef: ShallowRef<HomeAssistant>): HaHost {
  return {
    get auth() {
      return hassRef.value.auth;
    },
    fetchWithAuth: (path, init) => hassRef.value.fetchWithAuth(path, init),
    callWS: (message) => hassRef.value.callWS(message),
  };
}

async function fetchUser(hass: HomeAssistant, entryId: string): Promise<LoginUserData | null> {
  try {
    const res = await hass.fetchWithAuth(`${haProxyPath(entryId)}/api/auth/me`);
    if (!res.ok) return null;
    return (await res.json()) as LoginUserData;
  } catch {
    return null;
  }
}

async function start(hass: HomeAssistant, entryId: string): Promise<Shell> {
  ensureDocumentStyles(entryId);

  const hassRef = shallowRef(hass);
  const mounts = shallowReactive(new Map<number, CardMount>());

  const haHost = hostFor(hassRef);
  const connection = bootConnectionInstance(buildHaMode(haHost, entryId, new Logger('Connection')));
  setFetchAuthorizer(async () => {
    if (haHost.auth.expired) await haHost.auth.refreshAccessToken();
    return { Authorization: `Bearer ${haHost.auth.data.access_token}` };
  });
  installApiErrorHandling();

  const host = document.createElement('div');
  host.className = 'cui-ha';
  host.style.cssText = 'position:fixed;inset:0;z-index:1000;pointer-events:none;overflow:visible;background:transparent';
  const themeRoot = document.createElement('div');
  themeRoot.style.cssText = 'position:relative;width:100%;height:100%;pointer-events:none;background:transparent';
  host.append(themeRoot);
  document.body.append(host);
  const clickable = document.createElement('style');
  clickable.textContent = '.cui-ha > div > * { pointer-events: auto; }';
  host.append(clickable);
  redirectOverlays(themeRoot);
  setAppRootElement(themeRoot);
  setFullscreenRoot(themeRoot);

  const app = createApp(HaShell, { mounts });
  app.config.errorHandler = (err, _instance, info) => log.error(`[${info}]`, err);
  registerUiPlugins(app);
  bridgeConnectionToQueryOnline(connection);
  registerEcosystemPlugins(app, connection);
  app.use(
    createHaRouter((path) => {
      const panel = panelPath(hassRef.value, entryId);
      if (panel) navigate(`${panel}${path}`);
    }),
  );
  app.mount(themeRoot);

  const theme = useThemeStore();
  const locale = useLocaleStore();
  theme.registerThemeRoot(themeRoot);
  let language: string | undefined;
  let dark: boolean | undefined;

  function update(next: HomeAssistant): void {
    hassRef.value = next;
    if (next.language && next.language !== language) {
      language = next.language;
      locale.applyHostLanguage(language);
    }
    const nextDark = next.themes?.darkMode ?? false;
    if (nextDark !== dark) {
      dark = nextDark;
      theme.applyHostTheme(dark ? 'dark' : 'light');
    }
  }
  update(hass);

  const user = await fetchUser(hass, entryId);
  if (user) useAuthStore().setUserFromLogin(user);
  await connection.seedAndRetry(haTarget(entryId), 'home');

  return {
    entryId,
    hass: hassRef,
    mounts,
    addMount(el, component, props) {
      const id = nextMountId++;
      mounts.set(id, { id, el, component, props });
      return id;
    },
    removeMount(id) {
      mounts.delete(id);
    },
    registerThemeRoot: (el) => theme.registerThemeRoot(el),
    update,
  };
}
