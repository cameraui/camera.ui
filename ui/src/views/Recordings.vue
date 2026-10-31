<template>
  <div>
    <CuiTopbarSlot position="center">
      <span class="font-semibold text-xl truncate">{{ $t('views.recordings.title') }}</span>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="left">
      <Button id="recordings-sidebar-toggle" severity="secondary" class="cui-button p-2 text-color" text rounded @click="toggleSidebar">
        <template #icon>
          <i-mage:filter v-if="sidebarState === 'closed'" width="100%" height="100%" />
          <i-mage:filter-fill v-else width="100%" height="100%" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <CuiTopbarSlot position="right">
      <Button severity="secondary" class="cui-button p-2 text-color" text rounded @click="viewMenuRef?.toggleMenu($event)">
        <template #icon>
          <i-carbon:settings width="100%" height="100%" />
        </template>
      </Button>
    </CuiTopbarSlot>

    <RecordingsFilterSidebar
      :filters="filters"
      :cameras="availableCameras"
      :is-open="sidebarOpen"
      :is-overlay="sidebarIsOverlay"
      :result-count="gridItems.length"
      :result-total="resultTotal"
      :result-capped="stats?.capped"
      :semantic-count="isSemanticActive ? semanticCount : undefined"
      :semantic-search-available="semanticAvailable"
      :semantic-search-loading="semanticSearching"
      :assistant-search-available="assistantAvailable"
      :assistant-search-loading="assistantSearching"
      :assistant-search-note="assistantNote"
      :image-search-available="imageSearchAvailable"
      @update:filters="onFilterUpdate"
      @semantic-search="onSemanticSearch"
      @assistant-search="onAssistantSearch"
      @image-search="openImageSearch"
      @close="closeSidebar"
    />

    <Teleport to="#container" defer>
      <div v-if="sidebarOpen && sidebarIsOverlay" class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-1" @click="closeSidebar" />
    </Teleport>

    <main
      ref="reindexAnchorRef"
      class="relative w-full h-full"
      :style="{ paddingLeft: mainPaddingLeft, transition: layoutReady ? 'padding-left 200ms' : undefined }"
      @dragenter="onImageDragEnter"
      @dragleave="onImageDragLeave"
      @dragover.prevent
      @drop.prevent="onImageDrop"
    >
      <div v-if="imageDrags > 0" class="image-drop-overlay">
        <i-tabler:photo-search class="w-10 h-10" />
        <span class="text-sm font-semibold">{{ $t('views.recordings.image_drop_overlay') }}</span>
      </div>

      <div class="w-full h-full relative">
        <div v-if="!smBreakpoint" class="w-full flex flex-row h-[calc(40px+1rem)] py-2 items-center fixed z-10">
          <div class="ml-2" />

          <Button v-if="!xlBreakpoint" id="recordings-sidebar-toggle" severity="secondary" class="mr-2 cui-icon-lg relative z-2" text rounded @click="toggleSidebar">
            <template #icon>
              <i-solar:round-alt-arrow-left-bold v-if="sidebarOpen" width="100%" height="100%" />
              <i-solar:round-alt-arrow-right-bold v-else width="100%" height="100%" />
            </template>
          </Button>

          <h1 class="relative z-2 page-title !m-0">
            {{ $t('views.recordings.title') }}
          </h1>

          <div class="gradient-blur rotate-180 !h-[70px]">
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
            <div></div>
          </div>
        </div>

        <div v-if="!smBreakpoint" class="fixed right-0 z-10 h-[calc(40px+1rem)] py-2 pr-safe-offset-2 flex items-center">
          <Button
            v-tooltip.bottom="{ value: $t('views.recordings.view_options') }"
            severity="secondary"
            text
            rounded
            class="cui-icon-lg relative z-2"
            @click="viewMenuRef?.toggleMenu($event)"
          >
            <template #icon>
              <i-carbon:settings width="100%" height="100%" />
            </template>
          </Button>
        </div>

        <div
          class="px-2 h-full w-full flex flex-col"
          :class="{
            'pt-4': smBreakpoint,
            'pt-[calc(40px+2rem)]': !smBreakpoint,
          }"
        >
          <SimilarSearchBar
            v-if="isSimilarActive"
            :crops="similarCrops"
            :object-label="similarRequests[0]?.objectLabel"
            :results="similarResults"
            :count="similarMatches.length"
            :searching="similarSearching || !similarAvailable"
            :license-required="similarLicenseRequired"
            @close="closeSimilarSearch"
          />

          <CuiRecordingsGrid
            v-if="gridItems.length"
            ref="gridRef"
            :items="gridItems"
            :min-item-width="smBreakpoint ? 160 : 180"
            :gap="8"
            :has-more="gridHasMore"
            :load-more="gridLoadMore"
            :item-key="itemKey"
            class="flex-1 min-h-0"
            :style="{ '--cui-scroll-end': 'calc(var(--cui-bottom-gap) - 8px)' }"
          >
            <template #item="{ item }">
              <EpisodeCard v-if="item.episode" :episode="item.episode" :camera-by-id="cameraById" fluid :click-disabled="selectionMode" />
              <RecordingCard
                v-else
                :event="item.event"
                :camera-name="cameraMap.get(item.event.cameraId)"
                :camera="cameraById.get(item.event.cameraId)"
                :semantic-score="semanticEventIds.get(item.event.id)"
                :seg-index="item.segIndex"
                :selection-mode="selectionMode && item.event.state === 'ended'"
                :selected="selectedIds.has(item.event.id)"
                :sibling-active="item.segIndex !== undefined && hoveredEventId === item.event.id"
                @select="toggleSelection(item.event.id)"
                @scroll-to-event="(ts: number) => openRecordingDialog(item.event, ts)"
                @open-trace="(atMs?: number) => openTraceDialog(item.event, atMs)"
                @segment-hover="hoveredEventId = $event"
              />
            </template>
          </CuiRecordingsGrid>

          <CuiRecordingsGrid
            v-else-if="listLoading"
            :items="SKELETON_ITEMS"
            :min-item-width="smBreakpoint ? 160 : 180"
            :gap="8"
            :item-key="skeletonKey"
            class="flex-1 min-h-0 pointer-events-none"
          >
            <template #item>
              <Skeleton width="100%" height="100%" class="rounded-xl" />
            </template>
          </CuiRecordingsGrid>

          <div v-if="(listLoading && gridItems.length && !gridRef?.loadingMore) || semanticSearching" class="flex justify-center py-4">
            <i-svg-spinners:ring-resize width="24px" height="24px" class="text-muted" />
          </div>

          <div v-if="showEmptyState" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
            <i-mingcute:photo-album-fill class="w-12 h-12 text-muted" />
            <span class="text-muted text-sm">{{ emptyStateText }}</span>
            <Button
              v-if="loadFailed && !eventsUnavailable && !isSimilarActive && !filterNeedsLicense"
              severity="secondary"
              class="cui-button-small"
              :label="$t('views.recordings.load_failed_retry')"
              @click="reloadEvents"
            />
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="isAdmin && availableCameras.length"
      class="fixed z-10"
      :class="reindexHidden ? 'scale-0 opacity-0' : 'scale-100 opacity-100'"
      :style="{
        left: reindexHidden ? `calc(${mainPaddingLeft} + 0.75rem + var(--safe-area-inset-left))` : `calc(${reindexAnchorLeft}px + ${mainPaddingLeft} + 0.75rem)`,
        bottom: bottomPadding,
        transition: layoutReady ? 'left 200ms, transform 200ms ease-in-out, opacity 200ms ease-in-out' : undefined,
      }"
    >
      <Button
        severity="secondary"
        rounded
        class="shadow-lg"
        :disabled="reindexStatus?.running"
        :label="
          reindexChecking
            ? $t('views.recordings.reindex.checking')
            : reindexStatus?.running
              ? $t('views.recordings.reindex.progress', { done: reindexStatus.done, total: reindexStatus.total })
              : $t('views.recordings.reindex.button')
        "
        @click="openReindexDialog"
      >
        <template #icon>
          <SpinnerIcon v-if="reindexStatus?.running" />
          <ReindexIcon v-else />
        </template>
      </Button>
    </div>

    <CuiFloatingButtonGroup v-if="availableCameras.length" :force-visible="selectionMode" :scroll-hidden="scrollHidden">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          v-if="isAdmin && listedEvents.length && !isSimilarActive"
          grouped
          :tooltip-props="{ value: $t('views.recordings.select') }"
          :button-props="{ severity: 'secondary' }"
          :icon="SelectIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="enterSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('views.recordings.export.title') }"
          :button-props="{ class: 'text-white' }"
          :icon="DownloadIcon"
          :icon-props="{ width: '26px', height: '26px' }"
          @click="openExportDialog"
        />
      </template>

      <template v-else>
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.cancel_selection') }"
          :button-props="{ severity: 'secondary' }"
          :icon="CloseIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="exitSelectionMode"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: allSelected ? $t('components.form.tooltip.deselect_all') : $t('components.form.tooltip.select_all') }"
          :button-props="{ severity: allSelected ? 'primary' : 'secondary' }"
          :icon="SelectAllIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="toggleSelectAll"
        />
        <CuiFloatingButton
          grouped
          :tooltip-props="{ value: $t('components.form.tooltip.delete_selected') }"
          :button-props="{ severity: 'danger', disabled: !selectedIds.size || bulkBusy }"
          :icon="TrashIcon"
          :icon-props="{ width: '100%', height: '100%' }"
          @click="confirmBulkDelete"
        />
      </template>
    </CuiFloatingButtonGroup>

    <CuiMenu
      ref="viewMenuRef"
      :items="viewMenuItems"
      :auto-hide="false"
      :popover="{
        pt: {
          root: { class: 'w-[22rem]' },
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { useClipReindex, useDetectionEvents, useEventStore, useNvrDataEpoch, useSemanticSearch, useSimilarSearch } from '@camera.ui/nvr';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import CloseIcon from '~icons/mdi/close';
import ReindexIcon from '~icons/mdi/database-refresh-outline';
import TrashIcon from '~icons/mdi/delete-outline';
import SpinnerIcon from '~icons/svg-spinners/ring-resize';
import SelectIcon from '~icons/tabler/dots-filled';
import DownloadIcon from '~icons/tabler/download';
import SparklesIcon from '~icons/tabler/sparkles';

import { AssistantQuery, searchAssistantFilters } from '@/api/routes/assistant.js';
import { CamerasQuery } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';
import ClipReindexDialog from '@/components/CuiDialog/templates/ClipReindex/ClipReindex.vue';
import ExportRecordings from '@/components/CuiDialog/templates/ExportRecordings/ExportRecordings.vue';
import SimilarImageSearchDialog from '@/components/CuiDialog/templates/SimilarImageSearch/SimilarImageSearch.vue';
import { boxOverlapsRegions } from '@/components/CuiGridSearch/utils.js';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import RecordingsFilterSidebar from '@/components/CuiRecordings/RecordingsFilterSidebar.vue';
import { buildUngroupedItems, newestFirst } from '@/components/CuiRecordings/ungrouped.js';
import { mergeSimilarItems, similarItems } from '@/components/CuiSimilarResults/utils.js';
import { provideEventHoverPreview } from '@/composables/provideEventHoverPreview.js';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { SimilarImageSearchProps } from '@/components/CuiDialog/templates/SimilarImageSearch/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { RecordingsFilterState } from '@/components/CuiRecordings/types.js';
import type { UngroupedItem } from '@/components/CuiRecordings/ungrouped.js';
import type { GetEventsOptions, RecordedEvent, SimilarOptions, TextSearchOptions } from '@camera.ui/nvr';
import type { DBCamera, DBRecordingsFilters } from '@shared/types';

const assistantQuery = new AssistantQuery();
const camerasQuery = new CamerasQuery();
const usersQuery = new UsersQuery();

const dialog = useCuiDialog();
const authStore = useAuthStore();
const { bottombarHeight } = useSharedCuiStates();
const { status: reindexStatus, checking: reindexChecking } = useClipReindex();

const { openEventTrace } = useEventTraceDialog();
const { requests: similarRequests, closeSimilarSearch } = useSimilarSearchRoute();
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
const toast = useCuiToast();
const { t, locale } = useI18n();
const { smBreakpoint, xlBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { registerScrollToTop } = useCuiTopbarSlots();

provideEventHoverPreview(20);

const {
  result: semanticResult,
  results: semanticResults,
  isSearching: semanticSearching,
  isAvailable: semanticAvailable,
  hasSearched: semanticHasSearched,
  search: runSemanticSearch,
  loadMore: loadMoreSemantic,
  clear: clearSemantic,
} = useSemanticSearch();

const {
  results: similarResults,
  isSearching: similarSearching,
  isAvailable: similarAvailable,
  licenseRequired: similarLicenseRequired,
  search: runSimilarSearch,
  clear: clearSimilar,
} = useSimilarSearch();

const nvrDataEpoch = useNvrDataEpoch();

const { data: assistantStatus } = assistantQuery.getAssistantStatusQuery();
const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: currentUser, isError: userLoadFailed } = usersQuery.getUserQuery(computed(() => authStore.user?.username ?? ''));

const SIDEBAR_WIDTH = 288;
const SKELETON_ITEMS = Array.from({ length: 24 }, (_, index) => index);
const DEFAULT_FILTERS: RecordingsFilterState = {
  contentKind: 'all',
  favoritesOnly: false,
  search: '',
  semanticQuery: '',
  filterLogicTriggers: 'or',
  filterLogicAttributes: 'or',
  rooms: [],
  cameraIds: [],
  timeRange: null,
  customDateRange: null,
  eventTypes: [],
  audioLabels: [],
  hasAttributes: [],
  vehicleColors: [],
  vehicleTypes: [],
  sensorEvents: [],
  gridRegions: [],
  minConfidence: 0.5,
  minSemanticScore: 0.5,
  onlyWithRecordings: true,
};
const TIME_RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

const gridRef = useTemplateRef<{ scrollToTop: () => void; scrollY: number; loadingMore: boolean }>('gridRef');
const viewMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('viewMenuRef');
const reindexAnchorRef = useTemplateRef<HTMLElement>('reindexAnchorRef');
const serverFilter = shallowRef<GetEventsOptions>({ hasDetections: true, withRecordingInfo: true, hasRecording: true });
const ungroupedItems = shallowRef<UngroupedItem[]>([]);
const sidebarState = ref<'opened' | 'closed'>('closed');
const layoutReady = ref(false);
const filters = ref<RecordingsFilterState>({ ...DEFAULT_FILTERS });
const assistantSearching = ref(false);
const assistantNote = ref('');
const imageDrags = ref(0);
const rangeStartMs = ref<number>();
const ungrouped = ref(false);
const filtersRestored = ref(false);
const hoveredEventId = ref<string | null>(null);
const semanticText = ref('');
const semanticThreshold = refDebounced(
  computed(() => filters.value.minSemanticScore),
  300,
);

let ungroupedTouched = false;
let savedFilterJSON = '';
let lastSemanticKey = '';
let _prevFilterJSON = JSON.stringify(serverFilter.value);

const { left: reindexAnchorLeft } = useElementBounding(reindexAnchorRef);

const bottomPadding = computed(() => {
  const isBottomVisible = bottombarHeight.value > 0;
  const bottomOffetWithBar = 'calc(1.25rem + var(--safe-area-inset-bottom))';
  const bottomOffsetWithoutBar = 'calc(max(8px, var(--safe-area-inset-bottom)) + 0px)';
  const bottomOffset = isBottomVisible ? bottomOffetWithBar : bottomOffsetWithoutBar;
  return `calc(${bottombarHeight.value}px + ${bottomOffset})`;
});

const sidebarOpen = computed(() => {
  if (xlBreakpoint.value) return true;
  return sidebarState.value === 'opened';
});

const sidebarIsOverlay = computed(() => mdBreakpoint.value);

const scrollHidden = useScrollHide(() => gridRef.value?.scrollY ?? 0);

const reindexHidden = computed(() => {
  if (sidebarOpen.value && sidebarIsOverlay.value) return true;
  return scrollHidden.value && !reindexStatus.value?.running;
});

const mainPaddingLeft = computed(() => {
  if (mdBreakpoint.value) return '0px';
  return sidebarOpen.value ? `${SIDEBAR_WIDTH}px` : '0px';
});

const availableCameras = computed(() => {
  return (camerasData.value?.result ?? []).map((c) => ({ id: c._id, name: c.name, room: c.room }));
});

const cameraMap = computed(() => {
  const map = new Map<string, string>();
  for (const cam of availableCameras.value) {
    map.set(cam.id, cam.name);
  }
  return map;
});

const cameraById = computed(() => {
  const map = new Map<string, DBCamera>();
  for (const cam of camerasData.value?.result ?? []) {
    map.set(cam._id, cam);
  }
  return map;
});

const roomCameraIds = computed(() => {
  const rooms = filters.value.rooms;
  const cameras = rooms.length > 0 ? availableCameras.value.filter((c) => rooms.includes(c.room ?? '')) : availableCameras.value;
  return cameras.map((c) => c.id);
});

const cameraIds = computed(() => filters.value.cameraIds.filter((id) => roomCameraIds.value.includes(id)));

const allCameraIds = computed(() => roomCameraIds.value);

const episodesOnly = computed(() => filters.value.contentKind === 'episodes');

const contentFiltered = computed(() => {
  const f = filters.value;
  return (
    f.search.trim() !== '' ||
    f.eventTypes.length > 0 ||
    f.audioLabels.length > 0 ||
    f.hasAttributes.length > 0 ||
    f.vehicleColors.length > 0 ||
    f.vehicleTypes.length > 0 ||
    f.sensorEvents.length > 0 ||
    f.minConfidence !== 0.5
  );
});

const episodesWanted = computed(() => {
  const f = filters.value;
  return f.contentKind !== 'events' && (episodesOnly.value || (!contentFiltered.value && !f.gridRegions.length));
});

registerScrollToTop(() => gridRef.value?.scrollToTop());

const {
  events,
  episodes,
  isLoading,
  hasMore,
  episodesHasMore,
  stats,
  loadMore,
  loadMoreEpisodes,
  deleteEvents,
  reset: reloadEvents,
  loadFailed,
  licenseRequired: filterNeedsLicense,
  pluginUnavailable: eventsUnavailable,
} = useDetectionEvents({
  availableCameraIds: allCameraIds,
  cameraIds,
  realtime: true,
  pageSize: 40,
  filter: serverFilter,
  withEpisodes: episodesWanted,
  withStats: true,
  enabled: () => filtersRestored.value || userLoadFailed.value,
});

const semanticEventIds = computed(() => {
  const map = new Map<string, number>();
  for (const r of semanticResults.value ?? []) {
    const existing = map.get(r.eventId);
    if (!existing || r.score > existing) {
      map.set(r.eventId, r.score);
    }
  }
  return map;
});

const isSemanticActive = computed(() => semanticHasSearched.value && !episodesOnly.value);

const semanticEvents = computed<RecordedEvent[]>(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  eventStore.storeVersion.value;
  const inline = new Map((semanticResult.value?.events ?? []).map((event) => [event.id, event]));
  const regions = filters.value.gridRegions;
  const result: RecordedEvent[] = [];
  for (const match of semanticResults.value) {
    const event = eventStore.getEvent(match.eventId) ?? inline.get(match.eventId);
    if (event && (!regions.length || inGridRegions(event, regions))) result.push(event);
  }
  return result;
});

