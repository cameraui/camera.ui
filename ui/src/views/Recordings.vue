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
      :semantic-count="isSemanticActive ? semanticEventIds.size : undefined"
      :semantic-search-available="semanticAvailable"
      :semantic-search-loading="semanticSearching"
      @update:filters="onFilterUpdate"
      @semantic-search="onSemanticSearch"
      @close="closeSidebar"
    />

    <Teleport to="#container" defer>
      <div v-if="sidebarOpen && sidebarIsOverlay" class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-1" @click="closeSidebar" />
    </Teleport>

    <main ref="reindexAnchorRef" class="relative w-full h-full" :style="{ paddingLeft: mainPaddingLeft, transition: layoutReady ? 'padding-left 200ms' : undefined }">
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

        <div v-if="!smBreakpoint" class="fixed right-0 z-10 h-[calc(40px+1rem)] py-2 pr-2 flex items-center">
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
          <CuiRecordingsGrid
            v-if="gridItems.length"
            ref="gridRef"
            :items="gridItems"
            :min-item-width="smBreakpoint ? 160 : 180"
            :gap="8"
            :has-more="hasMore"
            :load-more="loadMore"
            :item-key="(item: UngroupedItem) => item.key"
            class="flex-1 min-h-0"
          >
            <template #item="{ item }">
              <EpisodeCard v-if="item.episode" :episode="item.episode" :camera-by-id="cameraById" fluid :click-disabled="selectionMode" />
              <RecordingCard
                v-else
                :event="item.event"
                :camera-name="cameraMap.get(item.event.cameraId)"
                :camera="cameraById.get(item.event.cameraId)"
                :load-thumbnails="loadThumbnails"
                :semantic-score="semanticEventIds.get(item.event.id)"
                :seg-index="item.segIndex"
                :selection-mode="selectionMode"
                :selected="selectedIds.has(item.event.id)"
                :sibling-active="item.segIndex !== undefined && hoveredEventId === item.event.id"
                @select="toggleSelection(item.event.id)"
                @scroll-to-event="() => openRecordingDialog(item.event)"
                @open-episode="openEpisodeDialog"
                @mouseenter="hoveredEventId = item.segIndex !== undefined ? item.event.id : null"
                @mouseleave="hoveredEventId = null"
              />
            </template>
          </CuiRecordingsGrid>

          <div v-if="isLoading || semanticSearching" class="flex justify-center py-4">
            <i-svg-spinners:ring-resize width="24px" height="24px" class="text-muted" />
          </div>

          <div v-if="!displayEvents.length && !isLoading && !semanticSearching" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
            <i-mingcute:photo-album-fill class="w-12 h-12 text-muted" />
            <span class="text-muted text-sm">{{ eventsUnavailable ? $t('views.recordings.recordings_unavailable') : $t('views.recordings.no_recordings') }}</span>
          </div>
        </div>
      </div>
    </main>

    <div
      v-if="isAdmin && availableCameras.length"
      class="fixed z-10"
      :class="reindexHidden ? 'scale-0 opacity-0' : 'scale-100 opacity-100'"
      :style="{
        left: `calc(${reindexAnchorLeft}px + ${mainPaddingLeft} + 0.75rem + env(safe-area-inset-left, 0px))`,
        bottom: `calc(${bottombarHeight}px + 1.25rem + env(safe-area-inset-bottom, 0px))`,
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

    <CuiFloatingButtonGroup v-if="availableCameras.length" :force-visible="selectionMode" :scroll-y="gridRef?.scrollY ?? 0">
      <template v-if="!selectionMode">
        <CuiFloatingButton
          v-if="isAdmin && displayEvents.length"
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
import { EventHoverPreviewKey, useClipReindex, useDetectionEvents, useEventHoverPreview, useEventStore, useSemanticSearch } from '@camera.ui/nvr';
import SelectAllIcon from '~icons/fluent/select-all-on-20-filled';
import CloseIcon from '~icons/mdi/close';
import ReindexIcon from '~icons/mdi/database-refresh-outline';
import TrashIcon from '~icons/mdi/delete-outline';
import SpinnerIcon from '~icons/svg-spinners/ring-resize';
import SelectIcon from '~icons/tabler/dots-filled';
import DownloadIcon from '~icons/tabler/download';
import SparklesIcon from '~icons/tabler/sparkles';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { UsersQuery } from '@/api/routes/users.js';
import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';
import ClipReindexDialog from '@/components/CuiDialog/templates/ClipReindex/ClipReindex.vue';
import ExportRecordings from '@/components/CuiDialog/templates/ExportRecordings/ExportRecordings.vue';
import { boxOverlapsRegions } from '@/components/CuiGridSearch/utils.js';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import RecordingsFilterSidebar from '@/components/CuiRecordings/RecordingsFilterSidebar.vue';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { RecordingsFilterState } from '@/components/CuiRecordings/types.js';
import type { GetEventsOptions, RecordedEpisode, RecordedEvent } from '@camera.ui/nvr';
import type { DBCamera } from '@shared/types';

