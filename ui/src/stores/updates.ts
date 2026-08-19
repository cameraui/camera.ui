import { installPluginFn } from '@/api/routes/plugins.js';
import { restartSystemFn, updateServerFn } from '@/api/routes/server.js';
import { cancelUpdates, checkUpdates, getUpdatesStatus, runUpdates } from '@/api/routes/updates.js';
import { updateWorker } from '@/api/routes/workers.js';

import type { UpdatesActivityItem, UpdatesStatus } from '@shared/types';

export type UpdateKind = 'server' | 'plugin' | 'worker';
export type UpdateItemStatus = 'pending' | 'updating' | 'restarting' | 'success' | 'error' | 'uptodate' | 'blocked';
export type UpdateBlockedReason = 'desktop' | 'legacy';

export interface UpdateItem {
  id: string;
  kind: UpdateKind;
  name: string;
  packageName?: string;
  installedVersion?: string;
  latestVersion?: string;
  status: UpdateItemStatus;
  blockedReason?: UpdateBlockedReason;
  error?: string;
}

const STATUS_POLL_MS = 30_000;

export const useUpdatesStore = defineStore('updates', () => {
  const toast = useCuiToast();
  const updatesSocket = useUpdatesSocket();
  const { beginServerRestart } = useServerRestart();

  const status = shallowRef<UpdatesStatus | null>(null);
  const isChecking = ref(false);
  const checkedAt = ref<number>(Date.now());
  const connected = ref(false);

  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let fetchInflight: Promise<void> | null = null;

  const activity = computed(() => {
    const map = new Map<string, UpdatesActivityItem>();
    for (const item of status.value?.run?.active ? status.value.run.items : (status.value?.lastRun?.items ?? [])) {
      map.set(item.id, item);
    }
    for (const item of status.value?.manual ?? []) {
      map.set(item.id, item);
    }
    return map;
  });

  const items = computed<UpdateItem[]>(() => {
    const pending = status.value?.pending;
    if (!pending) return [];

    const rows: UpdateItem[] = [];

    rows.push(
      applyActivity({
        id: 'server',
        kind: 'server',
        name: 'camera.ui',
        installedVersion: pending.server.installedVersion,
        latestVersion: pending.server.latestVersion ?? pending.server.installedVersion,
        status: pending.server.updateAvailable ? (pending.server.blockedReason ? 'blocked' : 'pending') : 'uptodate',
        blockedReason: pending.server.updateAvailable ? pending.server.blockedReason : undefined,
      }),
    );

    for (const plugin of pending.plugins) {
      rows.push(
        applyActivity({
          id: `plugin:${plugin.pluginName}`,
          kind: 'plugin',
          name: plugin.displayName || plugin.pluginName,
          packageName: plugin.pluginName,
          installedVersion: plugin.installedVersion,
          latestVersion: plugin.latestVersion ?? plugin.installedVersion,
          status: plugin.updateAvailable ? 'pending' : 'uptodate',
        }),
      );
    }

    for (const worker of pending.workers) {
      rows.push(
        applyActivity({
          id: `worker:${worker.agentId}`,
          kind: 'worker',
          name: worker.name,
          installedVersion: worker.installedVersion,
          latestVersion: pending.targetServerVersion,
          status: worker.updateAvailable ? (worker.updatable ? 'pending' : 'blocked') : 'uptodate',
          blockedReason: worker.updateAvailable && !worker.updatable ? worker.blockedReason : undefined,
        }),
      );
    }

    return rows;
  });

  const runActive = computed(() => status.value?.run?.active === true);
  const cancelRequested = computed(() => status.value?.run?.cancelRequested === true);
  const runFinishedAt = computed(() => status.value?.lastRun?.finishedAt ?? null);
  const runTotal = computed(() => (status.value?.run?.active ? status.value.run.items.length : 0));
  const runDone = computed(() => (status.value?.run?.active ? status.value.run.items.filter((item) => item.status === 'success' || item.status === 'error').length : 0));

  const pendingItems = computed(() => items.value.filter((item) => item.status === 'pending' || item.status === 'error'));
  const pendingCount = computed(() => pendingItems.value.length);
  const failedItems = computed(() => items.value.filter((item) => item.status === 'error'));
  const updatingItems = computed(() => items.value.filter((item) => item.status === 'updating'));
  const updatingItem = computed(() => updatingItems.value[0]);
  const restartingItem = computed(() => items.value.find((item) => item.status === 'restarting'));
  const serverBusy = computed(() => items.value.some((item) => item.kind === 'server' && (item.status === 'updating' || item.status === 'restarting')));
  const targetsBusy = computed(() => updatingItems.value.some((item) => item.kind !== 'server'));
  const busy = computed(() => runActive.value || serverBusy.value || targetsBusy.value);
  const allUpToDate = computed(() => status.value !== null && pendingCount.value === 0 && !busy.value);
  const serverPending = computed(() => items.value.some((item) => item.kind === 'server' && (item.status === 'pending' || item.status === 'error')));
  const targetServerVersion = computed(() => status.value?.pending.targetServerVersion);

  function applyActivity(row: UpdateItem): UpdateItem {
    const active = activity.value.get(row.id);
    if (!active) return row;
    if (active.status === 'success' && row.status === 'uptodate') return row;
    return { ...row, status: active.status as UpdateItemStatus, error: active.error, latestVersion: active.targetVersion ?? row.latestVersion };
  }

  async function fetchStatus(): Promise<void> {
    if (fetchInflight) return fetchInflight;
    fetchInflight = getUpdatesStatus()
      .then((next) => {
        status.value = next;
        checkedAt.value = Date.now();
      })
      .catch(() => {
        // reconnect or the next poll retries
      })
      .finally(() => {
        fetchInflight = null;
      });
    return fetchInflight;
  }

  function connect(): void {
    if (connected.value) return;
    connected.value = true;

    updatesSocket.connect();
    updatesSocket.onStatus(() => {
      fetchStatus();
    });

    fetchStatus();
    pollTimer ??= setInterval(() => fetchStatus(), STATUS_POLL_MS);
  }

  async function refresh(): Promise<void> {
    if (busy.value) return;
    isChecking.value = true;
    try {
      await checkUpdates().catch(() => {});
      await fetchStatus();
    } finally {
      isChecking.value = false;
    }
  }

  async function updateItem(id: string): Promise<void> {
    const item = items.value.find((entry) => entry.id === id);
    if (!item || runActive.value) return;
    if (item.status !== 'pending' && item.status !== 'error') return;

    try {
      if (item.kind === 'plugin') {
        await installPluginFn({ pluginData: { pluginname: item.packageName ?? item.name, pluginversion: item.latestVersion ?? 'latest' } });
      } else if (item.kind === 'worker') {
        await updateWorker({ agentId: id.slice('worker:'.length), version: targetServerVersion.value });
      } else {
        await updateServerFn({ serverData: { version: item.latestVersion ?? 'latest' } });
        beginServerRestart();
        await restartSystemFn();
      }
    } catch (error: any) {
      toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message, life: 5000 });
    } finally {
      fetchStatus();
    }
  }

  async function updateAll(): Promise<void> {
    if (busy.value || pendingCount.value === 0) return;
    try {
      await runUpdates();
    } catch (error: any) {
      toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message, life: 5000 });
    } finally {
      fetchStatus();
    }
  }

  async function cancelRun(): Promise<void> {
    if (!runActive.value) return;
    try {
      await cancelUpdates();
    } catch {
      // status refetch shows the truth
    } finally {
      fetchStatus();
    }
  }

  function itemsOf(kind: UpdateKind): UpdateItem[] {
    return items.value.filter((item) => item.kind === kind);
  }

  onScopeDispose(() => {
    if (pollTimer) clearInterval(pollTimer);
  });

  return {
    status,
    items,
    runActive,
    cancelRequested,
    runFinishedAt,
    isChecking,
    checkedAt,
    runTotal,
    runDone,
    pendingItems,
    pendingCount,
    failedItems,
    updatingItems,
    updatingItem,
    restartingItem,
    serverBusy,
    targetsBusy,
    busy,
    allUpToDate,
    serverPending,
    targetServerVersion,
    connect,
    refresh,
    updateItem,
    updateAll,
    cancelRun,
    itemsOf,
  };
});