const semanticItems = computed<UngroupedItem[]>(() =>
  ungrouped.value ? buildUngroupedItems(semanticEvents.value, true) : semanticEvents.value.map((event) => ({ event, key: event.id })),
);

const semanticCount = computed<number | string>(() => {
  const more = semanticResult.value?.hasMore || semanticResult.value?.truncated;
  return more ? `${semanticEvents.value.length}+` : semanticEvents.value.length;
});

const isSimilarActive = computed(() => similarRequests.value.length > 0);

const similarCrops = computed(() => similarRequests.value.flatMap((request) => (request.crop ? [request.crop] : [])));

const similarMatches = computed<UngroupedItem[]>(() =>
  mergeSimilarItems(similarResults.value.map((result) => similarItems(result, 100))).map(({ event, key, segIndex }) => ({ event, key, segIndex })),
);

const similarOptions = computed<SimilarOptions>(() => {
  const f = filters.value;
  const scoped = cameraIds.value.length ? cameraIds.value : f.rooms.length ? roomCameraIds.value : [];
  const custom = f.timeRange === 'custom' ? f.customDateRange : null;
  return {
    cameraIds: scoped.length ? scoped : undefined,
    startMs: custom ? custom[0].getTime() : rangeStartMs.value,
    endMs: custom ? custom[1].getTime() : undefined,
  };
});