interface UngroupedItem {
  event: RecordedEvent;
  key: string;
  segIndex?: number;
  episode?: RecordedEpisode;
}

const camerasQuery = new CamerasQuery();
const usersQuery = new UsersQuery();

const dialog = useCuiDialog();
const authStore = useAuthStore();
const { bottombarHeight } = useSharedCuiStates();
const { status: reindexStatus, checking: reindexChecking } = useClipReindex();

const { openEpisodePlayer } = useEpisodePlayerDialog();
const eventStore = useEventStore('@camera.ui/camera-ui-nvr');
const toast = useCuiToast();
const { t } = useI18n();
const { smBreakpoint, xlBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { registerScrollToTop } = useCuiTopbarSlots();

if (typeof VideoDecoder !== 'undefined') {
  const hoverPreview = useEventHoverPreview({ cacheSize: 20 });
  provide(EventHoverPreviewKey, hoverPreview);
  tryOnScopeDispose(() => hoverPreview.dispose());
}

const {
  results: semanticResults,
  isSearching: semanticSearching,
  isAvailable: semanticAvailable,
  hasSearched: semanticHasSearched,
  search: runSemanticSearch,
  clear: clearSemantic,
} = useSemanticSearch();

const { data: camerasData } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });
const { data: currentUser } = usersQuery.getUserQuery(computed(() => authStore.user?.username ?? ''));

const SIDEBAR_WIDTH = 288;
const TIME_RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

const gridRef = useTemplateRef<{ scrollToTop: () => void; scrollY: number }>('gridRef');
const viewMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('viewMenuRef');
const sidebarState = ref<'opened' | 'closed'>('closed');
const layoutReady = ref(false);
const filters = ref<RecordingsFilterState>({
  search: '',
  semanticQuery: '',
  filterLogicTriggers: 'or',
  filterLogicAttributes: 'or',
  cameraIds: [],
  timeRange: null,
  customDateRange: null,
  eventTypes: [],
  audioLabels: [],
  hasAttributes: [],
  sensorEvents: [],
  gridRegions: [],
  minConfidence: 0.5,
  minSemanticScore: 0.5,
  onlyWithRecordings: true,
});
const serverFilter = shallowRef<GetEventsOptions>({ state: 'ended', hasDetections: true, withRecordingInfo: true, hasRecording: true });
let _prevFilterJSON = JSON.stringify(serverFilter.value);
const ungrouped = ref(false);
const ungroupedItems = shallowRef<UngroupedItem[]>([]);
const hoveredEventId = ref<string | null>(null);
const reindexAnchorRef = useTemplateRef<HTMLElement>('reindexAnchorRef');

const { left: reindexAnchorLeft } = useElementBounding(reindexAnchorRef);

let ungroupedTouched = false;

const sidebarOpen = computed(() => {
  if (xlBreakpoint.value) return true;
  return sidebarState.value === 'opened';
});

