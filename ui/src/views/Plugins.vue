<template>
  <div class="flex flex-col">
    <h1 v-if="!smBreakpoint" class="page-title">
      {{ $t(`views.${String($route.name).toLowerCase()}.title`) }}
    </h1>

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

      <div
        v-else
        key="content"
        class="grid w-full gap-2"
        :style="{
          gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : '450px'}, 1fr))`,
        }"
      >
        <CuiPluginCard v-for="(plugin, index) in filteredPlugins" :key="index" :plugin />
      </div>
    </Transition>

    <CuiFloatingButton
      v-if="hasPermission(undefined, 'admin')"
      :tooltip-props="{ value: $t('views.plugins.search_plugins') }"
      :button-props="{ class: 'text-white' }"
      :icon="PlusIcon"
      :icon-props="{ width: '30px', height: '30px' }"
      @click="openPluginDialog"
    />
  </div>
</template>

<script lang="ts" setup>
import PlusIcon from '~icons/typcn/plus';

import { PluginsQuery } from '@/api/routes/plugins.js';
import PluginSearchDialog from '@/components/CuiDialog/templates/PluginSearch/PluginSearch.vue';
import { PLUGIN_CARD_SIZE } from '@/components/CuiPluginCard/types.js';

const pluginsQuery = new PluginsQuery();

const dialog = useCuiDialog();
const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();
const { width: windowWidth, height: windowHeight } = useSharedWindowSize();

const { data: plugins, isBusy: pluginsLoading } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const searchQuery = ref('');

const isLoading = computed(() => pluginsLoading.value);

const filteredPlugins = computed(() => {
  const list = plugins.value?.result ?? [];
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return list;
  return list.filter((p) => p.pluginName.toLowerCase().includes(q) || p.displayName?.toLowerCase().includes(q));
});

const skeletonCount = computed(() => {
  const cols = smBreakpoint.value ? 1 : Math.max(1, Math.floor(windowWidth.value / 450));
  const rows = Math.max(1, Math.ceil(windowHeight.value / (PLUGIN_CARD_SIZE.HEIGHT + 8)));
  return cols * rows;
});

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
</script>

<style scoped></style>