const semanticOptions = computed<TextSearchOptions>(() => ({
  ...similarOptions.value,
  filter: toServerFilter(filters.value),
}));

const listLoading = computed(() => (isSimilarActive.value ? similarSearching.value : isLoading.value));

const showEmptyState = computed(() => {
  if (isSimilarActive.value) {
    return similarResults.value.some((result) => result.mode !== 'none') && !similarMatches.value.length && !similarSearching.value;
  }
  return !listedEvents.value.length && !isLoading.value && !semanticSearching.value;
});

const emptyStateText = computed(() => {
  if (isSimilarActive.value) return t('views.recordings.similar_empty');
  if (filterNeedsLicense.value) return t('views.recordings.vehicle_filter_license');
  if (eventsUnavailable.value) return t('views.recordings.recordings_unavailable');
  // a query that failed says nothing about what is recorded
  if (loadFailed.value) return t('views.recordings.load_failed');
  return t('views.recordings.no_recordings');
});

const displayEvents = computed(() => {
  let result = events.value.filter((e) => e.state === 'ended' || (e.segments?.length ?? 0) > 0);
  const f = filters.value;

  if (rangeStartMs.value !== undefined) {
    const cutoff = rangeStartMs.value;
    result = result.filter((e) => e.startTime >= cutoff);
  }

  if (f.gridRegions.length > 0) {
    result = result.filter((e) => inGridRegions(e, f.gridRegions));
  }

  if (f.favoritesOnly) {
    result = result.filter((e) => e.favorite);
  }

  return result;
});

