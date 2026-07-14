<template>
  <div class="plugin-detail">
    <div class="flex items-start gap-4">
      <div class="w-16 h-16 relative rounded-2xl flex-shrink-0 border-2 border-color overflow-hidden">
        <CuiImage :src="logoSrc" alt="Plugin icon" class="block w-full h-full" image-container-class="w-full h-full" image-class="object-contain" />
      </div>

      <div class="flex flex-col min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <h2 class="text-xl font-semibold truncate">{{ plugin.displayName }}</h2>
          <CuiPluginTrustBadge :trust="plugin.trust" :show-label="false" />
        </div>
        <div class="text-sm text-muted truncate">{{ plugin.pluginName }}</div>
        <p v-if="plugin.tagline || plugin.description" class="text-sm mt-1">{{ plugin.tagline || plugin.description }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 mt-4">
      <CuiPluginCategoryChip :category="plugin.category" />
      <span v-if="weeklyDownloads" class="detail-meta">
        <i-mdi:download class="detail-meta-icon" />
        {{ weeklyDownloads }}
      </span>
      <span v-if="relativeUpdated" class="detail-meta">
        <i-mdi:clock-outline class="detail-meta-icon" />
        {{ $t('components.plugin_search.updated_ago', { time: relativeUpdated }) }}
      </span>
      <span v-if="plugin.license" class="detail-meta">
        <i-mdi:scale-balance class="detail-meta-icon" />
        {{ plugin.license }}
      </span>
      <span v-if="plugin.author" class="detail-meta">
        <i-mdi:account class="detail-meta-icon" />
        {{ plugin.author }}
      </span>
    </div>

    <div v-if="hasLinks" class="flex flex-wrap items-center gap-1 mt-4">
      <Button
        v-if="plugin.links?.npm"
        v-tooltip.top="{ value: 'NPM' }"
        text
        rounded
        severity="secondary"
        class="cui-icon-md"
        @click="$router.absUrl(plugin.links.npm, true)"
      >
        <template #icon>
          <i-proicons:npm width="100%" height="100%" />
        </template>
      </Button>
      <Button
        v-if="plugin.links?.repository"
        v-tooltip.top="{ value: $t('components.plugin_search.repository') }"
        text
        rounded
        severity="secondary"
        class="cui-icon-md"
        @click="$router.absUrl(plugin.links.repository, true)"
      >
        <template #icon>
          <i-mdi:source-branch width="100%" height="100%" />
        </template>
      </Button>
      <Button
        v-if="plugin.links?.homepage"
        v-tooltip.top="{ value: $t('components.plugin_search.homepage') }"
        text
        rounded
        severity="secondary"
        class="cui-icon-md"
        @click="$router.absUrl(plugin.links.homepage, true)"
      >
        <template #icon>
          <i-mdi:home width="100%" height="100%" />
        </template>
      </Button>
      <Button
        v-if="plugin.links?.bugs"
        v-tooltip.top="{ value: $t('components.plugin_search.bugs') }"
        text
        rounded
        severity="secondary"
        class="cui-icon-md"
        @click="$router.absUrl(plugin.links.bugs, true)"
      >
        <template #icon>
          <i-mdi:bug width="100%" height="100%" />
        </template>
      </Button>
    </div>

    <div v-if="showCompat" class="mt-4 flex flex-col gap-3">
      <template v-if="platformCompatible">
        <Tag severity="success" class="self-start">
          <span class="flex items-center gap-1">
            <i-mdi:check-circle />
            {{ $t('components.plugin_search.compatible_system') }}
          </span>
        </Tag>

        <div v-if="osLabels.length || cpuLabels.length" class="flex flex-wrap items-center gap-1">
          <Tag v-for="label in osLabels" :key="`os-${label}`" severity="secondary" :value="label" />
          <Tag v-for="label in cpuLabels" :key="`cpu-${label}`" severity="secondary" :value="label" />
        </div>
      </template>

      <div v-else class="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30">
        <i-mdi:alert-circle class="w-5 h-5 shrink-0 text-orange-400 mt-0.5" />
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-sm font-semibold text-orange-400">
            {{ $t('components.plugin_search.incompatible_system') }}<span v-if="platformRequirement"> — {{ platformRequirement }}</span>
          </span>
          <span class="text-xs text-orange-600 dark:text-orange-300">{{ $t('components.plugin_search.incompatible_worker_hint') }}</span>
        </div>
      </div>

      <div v-for="issue in compat?.issues ?? []" :key="issue.engine" class="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30">
        <i-mdi:alert-circle class="w-5 h-5 shrink-0 text-orange-400 mt-0.5" />
        <span class="text-sm text-orange-400">
          {{ $t('components.dialog.message.compatibility_engine', { engine: issue.engine, required: issue.required, current: issue.current }) }}
        </span>
      </div>
    </div>

    <div v-if="plugin.screenshots?.length" class="mt-5">
      <h3 class="text-base font-semibold mb-2">{{ $t('components.plugin_search.screenshots') }}</h3>
      <div class="screenshots-row custom-scrollbar">
        <Image v-for="(shot, index) in plugin.screenshots" :key="index" :src="shot" alt="Screenshot" preview class="screenshot-thumb" />
      </div>
    </div>

    <Divider />

    <div class="readme-section">
      <div v-if="readmeLoading" class="flex w-full items-center justify-center py-10">
        <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
      </div>
      <CuiMarkdownContent v-else :content="readme || $t('views.plugin.no_readme')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PluginsQuery } from '@/api/routes/plugins.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { humanizeCpu, humanizeOs } from '@/common/platformLabels.js';
import { formatCompactNumber, formatRelativeTime } from '@/common/utils.js';

import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';
import type { PluginDetailProps } from './types.js';

const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));

