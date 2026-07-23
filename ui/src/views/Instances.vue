<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">{{ $t('views.instances.title') }}</h1>

    <CuiTopbarSlot position="left">
      <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="$router.push('/menu')">
        <template #icon>
          <i-weui:back-filled class="w-6 h-6" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <div class="flex gap-2 mb-4">
      <IconField class="flex-1">
        <InputIcon>
          <i-carbon:search class="w-4 h-4" />
        </InputIcon>
        <InputText v-model="searchQuery" :placeholder="t('views.instances.search')" class="w-full" />
      </IconField>
    </div>

    <Transition name="fade-2" mode="out-in">
      <div
        v-if="instancesPending"
        key="loading"
        class="grid w-full gap-2 p-px"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : `${CARD_MIN_WIDTH}px`}, 1fr))`,
        }"
      >
        <Skeleton v-for="i in skeletonCount" :key="i" :height="`${INSTANCE_CARD_HEIGHT}px`" class="cui-card" />
      </div>

      <div
        v-else-if="filteredInstances.length"
        key="content"
        class="grid w-full gap-2 p-px"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : `${CARD_MIN_WIDTH}px`}, 1fr))`,
        }"
      >
        <CuiInstanceCard
          v-for="instance in filteredInstances"
          :key="instance.id"
          :instance="instance"
          :menu-open="menuRef?.isOpen && menuRef?.data?.id === instance.id"
          :selection-mode="selectionMode"
          :selected="selectedIds.has(instance.id)"
          @click="onCardClick(instance)"
          @toggle-favorite="toggleFavorite(instance.id)"
          @open-menu="menuRef?.toggleMenu($event, undefined, instance)"
        />
      </div>

      <div v-else key="empty" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
        <i-bxs:server class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ $t('views.instances.no_instances') }}</span>
      </div>
    </Transition>

    <CuiFloatingButtonGroup :force-visible="selectionMode">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          v-if="allInstances.length > 1"
          grouped
          :tooltip-props="{ value: t('views.instances.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.instances.add') }"
          :button-props="{ class: 'text-white' }"
          :icon="PlusIcon"
          :icon-props="{ width: '30px', height: '30px' }"
          @click="openAddDialog"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelected ? t('views.instances.deselect_all') : t('views.instances.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('views.instances.remove_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy }"
          :icon="TrashOutlineIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkRemove"
        />
      </template>
    </CuiFloatingButtonGroup>

    <CuiMenu
      ref="menuRef"
      :items="menuItems"
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { isEqual } from '@camera.ui/common/utils';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import TrashIcon from '~icons/iconamoon/trash-fill';
import CloseIcon from '~icons/mdi/close';
import TrashOutlineIcon from '~icons/mdi/delete-outline';
import EditIcon from '~icons/mdi/pencil-outline';
import TwoFactorIcon from '~icons/mdi/two-factor-authentication';
import SelectIcon from '~icons/tabler/dots-filled';
import PlusIcon from '~icons/typcn/plus';

import { InstancesQuery } from '@/api/routes/instances.js';
import { useCardSelection } from '@/composables/useCardSelection.js';
import EditInstanceDialog from '@/components/CuiDialog/templates/EditInstanceDialog/EditInstanceDialog.vue';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';

import type { ServerStatus } from '@/api/routes/instances.js';
import type { InstanceInfo } from '@/components/CuiInstanceCard/types.js';
import type { InstanceEntry } from '@/components/CuiInstanceSwitcher/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';

const instancesQuery = new InstancesQuery();

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();
const dialog = useCuiDialog();
const toast = useCuiToast();

const instanceStore = useInstanceStore();

const instancesWithCredentials = computed(() => instanceStore.serverInstances.filter((si) => !!si.credentials));

const { data: instancesData, isPending: instancesPending } = instancesQuery.listQuery();
const { mutateAsync: createInstance } = instancesQuery.createMutation();
const { mutateAsync: updateInstance } = instancesQuery.updateMutation();
const { mutateAsync: deleteInstance } = instancesQuery.deleteMutation();
const { mutateAsync: toggleFavorite } = instancesQuery.toggleFavoriteMutation();
const statusQueries = instancesQuery.statusQueries(instancesWithCredentials);