const listedEvents = computed(() => (isSemanticActive.value ? semanticEvents.value : displayEvents.value));

const assistantAvailable = computed(() => assistantStatus.value?.state === 'ready');

const episodeGridItems = computed<UngroupedItem[]>(() => {
  if (filters.value.contentKind === 'events') return [];
  const f = filters.value;

  if (!episodesOnly.value) {
    if (isSemanticActive.value) return [];
    if (f.gridRegions.length > 0) return [];
    if (contentFiltered.value) return [];
  }

  let cutoff = 0;
  if (hasMore.value && !episodesOnly.value) {
    cutoff = Infinity;
    for (const event of events.value) {
      cutoff = Math.min(cutoff, event.thumbnailAt ?? event.startTime);
    }
  }

  const items: UngroupedItem[] = [];
  for (const episode of episodes.value) {
    if (cutoff && episode.endTime < cutoff) continue;
    items.push({ event: undefined as unknown as RecordedEvent, key: `episode:${episode.id}`, episode });
  }
  return items;
});
const gridItems = computed<UngroupedItem[]>(() => {
  if (isSimilarActive.value) return similarMatches.value;
  if (isSemanticActive.value) return semanticItems.value;
  if (episodesOnly.value) return [...episodeGridItems.value].sort(newestFirst);
  const items: UngroupedItem[] =
    ungrouped.value && ungroupedItems.value.length ? [...ungroupedItems.value] : displayEvents.value.map((event) => ({ event, key: event.id }));
  if (episodeGridItems.value.length) {
    items.push(...episodeGridItems.value);
    items.sort(newestFirst);
  }
  return items;
});

