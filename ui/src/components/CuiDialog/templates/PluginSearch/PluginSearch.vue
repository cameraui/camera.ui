<template>
  <div>
    <form @submit.prevent="searchPlugin">
      <label class="cui-label">{{ $t('components.form.label.name') }}</label>
      <InputGroup>
        <InputText v-model.trim="searchValue" :loading="pluginsAreLoading" placeholder="camera-ui-" type="text" />

        <InputGroupAddon>
          <Button text rounded severity="secondary" class="cui-icon-md" @click="resetSearch">
            <template #icon>
              <i-mdi:close width="100%" height="100%" />
            </template>
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </form>

    <div class="flex flex-wrap gap-2 mt-4">
      <Select
        v-model="categoryFilter"
        :options="categoryOptions"
        option-label="label"
        option-value="value"
        class="flex-1 min-w-[140px]"
        :placeholder="$t('components.plugin_search.filter_category')"
      />
      <Select
        v-model="trustFilter"
        :options="trustOptions"
        option-label="label"
        option-value="value"
        class="flex-1 min-w-[140px]"
        :placeholder="$t('components.plugin_search.filter_trust')"
      />
      <Select
        v-model="sortBy"
        :options="sortOptions"
        option-label="label"
        option-value="value"
        class="flex-1 min-w-[140px]"
        :placeholder="$t('components.plugin_search.sort_by')"
      />
    </div>

    <div v-if="!pluginsAreLoading && featuredPlugins.length" class="mt-6">
      <h3>{{ $t('components.plugin_search.featured') }}</h3>
      <div class="featured-row custom-scrollbar mt-3">
        <div v-for="(plugin, index) in featuredPlugins" :key="index" class="featured-item">
          <CuiPluginStoreCard :plugin :in-progress="isPluginInProgress(plugin.pluginName)" @open="openDetail" @install="openDialog" />
        </div>
      </div>
    </div>

    <div class="flex flex-row items-center justify-center w-full mt-8">
      <h3>{{ $t('components.plugin_search.plugins') }}</h3>
      <Button v-tooltip.left="{ value: $t('components.plugin_search.refresh') }" text rounded severity="secondary" class="cui-icon-md ml-auto" @click="refreshPlugins">
        <template #icon>
          <i-material-symbols:refresh-rounded width="100%" height="100%" />
        </template>
      </Button>
      <Badge size="small" class="ml-2 rounded-full" :value="String(listPlugins.length)" />
    </div>

    <ProgressBar v-if="pluginsAreLoading" mode="indeterminate" class="my-3 !h-[1px]"></ProgressBar>
    <Divider v-else class="m-0 py-3" />

    <div v-if="!pluginsAreLoading && !listPlugins.length" class="text-center py-10">
      <div class="text-muted mb-2">
        <i-mdi:package-variant-plus class="w-12 h-12 mx-auto opacity-30" />
      </div>
      <p class="text-muted">{{ $t('views.plugins.no_plugins') }}</p>
    </div>

    <div v-else-if="pluginsAreLoading" class="w-full">
      <Skeleton v-for="i in 6" :key="i" class="mb-2" height="132px"></Skeleton>
    </div>

    <div v-else class="w-full plugin-list">
      <CuiPluginStoreCard
        v-for="(plugin, index) in listPlugins"
        :key="index"
        v-tooltip="{ value: isPluginInProgress(plugin.pluginName) ? $t('components.plugin_search.in_progress') : undefined }"
        :plugin
        :in-progress="isPluginInProgress(plugin.pluginName)"
        @open="openDetail"
        @install="openDialog"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PluginsQuery } from '@/api/routes/plugins.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { PLUGIN_CATEGORY_META, PLUGIN_CATEGORY_ORDER } from '@/components/CuiPluginCategoryChip/types.js';

import type { PluginDetailProps } from '@/components/CuiDialog/templates/PluginDetail/types.js';
import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { CameraUiPlugin, PluginsQuery as PQuery } from '@shared/types';

const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));
const PluginDetailDialog = asyncComponent(() => import('@/components/CuiDialog/templates/PluginDetail/PluginDetail.vue'));

const pluginsQuery = new PluginsQuery();

const dialog = useCuiDialog();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const searchValue = ref('');
const query = ref<PQuery>({});
const notInstalledPlugins = ref<CameraUiPlugin[]>([]);
const categoryFilter = ref('all');
const trustFilter = ref('all');
const sortBy = ref<'downloads' | 'updated' | 'name'>('name');
const forceRefresh = ref(false);

