<template>
  <div class="relative flex flex-col h-full">
    <CuiRecordingsGrid
      v-if="displayItems.length"
      ref="gridRef"
      :items="displayItems"
      :min-item-width="150"
      :gap="8"
      :has-more="hasMore"
      :load-more="loadMore"
      :item-key="itemKey"
      class="flex-1 min-h-0"
    >
      <template #item="{ item }">
        <RecordingCard
          :event="item.event"
          :seg-index="item.segIndex"
          hide-segment-badge
          :camera-name="cameraName"
          :camera="camera"
          @scroll-to-event="(ts: number) => emit('scrollToEvent', ts)"
          @open-trace="(atMs?: number) => openTrace(item.event, atMs)"
        />
      </template>
    </CuiRecordingsGrid>

    <div v-if="isLoading && !displayItems.length" class="flex justify-center py-4">
      <i-svg-spinners:ring-resize width="24px" height="24px" class="text-muted" />
    </div>

    <div v-if="!displayEvents.length && !isLoading" class="flex flex-col items-center justify-center py-10 gap-3">
      <i-tabler:video-off class="w-12 h-12 text-muted opacity-30" />
      <p class="text-muted text-sm">{{ emptyText }}</p>
    </div>

    <CuiFloatingButtonGroup v-if="!eventsUnavailable" contained :scroll-y="gridScrollY">
      <CuiFloatingButton
        v-if="gridSearch"
        :tooltip-props="{ value: $t('components.timeline.filter_zone_enable') }"
        :button-props="{ severity: gridSearch.active.value ? 'primary' : 'secondary' }"
        :icon="ZoneIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="toggleZone"
      />
      <CuiFloatingButton
        :tooltip-props="{ value: $t('views.camera.recordings_filter') }"
        :button-props="{ severity: filterActive ? 'primary' : 'secondary' }"
        :icon="filterActive ? FilterActiveIcon : FilterIcon"
        :icon-props="{ width: '100%', height: '100%' }"
        @click="openFilter"
      />
    </CuiFloatingButtonGroup>
  </div>
</template>

<script setup lang="ts">
import { useDetectionEvents } from '@camera.ui/nvr';
import { DETECTION_ATTRIBUTES } from '@camera.ui/sdk';
import FilterIcon from '~icons/mage/filter';
import FilterActiveIcon from '~icons/mage/filter-fill';
import ZoneIcon from '~icons/tabler/grid-scan';

import { UsersQuery } from '@/api/routes/users.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { GridSearchKey } from '@/components/CuiGridSearch/types.js';
import { boxOverlapsRegions } from '@/components/CuiGridSearch/utils.js';
import CuiRecordingsGrid from '@/components/CuiRecordings/CuiRecordingsGrid.vue';
import { triggerQuery, vehicleAttributeLabels } from '@/components/CuiRecordings/filters.js';
import { buildUngroupedItems } from '@/components/CuiRecordings/ungrouped.js';
import { provideEventHoverPreview } from '@/composables/provideEventHoverPreview.js';
import { defaultMotionTypes } from '@/utils/motionDefault.js';
import { cameraFilterSet, contentPicked, savedSelection } from './filter.js';
import { CAMERA_RECORDINGS_FILTER_DEFAULTS } from './types.js';

import type { CameraRecordingsFilterProps } from '@/components/CuiDialog/templates/CameraRecordingsFilter/types.js';
import type { UngroupedItem } from '@/components/CuiRecordings/ungrouped.js';
import type { GetEventsOptions, RecordedEvent } from '@camera.ui/nvr';
import type { CameraRecordingsFilterState, CuiCameraRecordingsEmits, CuiCameraRecordingsProps } from './types.js';

const CameraRecordingsFilterDialog = asyncComponent(() => import('@/components/CuiDialog/templates/CameraRecordingsFilter/CameraRecordingsFilter.vue'));

const props = defineProps<CuiCameraRecordingsProps>();

const emit = defineEmits<CuiCameraRecordingsEmits>();

const { t } = useI18n();
const dialog = useCuiDialog();
const { openEventTrace } = useEventTraceDialog();
const authStore = useAuthStore();
const queryClient = useQueryClient();
const usersQuery = new UsersQuery();

const username = computed(() => authStore.user?.username ?? '');
const { data: currentUser, isError: userLoadFailed } = usersQuery.getUserQuery(username);

const gridSearch = inject(GridSearchKey, undefined);

provideEventHoverPreview(10);

const ATTR_SET = new Set<string>(DETECTION_ATTRIBUTES);
const REGION_FILL_ITEMS = 12;
const REGION_FILL_PAGES = 5;