const resultTotal = computed<number | undefined>(() => {
  const s = stats.value;
  const f = filters.value;
  if (!s || !hasMore.value || isSemanticActive.value || f.gridRegions.length > 0 || (f.timeRange && rangeStartMs.value === undefined)) return undefined;
  if (episodesOnly.value) return s.episodes;
  const cards = ungrouped.value ? s.segments : s.total;
  if (cards === undefined) return undefined;
  const withEpisodes = f.contentKind !== 'events' && !contentFiltered.value;
  return cards + (withEpisodes ? s.episodes : 0);
});

const isAdmin = computed(() => hasPermission(undefined, 'admin'));
const imageSearchAvailable = computed(() => isAdmin.value && similarAvailable.value);

const gridHasMore = computed(() => {
  if (isSimilarActive.value) return false;
  if (isSemanticActive.value) return semanticResult.value?.hasMore ?? false;
  if (episodesOnly.value) return episodesHasMore.value;
  return hasMore.value || (episodesWanted.value && episodesHasMore.value);
});

const selectableEvents = computed(() => listedEvents.value.filter((e) => e.state === 'ended'));

const { selectionMode, selectedIds, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  selectableEvents,
  (event) => event.id,
);

function confirmBulkDelete() {
  const ids = [...selectedIds.value];
  if (!ids.length || bulkBusy.value) return;

  dialog.openTextDialog({
    data: {
      title: t('components.dialog.title.confirm'),
      contentText: t('views.recordings.delete_selected_confirm', { count: ids.length }),
      confirmText: t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: async () => {
      bulkBusy.value = true;
      try {
        await deleteEvents(ids);
        exitSelectionMode();
        toast.add({ severity: 'success', detail: t('views.recordings.delete_selected_done', { count: ids.length }), life: 5000 });
      } catch (error: any) {
        toast.add({ severity: 'error', detail: error?.message ?? String(error), life: 5000 });
      } finally {
        bulkBusy.value = false;
      }
    },
  });
}

const viewMenuItems = computed<MenuItem[]>(() => [
  {
    key: 'ungroup',
    label: t('views.recordings.ungroup'),
    description: t('views.recordings.ungroup_hint'),
    toggle: true,
    toggleState: ungrouped.value,
    onClick: () => {
      ungroupedTouched = true;
      ungrouped.value = !ungrouped.value;
      authStore.updateUser({ preferences: { recordings: { ungrouped: ungrouped.value } } });
    },
  },
  {
    key: 'onlyWithRecordings',
    label: t('views.recordings.only_with_recordings'),
    description: t('views.recordings.only_with_recordings_hint'),
    toggle: true,
    toggleState: filters.value.onlyWithRecordings,
    onClick: () => {
      filters.value = { ...filters.value, onlyWithRecordings: !filters.value.onlyWithRecordings };
    },
  },
  ...(isAdmin.value
    ? [
        {
          key: 'favoritesOnly',
          label: t('views.recordings.favorites_only'),
          description: t('views.recordings.favorites_hint'),
          toggle: true,
          toggleState: filters.value.favoritesOnly,
          onClick: () => {
            filters.value = { ...filters.value, favoritesOnly: !filters.value.favoritesOnly };
          },
        },
      ]
    : []),
]);

function openReindexDialog(): void {
  dialog.openComponentDialog(ClipReindexDialog, {
    data: {
      title: t('views.recordings.reindex.title'),
      contentProps: {},
      confirmText: t('views.recordings.reindex.start'),
    },
  });
}

function openExportDialog(): void {
  dialog.openComponentDialog(ExportRecordings, {
    data: {
      title: t('views.recordings.export.title'),
      contentProps: {
        cameras: availableCameras.value,
        preselect: filters.value.cameraIds?.length ? filters.value.cameraIds : [],
      },
      confirmText: t('views.recordings.export.confirm'),
    },
  });
}

function toggleSidebar() {
  const oldState = sidebarState.value;
  sidebarState.value = oldState === 'opened' ? 'closed' : 'opened';
}

function closeSidebar() {
  sidebarState.value = 'closed';
}

function onFilterUpdate(newFilters: RecordingsFilterState): void {
  if (!newFilters.semanticQuery?.trim() && filters.value.semanticQuery?.trim()) {
    clearSemantic();
  }
  filters.value = newFilters;
}

async function onAssistantSearch(text: string): Promise<void> {
  assistantSearching.value = true;
  assistantNote.value = '';
  try {
    const result = await searchAssistantFilters(text, locale.value, Intl.DateTimeFormat().resolvedOptions().timeZone);
    const query = result.filters.semanticQuery.trim();
    // set before the filters, or the rerun watch searches the previous text
    semanticText.value = query;
    onFilterUpdate({ ...DEFAULT_FILTERS, ...result.filters, favoritesOnly: isAdmin.value && result.filters.favoritesOnly });
    // the search takes the filters along, let them settle first
    await nextTick();
    if (query) searchSemantic(false);
    else clearSemantic();
    assistantNote.value = result.note;
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error?.response?.data?.message ?? t('views.recordings.assistant_search_failed'), life: 5000 });
  } finally {
    assistantSearching.value = false;
  }
}

