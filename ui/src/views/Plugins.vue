<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t(`views.${String($route.name).toLowerCase()}.title`) }}
    </h1>

    <Message v-if="updatesRunActive" severity="warn" class="mb-4" :closable="false">
      {{ t('views.plugins.updates_run_active') }}
    </Message>

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
        <InputText v-model="searchQuery" :placeholder="t('views.plugins.search')" class="w-full" />
      </IconField>

      <template v-if="hasPermission(undefined, 'admin')">
        <Button v-tooltip.left="{ value: t('views.plugins.settings') }" severity="secondary" outlined class="cui-button shrink-0" @click="menuRef?.toggleMenu($event)">
          <template #icon>
            <i-carbon:settings class="w-4.5 h-4.5" />
          </template>
        </Button>

        <Button
          v-if="updatablePlugins.length"
          v-tooltip.left="{ value: t('views.plugins.update_all_hint') }"
          class="cui-button shrink-0 whitespace-nowrap"
          :loading="updateAllRunning"
          :disabled="updatesRunActive"
          :label="smBreakpoint ? String(updatablePlugins.length) : t('views.plugins.update_all', { count: updatablePlugins.length })"
          @click="handleUpdateAll"
        >
          <template #icon>
            <UpdateIcon class="w-4.5 h-4.5" />
          </template>
        </Button>

        <CuiMenu
          ref="menuRef"
          :items="menuItems"
          :auto-hide="false"
          :popover="{
            pt: {
              root: { class: 'w-[22rem]' },
              content: {
                class: 'p-0! rounded-xl! overflow-hidden!',
              },
            },
          }"
        />
      </template>
    </div>

    <Transition name="fade-2" mode="out-in">
      <div
        v-if="isLoading"
        key="loading"
        class="grid w-full gap-2"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : '450px'}, 1fr))`,
        }"
      >
        <Skeleton v-for="i in skeletonCount" :key="i" :height="`${PLUGIN_CARD_SIZE.HEIGHT}px`" class="cui-card" />
      </div>

      <div v-else-if="!filteredPlugins.length || !hasPermission(undefined, 'admin')" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
        <i-tabler:puzzle-filled class="w-12 h-12 text-muted" />
        <span class="text-muted text-sm">{{ $t('views.plugins.no_plugins') }}</span>
      </div>

      <Card v-else-if="viewMode === 'table'" key="table" class="cui-card h-auto! self-start">
        <template #content>
          <CuiDataTable :value="filteredPlugins" paginator striped-rows class="w-full">
            <Column v-if="selectionMode" header="" header-class="p-2 pl-4 w-8 max-w-8" class="p-2 pl-4 w-8 max-w-8">
              <template #body="{ data }">
                <Checkbox :model-value="selectedIds.has(data.pluginName)" binary size="small" @update:model-value="toggleSelection(data.pluginName)" />
              </template>
            </Column>

            <Column header="" header-class="p-2 pl-4 w-5 max-w-5" class="p-2 pl-4 w-5 max-w-5">
              <template #body="{ data }">
                <div class="flex items-center justify-center">
                  <CuiPluginStatusBadge :plugin-name="data.pluginName" />
                </div>
              </template>
            </Column>

            <Column field="displayName" :header="t('views.plugins.plugin')" header-class="p-2 min-w-48" class="p-2 min-w-48">
              <template #body="{ data }">
                <RouterLink :to="`/plugins/${data.pluginName}`" class="flex flex-col min-w-0">
                  <div class="flex items-center gap-3 min-w-0">
                    <span class="font-bold text-color text-sm truncate">{{ data.displayName || data.pluginName }}</span>
                    <i-icon-park-solid:up-c
                      v-if="updates[data.pluginName]?.updateAvailable"
                      v-tooltip="{ value: $t('components.form.tooltip.update_available') }"
                      class="text-green-500 shrink-0"
                    />
                  </div>
                  <span class="text-xs text-muted truncate">{{ data.pluginName }}</span>
                </RouterLink>
              </template>
            </Column>

            <Column field="installedVersion" :header="t('views.plugins.version')" header-class="p-2" class="p-2">
              <template #body="{ data }">
                <div class="flex flex-col">
                  <span class="text-sm">v{{ data.installedVersion || data.latestVersion }}</span>
                  <span v-if="updates[data.pluginName]?.updateAvailable" class="text-xs text-green-500">v{{ updates[data.pluginName]?.latestVersion }}</span>
                </div>
              </template>
            </Column>

            <Column header-class="p-2 w-32" class="p-2 w-32">
              <template #body="{ data }">
                <CuiPluginTableActions :plugin="data" />
              </template>
            </Column>
          </CuiDataTable>
        </template>
      </Card>

      <div
        v-else
        key="content"
        class="grid w-full gap-2"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : '450px'}, 1fr))`,
        }"
      >
        <CuiPluginCard
          v-for="plugin in filteredPlugins"
          :key="plugin.pluginName"
          :plugin
          :selection-mode="selectionMode"
          :selected="selectedIds.has(plugin.pluginName)"
          @select="toggleSelection(plugin.pluginName)"
        />
      </div>
    </Transition>

    <CuiFloatingButtonGroup v-if="hasPermission(undefined, 'admin')" :force-visible="selectionMode">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          v-if="filteredPlugins.length"
          grouped
          :tooltip-props="{ value: t('views.plugins.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: viewMode === 'cards' ? t('views.plugins.view_table') : t('views.plugins.view_cards') }"
          :button-props="{ severity: 'secondary' }"
          :icon="viewMode === 'cards' ? TableIcon : GridIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleViewMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.plugins.search_plugins') }"
          :button-props="{ class: 'text-white' }"
          :icon="PlusIcon"
          :icon-props="{ width: '30px', height: '30px' }"
          @click="openPluginDialog"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelected ? $t('components.form.tooltip.deselect_all') : $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('views.plugins.update_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedWithUpdates.length || bulkBusy || updatesRunActive }"
          :icon="UpdateIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkUpdateSelected"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('views.plugins.enable_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy || updatesRunActive }"
          :icon="PlayIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkEnableSelected"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('views.plugins.disable_selected') }"
          :button-props="{ severity: 'secondary', disabled: !selectedIds.size || bulkBusy || updatesRunActive }"
          :icon="StopIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkDisableSelected"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: t('views.plugins.uninstall_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy || updatesRunActive }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="bulkUninstallSelected"
        />
      </template>
    </CuiFloatingButtonGroup>
  </div>
</template>

<script lang="ts" setup>
import StopIcon from '~icons/carbon/stop-filled';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import UpdateIcon from '~icons/material-symbols/deployed-code-update';
import CloseIcon from '~icons/mdi/close';
import TrashIcon from '~icons/mdi/delete-outline';
import GridIcon from '~icons/mingcute/grid-fill';
import TableIcon from '~icons/mingcute/table-2-line';
import PlayIcon from '~icons/solar/play-bold';
import SelectIcon from '~icons/tabler/dots-filled';
import PlusIcon from '~icons/typcn/plus';

import type { CameraUiPlugin, IConfig, INpmPluginState } from '@shared/types';

import { ConfigQuery } from '@/api/routes/config.js';
import { bulkDisablePluginsFn, bulkEnablePluginsFn, bulkInstallPluginsFn, bulkUninstallPluginsFn, getPluginUpdateFn, PluginsQuery } from '@/api/routes/plugins.js';
import PluginSearchDialog from '@/components/CuiDialog/templates/PluginSearch/PluginSearch.vue';
import { PLUGIN_CARD_SIZE } from '@/components/CuiPluginCard/types.js';
import { useCardSelection } from '@/composables/useCardSelection.js';
import { usePluginUpdates } from '@/composables/usePluginUpdates.js';

const pluginsQuery = new PluginsQuery();
const configQuery = new ConfigQuery();

const dialog = useCuiDialog();
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();
const { startUpdate } = usePluginUpdates();
const updatesSocket = useUpdatesSocket();

const uiStore = useUiStore();
const { uiSettings } = storeToRefs(uiStore);

const { data: plugins, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });
const { data: config } = configQuery.getConfigQuery(true);
const { mutateAsync: patchConfig } = configQuery.patchConfigQuery();

const menuRef = useTemplateRef('menuRef');

const searchQuery = ref('');
const updates = ref<Record<string, INpmPluginState | undefined>>({});
const updateAllRunning = ref(false);

const { selectionMode, selectedIds, selectedItems, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  () => filteredPlugins.value,
  (plugin) => plugin.pluginName,
);

const updatesRunActive = computed(() => updatesSocket.status.value?.runActive === true);

const menuItems = computed(() => [
  {
    key: 'betaVersions',
    label: t('views.plugins.beta_versions'),
    description: t('views.plugins.beta_versions_hint'),
    toggle: true,
    toggleState: (config.value as IConfig | undefined)?.plugins?.betaVersions ?? false,
    onClick: toggleBetaVersions,
  },
  {
    key: 'allowBuildScripts',
    label: t('views.plugins.allow_build_scripts'),
    description: t('views.plugins.allow_build_scripts_hint'),
    toggle: true,
    toggleState: (config.value as IConfig | undefined)?.plugins?.allowBuildScripts ?? false,
    onClick: toggleAllowBuildScripts,
  },
]);

const isLoading = computed(() => pluginsLoading.value && !plugins.value);

const viewMode = computed(() => uiSettings.value.plugins.view);

const filteredPlugins = computed(() => {
  const list = plugins.value?.result ?? [];
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return list;
  return list.filter((p) => p.pluginName.toLowerCase().includes(q) || p.displayName?.toLowerCase().includes(q));
});

const updatablePlugins = computed(() => (plugins.value?.result ?? []).filter((p) => updates.value[p.pluginName]?.updateAvailable));

const selectedWithUpdates = computed(() => selectedItems.value.filter((p) => updates.value[p.pluginName]?.updateAvailable));

const skeletonCount = computed(() => {
  const cols = smBreakpoint.value ? 1 : Math.max(1, Math.floor(windowWidth.value / 450));
  const rows = Math.max(1, Math.ceil(windowHeight.value / (PLUGIN_CARD_SIZE.HEIGHT + 8)));
  return cols * rows;
});

function toggleViewMode() {
  uiSettings.value.plugins.view = viewMode.value === 'cards' ? 'table' : 'cards';
}

async function loadUpdates() {
  const list = plugins.value?.result ?? [];
  await Promise.all(
    list.map(async (plugin) => {
      updates.value[plugin.pluginName] = await pluginsQuery.queryClient
        .fetchQuery({
          queryKey: ['plugins', plugin.pluginName, 'update'],
          queryFn: ({ signal }) => getPluginUpdateFn({ pluginName: plugin.pluginName, signal }),
          staleTime: 60_000,
        })
        .catch(() => undefined);
    }),
  );
}

async function refreshAfterUpdates() {
  await pluginsQuery.queryClient.refetchQueries({ queryKey: ['pluginsList'] });
  await pluginsQuery.queryClient.refetchQueries({ queryKey: ['plugins'] });
  await loadUpdates();
}

async function runBulkUpdate(targets: CameraUiPlugin[]): Promise<{ done: number; failed: string[] }> {
  const entries = targets
    .map((plugin) => ({ plugin, version: updates.value[plugin.pluginName]?.latestVersion }))
    .filter((entry): entry is { plugin: CameraUiPlugin; version: string } => Boolean(entry.version));
  if (!entries.length) return { done: 0, failed: [] };

  const bulk = bulkInstallPluginsFn({ plugins: entries.map((entry) => ({ pluginname: entry.plugin.pluginName, pluginversion: entry.version })) });

  const failed: string[] = [];
  let done = 0;

  await Promise.all(
    entries.map(async ({ plugin, version }) => {
      const ok = await startUpdate(plugin.pluginName, version, async () => {
        const result = await bulk;
        const failure = result.failed.find((entry) => entry.id === plugin.pluginName);
        if (failure) throw new Error(failure.error);
      });
      if (ok) done++;
      else failed.push(plugin.displayName || plugin.pluginName);
    }),
  );

  return { done, failed };
}

async function handleUpdateAll() {
  if (updateAllRunning.value) return;
  updateAllRunning.value = true;

  let done = 0;
  let failed: string[] = [];

  try {
    ({ done, failed } = await runBulkUpdate([...updatablePlugins.value]));
  } finally {
    updateAllRunning.value = false;
  }

  await refreshAfterUpdates();

  if (failed.length) {
    toast.add({
      severity: 'error',
      summary: t('views.plugins.update_all_failed', { count: failed.length }),
      detail: failed.join(', '),
      life: 8000,
    });
  }
  if (done) {
    toast.add({ severity: 'success', detail: t('views.plugins.update_all_done', { count: done }), life: 5000 });
  }
}

function reportBulk(done: number, failed: string[], doneKey: string): void {
  if (failed.length) {
    toast.add({ severity: 'error', summary: t('views.plugins.bulk_failed', { count: failed.length }), detail: failed.join(', '), life: 8000 });
  }
  if (done) {
    toast.add({ severity: 'success', detail: t(doneKey, { count: done }), life: 5000 });
  }
}

function failedLabels(targets: CameraUiPlugin[], failed: { id: string; error: string }[]): string[] {
  return targets.filter((plugin) => failed.some((entry) => entry.id === plugin.pluginName)).map((plugin) => plugin.displayName || plugin.pluginName);
}

async function bulkUpdateSelected() {
  bulkBusy.value = true;
  let done = 0;
  let failed: string[] = [];
  try {
    ({ done, failed } = await runBulkUpdate([...selectedWithUpdates.value]));
  } finally {
    bulkBusy.value = false;
  }
  await refreshAfterUpdates();
  exitSelectionMode();
  reportBulk(done, failed, 'views.plugins.update_all_done');
}

async function bulkEnableSelected() {
  const targets = [...selectedItems.value];
  bulkBusy.value = true;
  try {
    const result = await bulkEnablePluginsFn({ pluginNames: targets.map((plugin) => plugin.pluginName) });
    await refreshAfterUpdates();
    exitSelectionMode();
    reportBulk(result.succeeded.length, failedLabels(targets, result.failed), 'views.plugins.enable_selected_done');
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message ?? String(error), life: 5000 });
  } finally {
    bulkBusy.value = false;
  }
}

