<template>
  <div class="automation-store-detail">
    <div v-if="isLoading" class="flex w-full items-center justify-center py-10">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <template v-else-if="item">
      <div class="flex items-start gap-2 flex-wrap">
        <h2 class="text-xl font-semibold">{{ item.title }}</h2>
        <CuiPluginTrustBadge trust="official" :show-label="false" />
        <i-mdi:star v-if="item.featured" v-tooltip.top="{ value: $t('components.automation_store.featured') }" class="w-5 h-5 text-primary" />
      </div>

      <div class="flex flex-wrap items-center gap-2 mt-3">
        <CuiAutomationCategoryChip :category="item.category" />
        <span v-if="item.author" class="detail-meta">
          <i-mdi:account class="detail-meta-icon" />
          {{ item.author }}
        </span>
      </div>

      <p v-if="item.description" class="text-sm mt-4">{{ item.description }}</p>

      <div v-if="item.tags?.length" class="flex flex-wrap gap-1 mt-3">
        <span v-for="tag in item.tags" :key="tag" class="detail-tag">#{{ tag }}</span>
      </div>

      <Divider />

      <div v-if="requiredPlugins.length">
        <h3 class="text-base font-semibold mb-2">{{ $t('components.automation_store.required_plugins') }}</h3>
        <div class="flex flex-col gap-1">
          <div v-for="plugin in requiredPlugins" :key="plugin.interface" class="flex items-center gap-2 text-sm">
            <i-mdi:check-circle v-if="plugin.installed" class="w-4 h-4 text-success" />
            <i-mdi:close-circle v-else class="w-4 h-4 text-danger" />
            <span>{{ plugin.label }}</span>
          </div>
        </div>
        <Message v-if="hasMissingPlugins" severity="warn" variant="simple" size="small" class="mt-2">
          {{ $t('components.automation_store.missing_plugins_hint') }}
        </Message>
      </div>

      <div v-if="requiredInputs.length" class="mt-4">
        <h3 class="text-base font-semibold mb-2">{{ $t('components.automation_store.required_inputs') }}</h3>
        <div class="flex flex-wrap gap-1">
          <span v-for="(input, index) in requiredInputs" :key="index" class="detail-tag">{{ input }}</span>
        </div>
      </div>
    </template>

    <div v-else class="text-center py-10">
      <p class="text-muted">{{ $t('components.automation_store.not_found') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AutomationsQuery } from '@/api/routes/automations.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { formatRequiredInputs } from '@/components/CuiAutomationStoreCard/types.js';

import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { AutomationStoreDetailProps } from './types.js';

const AutomationImportDialog = asyncComponent(() => import('@/components/CuiDialog/templates/AutomationImport/AutomationImport.vue'));

const automationsQuery = new AutomationsQuery();
const pluginsQuery = new PluginsQuery();

const props = defineProps<AutomationStoreDetailProps>();

const dialog = useCuiDialog();
const { t } = useI18n();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { data: item, isBusy: isLoading } = automationsQuery.getAutomationStoreItemQuery(computed(() => props.id));
const { data: pluginsData } = pluginsQuery.getPluginsQuery({ page: 1, pageSize: -1 });

const installedInterfaces = computed(() => {
  const set = new Set<string>();
  for (const plugin of pluginsData.value?.result ?? []) {
    for (const iface of plugin.contract?.interfaces ?? []) set.add(iface);
  }
  return set;
});

const requiredPlugins = computed(() =>
  (item.value?.requiredPlugins ?? []).map((iface) => ({
    interface: iface,
    label: iface.replace(/([A-Z])/g, ' $1').trim() || iface,
    installed: installedInterfaces.value.has(iface),
  })),
);

const hasMissingPlugins = computed(() => requiredPlugins.value.some((plugin) => !plugin.installed));

const requiredInputs = computed(() => formatRequiredInputs(item.value?.requiredInputs, t));

function onConfirm() {
  if (!item.value) return;

  // Loose generic: DeepMaybeRef over the blueprint's VueFlow node type is too deep to instantiate.
  dialog.openComponentDialog<Record<string, unknown>>(AutomationImportDialog, {
    data: {
      title: t('components.automation_import.title'),
      confirmText: t('components.automation_import.import'),
      contentProps: { blueprint: item.value.blueprint },
    },
  });
}

watch(
  item,
  (value) => {
    if (value) {
      dialogRefProps.hideConfirmButton.value = false;
      dialogRefProps.confirmText.value = t('components.automation_store.import');
    } else {
      dialogRefProps.hideConfirmButton.value = true;
    }
  },
  { immediate: true },
);

defineExpose({
  isLoading,
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

.detail-tag {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.72rem;
  color: var(--text-muted-color);
  background: var(--card-background);
  border: 1px solid var(--border-color-inner);
}
</style>