const gridRef = useTemplateRef<{ scrollY: number }>('gridRef');
const filter = ref<CameraRecordingsFilterState>({ ...CAMERA_RECORDINGS_FILTER_DEFAULTS });
const filterRestored = ref(false);

let regionFillPages = 0;

const gridScrollY = computed(() => gridRef.value?.scrollY ?? 0);

const cameraIds = computed(() => [props.cameraId]);

const serverFilter = computed<GetEventsOptions>(() => {
  const { types, day, minConfidence, search, sensorEvents, audioLabels, vehicleColors, vehicleTypes } = filter.value;
  const attributes = types.filter((type) => ATTR_SET.has(type));
  const labels = types.filter((type) => !ATTR_SET.has(type));
  const content = contentPicked(filter.value);
  return {
    hasDetections: !content,
    shownTypes: content ? undefined : defaultMotionTypes(props.camera ? [props.camera] : []),
    ...triggerQuery(sensorEvents, audioLabels),
    types: labels.length > 0 ? labels : undefined,
    attributes: attributes.length > 0 ? attributes : undefined,
    attributeLabels: vehicleAttributeLabels(vehicleColors, vehicleTypes),
    search: search || undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
    startMs: day ? new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime() : undefined,
    endMs: day ? new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime() - 1 : undefined,
  };
});

const {
  events,
  isLoading,
  hasMore,
  loadMore,
  pluginUnavailable: eventsUnavailable,
  licenseRequired,
} = useDetectionEvents({
  availableCameraIds: cameraIds,
  cameraIds,
  realtime: true,
  pageSize: 30,
  filter: serverFilter,
  enabled: () => Boolean(props.camera) && (filterRestored.value || userLoadFailed.value),
});

const displayEvents = computed(() => {
  let result = events.value.filter((e) => e.state === 'ended' || (e.segments?.length ?? 0) > 0);

  const regions = gridSearch?.regions.value;
  if (regions && regions.length > 0) {
    result = result.filter((e) => e.segments.some((s) => s.detections.some((d) => d.box && boxOverlapsRegions(d.box, regions))));
  }

  return result;
});

const displayItems = computed(() => buildUngroupedItems(displayEvents.value));

const regionsKey = computed(() => JSON.stringify(gridSearch?.regions.value ?? []));

const filterActive = computed(() => cameraFilterSet(filter.value));

const emptyText = computed(() => {
  if (eventsUnavailable.value) return t('views.recordings.recordings_unavailable');
  if (licenseRequired.value) return t('views.recordings.vehicle_filter_license');
  return t('views.recordings.no_recordings');
});

function itemKey(item: UngroupedItem): string {
  return item.key;
}

function openTrace(event: RecordedEvent, atMs?: number): void {
  if (props.camera) openEventTrace(event, props.camera, atMs);
}

function openFilter(): void {
  dialog.openComponentDialog<CameraRecordingsFilterProps>(CameraRecordingsFilterDialog, {
    data: {
      title: t('views.camera.recordings_filter'),
      confirmText: t('components.form.button.apply'),
      contentProps: { cameraName: props.cameraName, camera: props.camera, filter: filter.value },
    },
    onConfirm: (result: CameraRecordingsFilterState) => {
      filter.value = result;
      saveFilter(result);
    },
  });
}

async function saveFilter(result: CameraRecordingsFilterState): Promise<void> {
  await authStore.updateUser({ preferences: { recordings: { cameras: { [props.cameraId]: savedSelection(result) } } } });
  await queryClient.invalidateQueries({ queryKey: ['users', username.value] });
}

function toggleZone(): void {
  if (!gridSearch) return;
  gridSearch.active.value = !gridSearch.active.value;
  if (!gridSearch.active.value) gridSearch.regions.value = [];
}

watch(
  currentUser,
  (user) => {
    if (!user || filterRestored.value) return;
    filter.value = { ...CAMERA_RECORDINGS_FILTER_DEFAULTS, ...user.preferences?.recordings?.cameras?.[props.cameraId] };
    filterRestored.value = true;
  },
  { immediate: true },
);

watch([regionsKey, serverFilter], () => {
  regionFillPages = 0;
});

watch([() => displayItems.value.length, hasMore, isLoading, regionsKey], ([count, more, loading]) => {
  if (!gridSearch?.regions.value.length || !more || loading) return;
  if (count >= REGION_FILL_ITEMS || regionFillPages >= REGION_FILL_PAGES) return;
  regionFillPages++;
  loadMore();
});
</script>