const sidebarIsOverlay = computed(() => mdBreakpoint.value);

const reindexHidden = computed(() => {
  if (sidebarOpen.value && sidebarIsOverlay.value) return true;
  return (gridRef.value?.scrollY ?? 0) > 10 && !reindexStatus.value?.running;
});

const mainPaddingLeft = computed(() => {
  if (mdBreakpoint.value) return '0px';
  return sidebarOpen.value ? `${SIDEBAR_WIDTH}px` : '0px';
});

const availableCameras = computed(() => {
  return (camerasData.value?.result ?? []).map((c) => ({ id: c._id, name: c.name }));
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

const cameraIds = computed(() => filters.value.cameraIds);

const allCameraIds = computed(() => {
  return availableCameras.value.map((c) => c.id);
});

registerScrollToTop(() => gridRef.value?.scrollToTop());

const { events, isLoading, hasMore, loadMore, loadThumbnails, deleteEvents, pluginUnavailable: eventsUnavailable } = useDetectionEvents({
  availableCameraIds: allCameraIds,
  cameraIds,
  realtime: true,
  pageSize: 40,
  filter: serverFilter,
  withEpisodes: true,
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

const isSemanticActive = computed(() => semanticHasSearched.value);

const displayEvents = computed(() => {
  let result = events.value.filter((e) => e.state === 'ended');
  const f = filters.value;

  if (f.timeRange && TIME_RANGE_MS[f.timeRange]) {
    const cutoff = Date.now() - TIME_RANGE_MS[f.timeRange];
    result = result.filter((e) => e.startTime >= cutoff);
  }

  if (f.gridRegions.length > 0) {
    result = result.filter((e) => e.segments.some((s) => s.detections.some((d) => d.box && boxOverlapsRegions(d.box, f.gridRegions))));
  }

  if (isSemanticActive.value) {
    result = result.filter((e) => {
      const score = semanticEventIds.value.get(e.id);
      return score != null && score >= f.minSemanticScore;
    });
    result.sort((a, b) => (semanticEventIds.value.get(b.id) ?? 0) - (semanticEventIds.value.get(a.id) ?? 0));
  }

  return result;
});

const episodeGridItems = computed<UngroupedItem[]>(() => {
  if (ungrouped.value || isSemanticActive.value) return [];
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  eventStore.storeVersion.value;
  const f = filters.value;
  if (f.gridRegions.length > 0) return [];
  const contentFiltered =
    f.search.trim() !== '' || f.eventTypes.length > 0 || f.audioLabels.length > 0 || f.hasAttributes.length > 0 || f.sensorEvents.length > 0 || f.minConfidence !== 0.5;
  if (contentFiltered) return [];

  const scope = cameraIds.value.length > 0 ? cameraIds.value : allCameraIds.value;
  let cutoff = f.timeRange && TIME_RANGE_MS[f.timeRange] ? Date.now() - TIME_RANGE_MS[f.timeRange] : 0;
  let rangeEndMs = Infinity;
  if (f.timeRange === 'custom' && f.customDateRange) {
    cutoff = Math.max(cutoff, f.customDateRange[0].getTime());
    rangeEndMs = f.customDateRange[1].getTime();
  }

  if (hasMore.value) {
    let oldest = Infinity;
    for (const event of events.value) {
      oldest = Math.min(oldest, event.thumbnailAt ?? event.startTime);
    }
    cutoff = Math.max(cutoff, oldest);
  }

  const items: UngroupedItem[] = [];
  for (const episode of eventStore.getEpisodes()) {
    if (!episode.description) continue;
    if (cutoff && episode.endTime < cutoff) continue;
    if (episode.startTime > rangeEndMs) continue;
    if (scope.length > 0 && !episode.members.some((m) => scope.includes(m.cameraId))) continue;
    items.push({ event: undefined as unknown as RecordedEvent, key: `episode:${episode.id}`, episode });
  }
  return items;
});

function gridItemTime(item: UngroupedItem): number {
  if (item.episode) return item.episode.endTime;
  return item.event.thumbnailAt ?? item.event.startTime;
}

const gridItems = computed<UngroupedItem[]>(() => {
  if (ungrouped.value && ungroupedItems.value.length) return ungroupedItems.value;
  const items: UngroupedItem[] = displayEvents.value.map((event) => ({ event, key: event.id }));
  if (episodeGridItems.value.length) {
    items.push(...episodeGridItems.value);
    items.sort((a, b) => gridItemTime(b) - gridItemTime(a));
  }
  return items;
});

const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const { selectionMode, selectedIds, allSelected, bulkBusy, enterSelectionMode, exitSelectionMode, toggleSelectAll, toggleSelection } = useCardSelection(
  displayEvents,
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

function buildUngroupedItems(events: RecordedEvent[]): UngroupedItem[] {
  const items: UngroupedItem[] = [];
  for (const event of events) {
    const segments = event.segments ?? [];
    if (segments.length <= 1) {
      items.push({ event, key: event.id });
      continue;
    }
    segments.forEach((segment, index) => {
      if (segment) items.push({ event, key: `${event.id}:seg:${index}`, segIndex: index });
    });
  }
  return items;
}

function onFilterUpdate(newFilters: RecordingsFilterState): void {
  if (!newFilters.semanticQuery?.trim() && filters.value.semanticQuery?.trim()) {
    clearSemantic();
  }
  filters.value = newFilters;
}

function onSemanticSearch(query: string): void {
  if (!query.trim()) {
    clearSemantic();
    return;
  }
  runSemanticSearch(query);
}

async function openEpisodeDialog(episodeId: string): Promise<void> {
  let episode = eventStore.getEpisode(episodeId);
  if (!episode) {
    await eventStore.loadEpisodes({ limit: 50 });
    episode = eventStore.getEpisode(episodeId);
  }
  if (!episode) return;
  openEpisodePlayer(episode, cameraById.value);
}

function openRecordingDialog(event: RecordedEvent): void {
  const camera = cameraById.value.get(event.cameraId);
  if (!camera) return;

  dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
    data: {
      title: camera.name,
      dedupeKey: `camera-event:${camera._id}:${event.startTime}`,
      stayActive: true,
      hideCancelButton: true,
      hideConfirmButton: true,
      contentProps: {
        camera,
        eventTimestamp: event.startTime,
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
      goTo: `/cameras/${camera.name}?startTs=${event.startTime}`,
    },
    dialogSize: {
      desktop: {
        maxWidth: '800px',
        maxHeight: 'calc(100vh - max(1rem, env(safe-area-inset-top, 0px)) - max(1rem, env(safe-area-inset-bottom, 0px)))',
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
  filters,
  (f) => {
    const hasAnyContentFilter = f.eventTypes.length > 0 || f.sensorEvents.length > 0 || f.audioLabels.length > 0 || f.hasAttributes.length > 0;

    const next: GetEventsOptions = {
      types: f.eventTypes.length > 0 ? f.eventTypes : undefined,
      triggers: f.sensorEvents.length > 0 ? f.sensorEvents : undefined,
      triggerLabels: f.audioLabels.length > 0 ? f.audioLabels : undefined,
      attributes: f.hasAttributes.length > 0 ? f.hasAttributes : undefined,
      filterLogicTriggers: hasAnyContentFilter ? f.filterLogicTriggers : undefined,
      filterLogicAttributes: hasAnyContentFilter ? f.filterLogicAttributes : undefined,
      search: f.search || undefined,
      minConfidence: f.minConfidence > 0 ? f.minConfidence : undefined,
      state: 'ended',
      hasDetections: !hasAnyContentFilter,
      withRecordingInfo: true,
      hasRecording: f.onlyWithRecordings || undefined,
    };

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

watch([ungrouped, displayEvents], ([isUngrouped, events]) => {
  ungroupedItems.value = isUngrouped ? buildUngroupedItems(events) : [];
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
