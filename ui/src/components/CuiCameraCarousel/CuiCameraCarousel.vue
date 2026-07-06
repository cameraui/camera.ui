<template>
  <div class="w-full h-full flex flex-col gap-3">
    <div v-if="isLoading || !cameras" class="w-full flex items-center justify-center mt-10">
      <ProgressSpinner v-if="isLoading" class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>

    <div
      v-else
      class="grid w-full gap-4"
      :style="{
        gridTemplateColumns: `repeat(auto-fill, minmax(${smBreakpoint ? '100%' : '150px'}, 1fr)) ${!cameras || cameras.result.length < 2 ? '50%' : ''}`,
      }"
    >
      <RouterLink
        v-for="camera in cameras.result"
        :key="camera.name"
        v-slot="{ isActive }"
        :to="`/cameras/${camera.name}`"
        class="flex flex-col items-center justify-center w-full h-full"
      >
        <CuiCameraSnapshot :camera class="cui-rounded-corner overflow-hidden" />
        <div v-if="showLabel" class="cui-rounded-corner py-1 px-2 my-2" :class="{ 'bg-primary': isActive }">
          <span
            class="text-sm truncate"
            :class="{
              'text-white': isActive,
            }"
            >{{ camera.name || $t('general.loading') }}</span
          >
        </div>
      </RouterLink>
    </div>

    <Paginator
      v-if="cameras && cameras.pagination.totalItems > 6"
      :always-show="false"
      :rows="6"
      :total-records="cameras.pagination.totalItems"
      template="PrevPageLink PageLinks NextPageLink"
      :pt="{ root: { class: 'bg-transparent' } }"
      @page="onPage"
    ></Paginator>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type { PaginationQuery } from '@shared/types';
import type { PageState } from 'primevue';
import type { CuiCameraCarouselProps } from './types.js';

const cameraQuery = new CamerasQuery();

const props = defineProps<CuiCameraCarouselProps>();

const route = useRoute();
const { smBreakpoint } = useSharedCuiBreakpoint();

const { showLabel } = toRefs(props);
const pagination = ref<PaginationQuery>({ page: 1, pageSize: 6 });
const currentPage = ref(1);

const { data: cameras, isBusy: camerasLoading } = cameraQuery.getCamerasQuery(pagination);

const isLoading = computed(() => camerasLoading.value);
const maxPages = computed(() => cameras.value?.pagination.totalPages ?? 1);

function onPage(e: PageState) {
  const page = e.page + 1;
  pagination.value.page = page;
}

watchEffect(() => {
  pagination.value.page = currentPage.value;
});

watch(
  cameras,
  (newData, oldData) => {
    if (!oldData && newData) {
      const camera = newData.result.find((camera) => camera.name === (route.params.cameraname as string));
      if (!camera && currentPage.value < maxPages.value) {
        currentPage.value++;
      } else {
        currentPage.value = newData.pagination.currentPage;
      }
    }
  },
  { immediate: true, deep: true },
);
</script>

<style scoped></style>