function onSemanticSearch(query: string): void {
  semanticText.value = query.trim();
  if (!semanticText.value) {
    clearSemantic();
    return;
  }
  searchSemantic(true);
}

function searchSemantic(force: boolean): void {
  const options = { ...semanticOptions.value, threshold: filters.value.minSemanticScore };
  const key = JSON.stringify([semanticText.value, options]);
  if (!force && key === lastSemanticKey && (semanticSearching.value || semanticHasSearched.value)) return;
  lastSemanticKey = key;
  runSemanticSearch(semanticText.value, options);
}

function gridLoadMore(): Promise<void> {
  if (isSemanticActive.value) return loadMoreSemantic();
  if (episodesOnly.value || !hasMore.value) return loadMoreEpisodes();
  return loadMore();
}

function inGridRegions(event: RecordedEvent, regions: RecordingsFilterState['gridRegions']): boolean {
  return event.segments.some((s) => s?.detections.some((d) => d.box && boxOverlapsRegions(d.box, regions)));
}

function toServerFilter(f: RecordingsFilterState): GetEventsOptions {
  const hasAnyContentFilter = f.eventTypes.length > 0 || f.sensorEvents.length > 0 || f.audioLabels.length > 0 || f.hasAttributes.length > 0;

  return {
    types: f.eventTypes.length > 0 ? f.eventTypes : undefined,
    triggers: f.sensorEvents.length > 0 ? f.sensorEvents : undefined,
    triggerLabels: f.audioLabels.length > 0 ? f.audioLabels : undefined,
    attributes: f.hasAttributes.length > 0 ? f.hasAttributes : undefined,
    attributeLabels: vehicleAttributeLabels(f),
    filterLogicTriggers: hasAnyContentFilter ? f.filterLogicTriggers : undefined,
    filterLogicAttributes: hasAnyContentFilter ? f.filterLogicAttributes : undefined,
    search: f.search || undefined,
    minConfidence: f.minConfidence > 0 ? f.minConfidence : undefined,
    hasDetections: !hasAnyContentFilter,
    withRecordingInfo: true,
    hasRecording: f.onlyWithRecordings || undefined,
    favoritesOnly: f.favoritesOnly || undefined,
    startedSinceMs: rangeStartMs.value,
  };
}