async function bulkDisableSelected() {
  const targets = [...selectedItems.value];
  bulkBusy.value = true;
  try {
    const result = await bulkDisablePluginsFn({ pluginNames: targets.map((plugin) => plugin.pluginName) });
    await refreshAfterUpdates();
    exitSelectionMode();
    reportBulk(result.succeeded.length, failedLabels(targets, result.failed), 'views.plugins.disable_selected_done');
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message ?? String(error), life: 5000 });
  } finally {
    bulkBusy.value = false;
  }
}

function bulkUninstallSelected() {
  const targets = [...selectedItems.value];
  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.plugins.uninstall_selected_confirm', { count: targets.length }),
      confirmText: t('components.form.button.uninstall'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      bulkBusy.value = true;
      try {
        const result = await bulkUninstallPluginsFn({ pluginNames: targets.map((plugin) => plugin.pluginName) });
        await refreshAfterUpdates();
        exitSelectionMode();
        reportBulk(result.succeeded.length, failedLabels(targets, result.failed), 'views.plugins.uninstall_selected_done');
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error?.response?.data?.message ?? error?.message ?? String(error), life: 5000 });
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

async function toggleAllowBuildScripts() {
  const current = config.value;
  if (!current || typeof current === 'string') return;

  const next: IConfig = {
    ...current,
    plugins: { ...current.plugins, allowBuildScripts: !current.plugins?.allowBuildScripts },
  };

  await patchConfig({ configData: JSON.stringify(next) });
}

async function toggleBetaVersions() {
  const current = config.value;
  if (!current || typeof current === 'string') return;

  const next: IConfig = {
    ...current,
    plugins: { ...current.plugins, betaVersions: !current.plugins?.betaVersions },
  };

  await patchConfig({ configData: JSON.stringify(next) });
}

function openPluginDialog() {
  dialog.openComponentDialog(PluginSearchDialog, {
    data: {
      title: t('components.dialog.title.search_plugin'),
      contentProps: {},
      hideConfirmButton: true,
      fullscreen: true,
    },
  });
}

watch(
  () => plugins.value?.result,
  (list) => {
    if (list?.length) loadUpdates();
  },
  { immediate: true },
);

const unsubscribeUpdatesSync = pluginsQuery.queryClient.getQueryCache().subscribe((event) => {
  const [root, name, kind] = event.query.queryKey;
  if (root !== 'plugins' || kind !== 'update' || typeof name !== 'string') return;
  const data = event.query.state.data as INpmPluginState | undefined;
  if (data) updates.value[name] = data;
});

onUnmounted(unsubscribeUpdatesSync);
</script>

<style scoped></style>