const { data: plugins, isBusy: pluginsLoading, refetch: refetchPlugins } = pluginsQuery.searchPluginsQuery(query, { page: 1, pageSize: -1 }, forceRefresh);
const { data: pluginsProgress, isBusy: pluginsProgressLoading, refetch: refetchPluginsProgress } = pluginsQuery.getPluginsProgressQuery({ page: 1, pageSize: -1 });

const pluginsAreLoading = computed(() => pluginsLoading.value || pluginsProgressLoading.value);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value || pluginsAreLoading.value));

const categoryOptions = computed(() => [
  { label: t('components.plugin_search.filter_all_categories'), value: 'all' },
  ...PLUGIN_CATEGORY_ORDER.map((category) => ({ label: t(PLUGIN_CATEGORY_META[category].labelKey), value: category })),
]);

const trustOptions = computed(() => [
  { label: t('components.plugin_search.filter_all_trust'), value: 'all' },
  { label: t('components.plugin_search.trust_official'), value: 'official' },
  { label: t('components.plugin_search.trust_verified'), value: 'verified' },
  { label: t('components.plugin_search.trust_community'), value: 'community' },
]);

const sortOptions = computed(() => [
  { label: t('components.plugin_search.sort_name'), value: 'name' },
  { label: t('components.plugin_search.sort_downloads'), value: 'downloads' },
  { label: t('components.plugin_search.sort_updated'), value: 'updated' },
]);

const filteredPlugins = computed(() => {
  let list = notInstalledPlugins.value.slice();

  if (categoryFilter.value !== 'all') {
    list = list.filter((plugin) => plugin.category === categoryFilter.value);
  }

  if (trustFilter.value !== 'all') {
    list = list.filter((plugin) => plugin.trust === trustFilter.value);
  }

  list.sort((a, b) => {
    switch (sortBy.value) {
      case 'downloads':
        return (b.downloads?.weekly ?? 0) - (a.downloads?.weekly ?? 0);
      case 'updated':
        return new Date(b.lastUpdated ?? 0).getTime() - new Date(a.lastUpdated ?? 0).getTime();
      default:
        return (a.displayName || a.pluginName).localeCompare(b.displayName || b.pluginName);
    }
  });

  return list;
});

const featuredPlugins = computed(() => filteredPlugins.value.filter((plugin) => plugin.featured));
const listPlugins = computed(() => filteredPlugins.value.filter((plugin) => !plugin.featured));

function isPluginInProgress(pluginName: string): boolean | undefined {
  return pluginsProgress.value?.result.some((p) => p.pluginName === pluginName);
}

function searchPlugin(event?: Event): void {
  event?.preventDefault();
  query.value.pluginname = searchValue.value ?? '';
}

function resetSearch() {
  searchValue.value = '';
  query.value = {};
  categoryFilter.value = 'all';
  trustFilter.value = 'all';
  sortBy.value = 'name';
  searchPlugin();
}

function refreshPlugins() {
  // Force a TTL-bypassing refetch on the server (fresh lists/downloads), then clear
  // the flag so subsequent refetches use the caches again.
  forceRefresh.value = true;
  Promise.all([refetchPlugins(), refetchPluginsProgress()]).finally(() => {
    forceRefresh.value = false;
  });
}

function openDialog(plugin: CameraUiPlugin) {
  dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
    data: {
      title: t('components.dialog.title.install'),
      loading: isLoading,
      contentProps: {
        target: unref(plugin),
        installVersion: 'latest',
        isNewPlugin: true,
      },
    },
  });
}

function openDetail(plugin: CameraUiPlugin) {
  dialog.openComponentDialog<PluginDetailProps>(PluginDetailDialog, {
    data: {
      title: t('components.dialog.title.details'),
      confirmText: t('components.form.button.install'),
      contentProps: {
        plugin: unref(plugin),
      },
    },
  });
}

watch(
  plugins,
  (p) => {
    if (p?.result) {
      notInstalledPlugins.value = p.result.filter((plugin) => !plugin.installPath);
    }
  },
  { immediate: true, deep: true },
);

defineExpose({
  isLoading,
});
</script>

<style scoped>
.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.featured-row {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.featured-item {
  flex: 0 0 auto;
  width: 300px;
  display: flex;
}
</style>