function savedFilters(f: RecordingsFilterState): DBRecordingsFilters {
  const { search, semanticQuery, timeRange, customDateRange, ...saved } = f;
  return saved;
}

function vehicleAttributeLabels(f: RecordingsFilterState): Record<string, string[]> | undefined {
  if (!f.vehicleColors.length && !f.vehicleTypes.length) return undefined;
  const labels: Record<string, string[]> = {};
  if (f.vehicleColors.length) labels.color = f.vehicleColors;
  if (f.vehicleTypes.length) labels.vehicle_type = f.vehicleTypes;
  return labels;
}

function itemKey(item: UngroupedItem): string {
  return item.key;
}

function skeletonKey(index: number): number {
  return index;
}

function openTraceDialog(event: RecordedEvent, atMs?: number): void {
  const camera = cameraById.value.get(event.cameraId);
  if (!camera) return;
  openEventTrace(event, camera, atMs);
}

function openImageSearch(image: File): void {
  dialog.openComponentDialog<SimilarImageSearchProps>(SimilarImageSearchDialog, {
    data: {
      title: t('components.similar.image_search_title'),
      hideConfirmButton: true,
      contentProps: { image },
    },
    dialogSize: {
      desktop: { width: '720px' },
    },
  });
}

function isFileDrag(event: DragEvent): boolean {
  return Boolean(event.dataTransfer?.types.includes('Files'));
}