const pluginsQuery = new PluginsQuery();

const props = defineProps<PluginDetailProps>();

const dialog = useCuiDialog();
const { t } = useI18n();

const { plugin } = toRefs(props);

const { data: pluginLogo } = pluginsQuery.getPluginLogoQuery(plugin.value.pluginName);
const { data: readme, isBusy: readmeLoading } = pluginsQuery.getPluginReadmeQuery(plugin.value.pluginName);
const { data: compat } = pluginsQuery.getPluginCompatQuery(plugin.value.pluginName);

const logoSrc = computed(() => plugin.value.logo || pluginLogo.value);

const weeklyDownloads = computed(() => {
  const weekly = plugin.value.downloads?.weekly;
  return typeof weekly === 'number' ? t('components.plugin_search.downloads_per_week', { count: formatCompactNumber(weekly) }) : undefined;
});

const relativeUpdated = computed(() => (plugin.value.lastUpdated ? formatRelativeTime(plugin.value.lastUpdated) : undefined));

const hasLinks = computed(() => Boolean(plugin.value.links?.npm || plugin.value.links?.repository || plugin.value.links?.homepage || plugin.value.links?.bugs));

const osLabels = computed(() => (compat.value?.os ?? []).map(humanizeOs));

const cpuLabels = computed(() => (compat.value?.cpu ?? []).map(humanizeCpu));

const platformRequirement = computed(() => [...osLabels.value, ...cpuLabels.value].join(' · '));

const platformCompatible = computed(() => compat.value?.platformCompatible ?? true);

const showCompat = computed(
  () => Boolean(compat.value) && (osLabels.value.length > 0 || cpuLabels.value.length > 0 || !platformCompatible.value || (compat.value?.issues?.length ?? 0) > 0),
);

function onConfirm() {
  dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
    data: {
      title: t('components.dialog.title.install'),
      confirmText: t('components.form.button.install'),
      contentProps: {
        target: unref(plugin),
        installVersion: 'latest',
      },
    },
  });
}

defineExpose({
  onConfirm,
});
</script>

<style scoped>
.detail-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  color: var(--text-muted-color);
}

.detail-meta-icon {
  width: 0.9rem;
  height: 0.9rem;
}

.screenshots-row {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.25rem;
}

.screenshot-thumb :deep(img) {
  height: 140px;
  width: auto;
  border-radius: var(--border-radius-md);
  border: 1px solid var(--border-color-inner);
  object-fit: cover;
}
</style>
