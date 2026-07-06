<template>
  <div
    class="plugin-store-card shadow-sm transition-default card-background custom-scrollbar"
    :class="{ 'opacity-50 in-progress': inProgress }"
    role="button"
    tabindex="0"
    @click="emit('open', plugin)"
    @keydown.enter="emit('open', plugin)"
  >
    <div class="plugin-store-card-body">
      <div class="flex items-start gap-3 min-w-0">
        <div class="plugin-store-icon flex-shrink-0">
          <CuiImage :src="plugin.logo" alt="Plugin logo" class="block w-full h-full" image-container-class="w-full h-full" image-class="object-contain" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <h4 class="font-medium text-base truncate">{{ plugin.displayName }}</h4>
            <CuiPluginTrustBadge :trust="plugin.trust" :show-label="false" class="flex-shrink-0" />
          </div>
          <div class="text-sm text-muted truncate">{{ plugin.pluginName }}</div>
        </div>
      </div>
      <p class="plugin-store-card-description">{{ plugin.tagline || plugin.description }}</p>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-auto pt-2">
        <Tag
          v-if="plugin.compatible === false"
          v-tooltip.top="{ value: $t('components.plugin_search.incompatible_system') }"
          severity="warn"
          :value="$t('components.plugin_search.incompatible')"
        />
        <CuiPluginCategoryChip :category="plugin.category" />
        <span v-if="weeklyDownloads" class="plugin-store-meta">
          <i-mdi:download class="plugin-store-meta-icon" />
          {{ weeklyDownloads }}
        </span>
        <span v-if="relativeUpdated" class="plugin-store-meta">
          <i-mdi:clock-outline class="plugin-store-meta-icon" />
          {{ $t('components.plugin_search.updated_ago', { time: relativeUpdated }) }}
        </span>
      </div>
    </div>

    <div class="plugin-store-card-actions" @click.stop>
      <div class="flex gap-1">
        <Button
          v-if="plugin.links?.repository || plugin.links?.homepage"
          v-tooltip.top="{ value: 'Github' }"
          text
          rounded
          severity="secondary"
          class="cui-icon-md"
          @click="$router.absUrl((plugin.links?.repository || plugin.links?.homepage)!, true)"
        >
          <template #icon>
            <i-mdi:github width="100%" height="100%" />
          </template>
        </Button>
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
      </div>

      <Button class="cui-button-medium ml-auto" :label="$t('components.form.button.install')" :disabled="inProgress" @click="emit('install', plugin)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCompactNumber, formatRelativeTime } from '@/common/utils.js';

import type { CameraUiPlugin } from '@shared/types';
import type { CuiPluginStoreCardEmits, CuiPluginStoreCardProps } from './types.js';

const props = defineProps<CuiPluginStoreCardProps>();
const emit = defineEmits<CuiPluginStoreCardEmits>();

const { t } = useI18n();

const plugin = computed<CameraUiPlugin>(() => props.plugin);

const weeklyDownloads = computed(() => {
  const weekly = plugin.value.downloads?.weekly;
  return typeof weekly === 'number' ? t('components.plugin_search.downloads_per_week', { count: formatCompactNumber(weekly) }) : undefined;
});

const relativeUpdated = computed(() => (plugin.value.lastUpdated ? formatRelativeTime(plugin.value.lastUpdated) : undefined));
</script>

<style scoped>
.plugin-store-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 1rem;
  border-radius: var(--border-radius-md);
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.plugin-store-card:hover:not(.in-progress) {
  border-color: color-mix(in srgb, var(--text-primary-color) 45%, var(--border-color-inner));
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.plugin-store-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
}

.plugin-store-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border-radius: var(--border-radius-md);
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
  overflow: hidden;
}

.plugin-store-card-description {
  font-size: 0.875rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 0.5rem 0;
  color: var(--text-color);
}

.plugin-store-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--text-muted-color);
}

.plugin-store-meta-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.plugin-store-card-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border-color-inner);
  width: 100%;
}
</style>
