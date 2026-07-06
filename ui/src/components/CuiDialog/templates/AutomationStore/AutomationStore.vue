<template>
  <div>
    <IconField>
      <InputIcon>
        <i-carbon:search class="w-4 h-4" />
      </InputIcon>
      <InputText v-model.trim="searchValue" :placeholder="$t('components.automation_store.search')" class="w-full" />
    </IconField>

    <div class="flex flex-wrap gap-2 mt-4">
      <Select
        v-model="categoryFilter"
        :options="categoryOptions"
        option-label="label"
        option-value="value"
        class="flex-1 min-w-[140px]"
        :placeholder="$t('components.automation_store.filter_category')"
      />
      <Select
        v-model="sortBy"
        :options="sortOptions"
        option-label="label"
        option-value="value"
        class="flex-1 min-w-[140px]"
        :placeholder="$t('components.automation_store.sort_by')"
      />
    </div>

    <div v-if="!isLoading && featuredEntries.length" class="mt-6">
      <h3>{{ $t('components.automation_store.featured') }}</h3>
      <div class="featured-row custom-scrollbar mt-3">
        <div v-for="entry in featuredEntries" :key="entry.id" class="featured-item">
          <CuiAutomationStoreCard :entry @open="openDetail" />
        </div>
      </div>
    </div>

    <div class="flex flex-row items-center justify-center w-full mt-8">
      <h3>{{ $t('components.automation_store.automations') }}</h3>
      <Button v-tooltip.left="{ value: $t('components.automation_store.refresh') }" text rounded severity="secondary" class="cui-icon-md ml-auto" @click="refreshStore">
        <template #icon>
          <i-material-symbols:refresh-rounded width="100%" height="100%" />
        </template>
      </Button>
      <Badge size="small" class="ml-2 rounded-full" :value="String(listEntries.length)" />
    </div>

    <ProgressBar v-if="isLoading" mode="indeterminate" class="my-3 !h-[1px]"></ProgressBar>
    <Divider v-else class="m-0 py-3" />

    <div v-if="isLoading" class="w-full">
      <Skeleton v-for="i in 4" :key="i" class="mb-2" height="120px"></Skeleton>
    </div>

    <div v-else-if="!listEntries.length && !featuredEntries.length" class="text-center py-10">
      <div class="text-muted mb-2">
        <i-material-symbols:automation class="w-12 h-12 mx-auto opacity-30" />
      </div>
      <p class="text-muted">{{ $t('components.automation_store.empty') }}</p>
    </div>

    <div v-else class="automation-store-list">
      <CuiAutomationStoreCard v-for="entry in listEntries" :key="entry.id" :entry @open="openDetail" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { AutomationsQuery } from '@/api/routes/automations.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { AUTOMATION_CATEGORY_META, AUTOMATION_CATEGORY_ORDER } from '@/components/CuiAutomationCategoryChip/types.js';

import type { AutomationCatalogEntry } from '@/api/routes/automations.js';
import type { AutomationStoreDetailProps } from '@/components/CuiDialog/templates/AutomationStoreDetail/types.js';

const AutomationStoreDetailDialog = asyncComponent(() => import('@/components/CuiDialog/templates/AutomationStoreDetail/AutomationStoreDetail.vue'));

const automationsQuery = new AutomationsQuery();

const dialog = useCuiDialog();
const { t } = useI18n();

const forceRefresh = ref(false);
const searchValue = ref('');
const categoryFilter = ref('all');
const sortBy = ref<'name' | 'featured'>('featured');

const { data: entries, isBusy: isLoading, refetch: refetchStore } = automationsQuery.getAutomationStoreQuery(forceRefresh);

const categoryOptions = computed(() => [
  { label: t('components.automation_store.filter_all_categories'), value: 'all' },
  ...AUTOMATION_CATEGORY_ORDER.map((category) => ({ label: t(AUTOMATION_CATEGORY_META[category].labelKey), value: category })),
]);

const sortOptions = computed(() => [
  { label: t('components.automation_store.sort_featured'), value: 'featured' },
  { label: t('components.automation_store.sort_name'), value: 'name' },
]);

const filteredEntries = computed(() => {
  let list = (entries.value ?? []).slice();

  const query = searchValue.value.toLowerCase().trim();
  if (query) {
    list = list.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        (entry.description ?? '').toLowerCase().includes(query) ||
        (entry.tags ?? []).some((tag) => tag.toLowerCase().includes(query)),
    );
  }

  if (categoryFilter.value !== 'all') {
    list = list.filter((entry) => entry.category === categoryFilter.value);
  }

  list.sort((a, b) => {
    if (sortBy.value === 'featured' && Boolean(a.featured) !== Boolean(b.featured)) {
      return a.featured ? -1 : 1;
    }
    return a.title.localeCompare(b.title);
  });

  return list;
});

const featuredEntries = computed(() => filteredEntries.value.filter((entry) => entry.featured));
const listEntries = computed(() => filteredEntries.value.filter((entry) => !entry.featured));

function openDetail(entry: AutomationCatalogEntry) {
  dialog.openComponentDialog<AutomationStoreDetailProps>(AutomationStoreDetailDialog, {
    data: {
      title: t('components.dialog.title.details'),
      hideConfirmButton: true,
      contentProps: { id: entry.id },
    },
  });
}

function refreshStore() {
  forceRefresh.value = true;
  refetchStore().finally(() => {
    forceRefresh.value = false;
  });
}

defineExpose({
  isLoading,
});
</script>

<style scoped>
.automation-store-list {
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
