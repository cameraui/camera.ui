import { isAxiosError } from '@/api/errors.js';
import { apiInfo } from '@/api/routes/api.js';
import { getPluginFn } from '@/api/routes/plugins.js';
import { NVR_PLUGIN_NAME } from '@/common/constants.js';
import { outdatedComponents } from '@/common/serverCompatibility.js';
import { getServerKey, isCapacitor } from '@/connection/index.js';

import type { OutdatedComponent } from '@/common/serverCompatibility.js';

const HINT_ID = 'server-compatibility';
const CHECK_TIMEOUT_MS = 10_000;
const DISMISSED_KEEP = 10;

export function useServerCompatibility(): void {
  const { t } = useI18n();
  const toast = useCuiToast();
  const connection = useConnection();
  const instances = useInstanceStore();
  const { isLoggedIn } = storeToRefs(useAuthStore());
  const dismissed = useLocalStorage<string[]>('cui-compat-dismissed', []);

  const compatible = new Set<string>();
  let shown: string | undefined;
  let generation = 0;

  function describe(outdated: OutdatedComponent): string {
    const key = outdated.component === 'server' ? 'connection.server_outdated' : 'connection.nvr_outdated';
    return t(key, { found: outdated.found, required: outdated.required });
  }

  function remember(signature: string): void {
    dismissed.value = [signature, ...dismissed.value.filter((entry) => entry !== signature)].slice(0, DISMISSED_KEEP);
    toast.dismiss(HINT_ID);
  }

  function hide(): void {
    if (shown) toast.dismiss(HINT_ID);
    shown = undefined;
  }

  async function check(): Promise<void> {
    const endpoint = connection.endpoint.value;
    // every cloud server sits behind the same proxy url
    const server = `${getServerKey() ?? ''}|${endpoint}`;
    if (!endpoint || (!isCapacitor && instances.isHomeActive) || compatible.has(server)) {
      hide();
      return;
    }

    const started = generation;
    const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
    const [serverVersion, nvrPluginVersion] = await Promise.all([
      apiInfo({ signal })
        .then((info) => info.version)
        .catch(() => undefined),
      getPluginFn({ pluginName: NVR_PLUGIN_NAME, signal })
        .then((plugin) => plugin.installedVersion)
        .catch((error: unknown) => (isAxiosError(error) && error.response?.status === 404 ? null : undefined)),
    ]);
    if (started !== generation) return;

    const outdated = outdatedComponents(serverVersion, nvrPluginVersion);
    const signature = outdated.map((entry) => `${entry.component}@${entry.found}<${entry.required}`).join(',');

    if (!signature) {
      hide();
      if (serverVersion && nvrPluginVersion !== undefined) compatible.add(server);
      return;
    }
    if (signature === shown || dismissed.value.includes(signature)) return;

    shown = signature;
    toast.add({
      id: HINT_ID,
      severity: 'warn',
      summary: t('connection.outdated_title'),
      detail: [...outdated.map(describe), t('connection.outdated_hint')].join(' '),
      persistent: true,
      action: { label: t('connection.outdated_dismiss'), onClick: () => remember(signature) },
    });
  }

  watch(
    [isLoggedIn, () => connection.isOnline.value],
    ([loggedIn, online], prev) => {
      const wasReady = prev?.[0] === true && prev?.[1] === true;
      if (loggedIn && online) {
        if (!wasReady) check();
        return;
      }
      generation++;
      if (!loggedIn) compatible.clear();
    },
    { immediate: true },
  );
}