function onImageDragEnter(event: DragEvent): void {
  if (imageSearchAvailable.value && isFileDrag(event)) imageDrags.value++;
}

function onImageDragLeave(event: DragEvent): void {
  if (isFileDrag(event)) imageDrags.value = Math.max(0, imageDrags.value - 1);
}

function onImageDrop(event: DragEvent): void {
  imageDrags.value = 0;
  const image = Array.from(event.dataTransfer?.files ?? []).find((file) => file.type.startsWith('image/'));
  if (image && imageSearchAvailable.value) openImageSearch(image);
}

function openRecordingDialog(event: RecordedEvent, timestamp: number): void {
  const camera = cameraById.value.get(event.cameraId);
  if (!camera) return;

  dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
    data: {
      title: camera.name,
      dedupeKey: `camera-event:${camera._id}:${timestamp}`,
      stayActive: true,
      hideCancelButton: true,
      hideConfirmButton: true,
      contentProps: {
        camera,
        eventTimestamp: timestamp,
      },
      headerActions: event.segments?.some((s) => s?.description)
        ? [
            {
              icon: SparklesIcon,
              toggle: true,
              onClick: () => {},
            },
          ]
        : undefined,
      draggable: true,
      blockDragOnSelectors: ['.p-dialog-body'],
      dismissableMask: false,
      modal: false,
      dialogContentClass: '!px-0 h-full',
      goTo: `/cameras/${camera.name}?startTs=${timestamp}`,
    },
    dialogSize: {
      desktop: {
        maxWidth: '800px',
        maxHeight: 'calc(100vh - max(1rem, var(--safe-area-inset-top)) - max(1rem, var(--safe-area-inset-bottom)))',
        width: '50vw',
      },
    },
  });
}

watch(xlBreakpoint, (isXl) => {
  if (isXl) {
    sidebarState.value = 'closed';
  }
});

watch(
  () => filters.value.timeRange,
  (range) => {
    rangeStartMs.value = range && TIME_RANGE_MS[range] ? Date.now() - TIME_RANGE_MS[range] : undefined;
  },
  { immediate: true },
);

watch(
  filters,
  (f) => {
    const next = toServerFilter(f);
    const nextJSON = JSON.stringify(next);
    if (nextJSON !== _prevFilterJSON) {
      _prevFilterJSON = nextJSON;
      serverFilter.value = next;
    }
  },
  { deep: true, immediate: true },
);

watch(
  currentUser,
  (u) => {
    if (!u || ungroupedTouched) return;
    const saved = u.preferences?.recordings?.ungrouped;
    if (saved !== undefined) ungrouped.value = saved;
  },
  { immediate: true },
);

watch(
  currentUser,
  (u) => {
    if (!u || filtersRestored.value) return;
    filters.value = { ...filters.value, ...u.preferences?.recordings?.filters };
    savedFilterJSON = JSON.stringify(savedFilters(filters.value));
    filtersRestored.value = true;
  },
  { immediate: true },
);

watchDebounced(
  () => JSON.stringify(savedFilters(filters.value)),
  (json) => {
    if (!filtersRestored.value || json === savedFilterJSON) return;
    savedFilterJSON = json;
    authStore.updateUser({ preferences: { recordings: { filters: savedFilters(filters.value) } } });
  },
  { debounce: 500 },
);

watch(
  [similarRequests, () => JSON.stringify(similarOptions.value), similarAvailable, nvrDataEpoch],
  ([requests, , available]) => {
    if (!requests.length) clearSimilar();
    else if (available)
      runSimilarSearch(
        requests.map((request) => request.query),
        similarOptions.value,
      );
  },
  { immediate: true },
);

watch([ungrouped, displayEvents], ([isUngrouped, events]) => {
  ungroupedItems.value = isUngrouped ? buildUngroupedItems(events) : [];
});

watch(
  () => JSON.stringify([semanticOptions.value, semanticThreshold.value]),
  () => {
    if (semanticHasSearched.value && semanticText.value) searchSemantic(false);
  },
);

watch(nvrDataEpoch, () => {
  if (semanticText.value) searchSemantic(true);
});

watch(
  () => filters.value.cameraIds,
  (ids) => {
    if (ids.length !== 1 && filters.value.gridRegions.length > 0) {
      filters.value = { ...filters.value, gridRegions: [] };
    }
  },
);

onMounted(() => {
  requestAnimationFrame(() => {
    layoutReady.value = true;
  });
});
</script>

<style scoped>
.image-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: color-mix(in srgb, var(--p-content-background) 80%, transparent);
  border: 2px dashed var(--p-primary-color);
  color: var(--p-primary-color);
  pointer-events: none;
}
</style>
