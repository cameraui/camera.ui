<template>
  <div ref="root" class="cui-datatable relative w-full">
    <Transition name="fade">
      <div v-if="canScrollRight" class="pointer-events-none absolute right-[0px] top-[-10px] z-2">
        <i-flowbite:arrow-right-outline width="20px" height="20px" class="opacity-15" />
      </div>
    </Transition>

    <DataTable v-bind="$attrs" :value="value" :rows="rows" :paginator="showPaginator" :paginator-template="paginatorTemplate">
      <template v-for="(_, name) in $slots" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { CUI_DATA_TABLE_DEFAULTS } from './types.js';

import type { CuiDataTableProps } from './types.js';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<CuiDataTableProps>(), CUI_DATA_TABLE_DEFAULTS);

const root = useTemplateRef<HTMLElement>('root');

const canScrollRight = ref(false);

const showPaginator = computed(() => props.paginator ?? (props.value?.length ?? 0) > props.rows);

function measureScroll() {
  const container = root.value?.querySelector<HTMLElement>('.p-datatable-table-container');
  canScrollRight.value = container ? container.scrollWidth - container.clientWidth - Math.ceil(container.scrollLeft) > 1 : false;
}

useEventListener(root, 'scroll', measureScroll, { capture: true, passive: true });
useResizeObserver(root, measureScroll);

watch(
  () => props.value,
  () => nextTick(measureScroll),
);

onMounted(() => nextTick(measureScroll));
</script>

<style scoped>
.cui-datatable :deep(.p-datatable-empty-message) > td {
  text-align: center;
}
</style>