const INSTANCE_CARD_HEIGHT = 176;
const CARD_MIN_WIDTH = 280;
const REACHABILITY_REFRESH_MS = 15_000;
let _reachabilityAbort: AbortController | undefined;

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const isLoading = ref(false);
const searchQuery = ref('');
const browserReachable = reactive<Record<string, 'checking' | 'online' | 'offline'>>({});

const skeletonCount = computed(() => {
  const cols = smBreakpoint.value ? 1 : Math.max(1, Math.floor(windowWidth.value / CARD_MIN_WIDTH));
  const rows = Math.max(1, Math.ceil(windowHeight.value / (INSTANCE_CARD_HEIGHT + 8)));
  return cols * rows;
});

const allInstances = computed(() => {
  let statusIndex = 0;
  return instanceStore.serverInstances.map((si): InstanceInfo => {
    const hasCredentials = !!si.credentials;

    if (!hasCredentials) {
      return {
        id: si.id,
        name: si.name,
        url: si.url,
        status: 'unknown',
        active: si.id === instanceStore.activeId,
        favorite: instanceStore.isFavorite(si.id),
        hasCredentials,
      };
    }

    const query = statusQueries.value[statusIndex++];
    const status: ServerStatus | undefined = query?.data;

    const reachable = browserReachable[si.id];
    let connectionStatus: InstanceInfo['status'] = 'unknown';
    if (reachable === 'online') connectionStatus = 'online';
    else if (reachable === 'offline') connectionStatus = 'offline';

    return {
      id: si.id,
      name: si.name,
      url: si.url,
      status: connectionStatus,
      active: si.id === instanceStore.activeId,
      favorite: instanceStore.isFavorite(si.id),
      hasCredentials,
      pending2fa: !!si.pending2fa,
      version: status?.version,
      lastUpdatedAt: query?.dataUpdatedAt,
      cameras: status?.cameras,
      resources: status
        ? {
            cpuUsage: status.cpuUsage,
            memUsed: status.memUsed,
            memTotal: status.memTotal,
            diskUsed: status.diskUsed,
            diskTotal: status.diskTotal,
          }
        : undefined,
    };
  });
});

const filteredInstances = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return allInstances.value;
  return allInstances.value.filter((i) => i.name.toLowerCase().includes(q) || i.url?.toLowerCase().includes(q));
});

const menuItems = computed<MenuItem[]>(() => [
  {
    label: t('views.instances.two_factor_enter_code'),
    icon: TwoFactorIcon,
    hide: !(menuRef.value?.data as InstanceInfo | undefined)?.pending2fa,
    onClick: (instance: InstanceInfo) => {
      instanceStore.complete2FALogin(instance.id, instance.name);
    },
  },
  {
    label: t('views.settings.edit'),
    icon: EditIcon,
    onClick: (instance: InstanceInfo) => {
      const entry = toInstanceEntry(instance);
      if (entry) openEditDialog(entry);
    },
  },
  {
    label: t('views.settings.remove'),
    icon: TrashIcon,
    iconProps: { class: 'text-red-500' },
    labelProps: { class: 'text-red-500' },
    buttonProps: { severity: 'danger' },
    onClick: (instance: InstanceInfo) => {
      confirmRemove(instance.id);
    },
  },
]);

function refreshReachability(): void {
  _reachabilityAbort?.abort();
  _reachabilityAbort = new AbortController();
  const { signal } = _reachabilityAbort;

  for (const si of instancesWithCredentials.value) {
    if (browserReachable[si.id] === undefined) browserReachable[si.id] = 'checking';
    instanceStore
      .probeInstance(si.id, signal)
      .then((reachable) => {
        if (!signal.aborted) browserReachable[si.id] = reachable ? 'online' : 'offline';
      })
      .catch(() => {
        if (!signal.aborted) browserReachable[si.id] = 'offline';
      });
  }
}

function toInstanceEntry(info: InstanceInfo): InstanceEntry | undefined {
  const si = instanceStore.serverInstances.find((s) => s.id === info.id);
  if (!si) return undefined;
  const tokenEntry = instanceStore.instanceTokens[si.id];
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
}

