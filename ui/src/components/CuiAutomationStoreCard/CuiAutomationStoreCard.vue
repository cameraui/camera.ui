<template>
  <div
    class="automation-store-card shadow-sm transition-default card-background"
    role="button"
    tabindex="0"
    @click="emit('open', entry)"
    @keydown.enter="emit('open', entry)"
  >
    <div class="automation-store-card-body">
      <div class="flex items-start gap-2 min-w-0">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 min-w-0">
            <h4 class="font-medium text-base truncate">{{ entry.title }}</h4>
            <CuiPluginTrustBadge trust="official" :show-label="false" class="flex-shrink-0" />
          </div>
        </div>
        <i-mdi:star v-if="entry.featured" v-tooltip.top="{ value: $t('components.automation_store.featured') }" class="w-4 h-4 flex-shrink-0 text-primary" />
      </div>

      <p v-if="entry.description" class="automation-store-card-description">{{ entry.description }}</p>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
        <CuiAutomationCategoryChip :category="entry.category" />
        <span v-if="entry.author" class="automation-store-meta">
          <i-mdi:account class="automation-store-meta-icon" />
          {{ entry.author }}
        </span>
      </div>

      <div v-if="entry.requiredPlugins?.length" class="flex flex-wrap gap-1 mt-2">
        <span v-for="plugin in entry.requiredPlugins" :key="plugin" class="automation-store-plugin-chip">
          <i-mdi:puzzle class="automation-store-meta-icon" />
          {{ humanizeInterface(plugin) }}
        </span>
      </div>

      <div v-if="requiredInputs.length" class="automation-store-inputs mt-auto pt-2">
        <span class="text-muted">{{ $t('components.automation_store.needs') }}:</span>
        {{ requiredInputs.join(', ') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatRequiredInputs } from './types.js';

import type { CuiAutomationStoreCardEmits, CuiAutomationStoreCardProps } from './types.js';

const props = defineProps<CuiAutomationStoreCardProps>();
const emit = defineEmits<CuiAutomationStoreCardEmits>();

const { t } = useI18n();

const requiredInputs = computed(() => formatRequiredInputs(props.entry.requiredInputs, t));

function humanizeInterface(iface: string): string {
  return iface.replace(/([A-Z])/g, ' $1').trim() || iface;
}
</script>

<style scoped>
.automation-store-card {
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

.automation-store-card:hover {
  border-color: color-mix(in srgb, var(--text-primary-color) 45%, var(--border-color-inner));
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}

.automation-store-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.automation-store-card-description {
  font-size: 0.875rem;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  margin: 0.5rem 0 0;
  color: var(--text-color);
}

.automation-store-meta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.72rem;
  color: var(--text-muted-color);
}

.automation-store-meta-icon {
  width: 0.85rem;
  height: 0.85rem;
}

.automation-store-plugin-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  line-height: 1.2;
  white-space: nowrap;
  color: var(--text-muted-color);
  background: var(--card-background);
  border: 1px dashed var(--border-color-inner);
}

.automation-store-inputs {
  font-size: 0.72rem;
  color: var(--text-color);
}
</style>