const { selectionMode, selectedIds, selectedItems, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  filteredInstances,
  (instance) => instance.id,
);

function confirmBulkRemove() {
  if (!selectedItems.value.length || bulkBusy.value) return;
  const ids = selectedItems.value.map((instance) => instance.id);
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.instances.remove_selected_confirm', { count: ids.length }),
      confirmText: t('views.settings.instances.remove'),
      loading: isLoading,
    },
    onConfirm: async () => {
      bulkBusy.value = true;
      isLoading.value = true;
      try {
        await Promise.all(ids.map((id) => deleteInstance(id)));
        exitSelectionMode();
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      } finally {
        bulkBusy.value = false;
        isLoading.value = false;
      }
    },
  });
}

function onCardClick(instance: InstanceInfo) {
  if (selectionMode.value) {
    toggleSelection(instance.id);
    return;
  }
  if (instance.active || instance.status === 'offline') return;
  if (instance.pending2fa) {
    // The instance has no completed session yet — finish the 2FA challenge
    // instead of attempting a switch that would prompt for it anyway.
    instanceStore.complete2FALogin(instance.id, instance.name);
    return;
  }
  if (instance.id === '__home__') {
    instanceStore.switchInstance(null);
  } else {
    instanceStore.switchInstance(instance.id);
  }
}

function openAddDialog() {
  dialog.openComponentDialog<{ currentName: string; hasCredentials: boolean }>(EditInstanceDialog, {
    data: {
      title: t('views.instances.add'),
      confirmText: t('components.form.button.add'),
      contentProps: {
        currentName: '',
        hasCredentials: false,
      },
    },
    onConfirm: async (result: { name: string; url: string; credentials: { username: string; password: string } } | null) => {
      if (!result) return;
      try {
        const created = await createInstance({ name: result.name, url: result.url, credentials: result.credentials });
        if (created.requires2fa) {
          // Cancelled prompt is fine — the card shows the pending-2FA state.
          await instanceStore.complete2FALogin(created.id, created.name);
        }
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      }
    },
  });
}

function openEditDialog(instance: InstanceEntry) {
  dialog.openComponentDialog<{ currentName: string; currentUrl: string; hasCredentials: boolean }>(EditInstanceDialog, {
    data: {
      title: t('views.settings.instances.edit'),
      confirmText: t('components.form.button.save'),
      contentProps: {
        currentName: instance.name,
        currentUrl: instance.url,
        hasCredentials: instance.hasCredentials,
      },
    },
    onConfirm: async (result: { name: string; credentials?: { username: string; password: string } } | null) => {
      if (!result) return;
      try {
        const updated = await updateInstance({
          id: instance.id,
          data: {
            name: result.name !== instance.name ? result.name : undefined,
            credentials: result.credentials ?? undefined,
          },
        });
        if (updated.requires2fa) {
          await instanceStore.complete2FALogin(updated.id, updated.name);
        }
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      }
    },
  });
}

function confirmRemove(id: string) {
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.settings.instances.confirm_remove'),
      confirmText: t('views.settings.instances.remove'),
      loading: isLoading,
    },
    onConfirm: async () => {
      isLoading.value = true;
      try {
        await deleteInstance(id);
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error, life: 3000 });
      }
      isLoading.value = false;
    },
  });
}

watch(
  instancesData,
  (data) => {
    if (!data) return;
    // App.vue also calls fetchInstances() on login — guard against re-assigning
    // structurally-identical data, which would otherwise re-trigger the
    // reachability watcher and double-probe on every page mount.
    if (!isEqual(instanceStore.serverInstances, data.instances)) {
      instanceStore.serverInstances = data.instances;
    }
    if (instanceStore.serverHomeId !== data.homeId) {
      instanceStore.serverHomeId = data.homeId;
    }
  },
  { immediate: true },
);

watch(instancesWithCredentials, refreshReachability, { immediate: true, deep: true });

useIntervalFn(refreshReachability, REACHABILITY_REFRESH_MS);

onBeforeUnmount(() => {
  _reachabilityAbort?.abort();
});
</script>
