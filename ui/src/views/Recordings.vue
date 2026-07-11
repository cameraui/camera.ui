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

    <RecordingsFilterSidebar
      :filters="filters"
      :cameras="availableCameras"
      :is-open="sidebarOpen"
      :is-overlay="sidebarIsOverlay"
      :semantic-search-available="semanticAvailable"
      :semantic-search-loading="semanticSearching"
      @update:filters="onFilterUpdate"
      @semantic-search="onSemanticSearch"
      @close="closeSidebar"
    />

    <Teleport to="#container" defer>
      <div v-if="sidebarOpen && sidebarIsOverlay" class="fixed top-0 left-0 right-0 bottom-0 w-full h-full bg-black/50 z-1" @click="closeSidebar" />
    </Teleport>

    <main class="relative w-full h-full" :style="{ paddingLeft: mainPaddingLeft, transition: layoutReady ? 'padding-left 200ms' : undefined }">
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

        <div
          class="px-2 h-full w-full flex flex-col"
          :class="{
            'pt-4': smBreakpoint,
            'pt-[calc(40px+2rem)]': !smBreakpoint,
          }"
        >
          <div v-if="displayEvents.length || isSemanticActive" class="flex items-center gap-2 mb-2 text-xs text-muted ml-auto">
            <Button
              v-tooltip.bottom="{ value: $t('views.recordings.ungroup') }"
              :severity="ungrouped ? 'primary' : 'secondary'"
              text
              rounded
              class="cui-icon-sm"
              @click="ungrouped = !ungrouped"
            >
              <template #icon>
                <i-mdi:view-grid-outline v-if="!ungrouped" width="100%" height="100%" />
                <i-mdi:view-grid v-else width="100%" height="100%" />
              </template>
            </Button>
            <span>{{ $t('views.recordings.result_count', { count: gridItems.length }) }}</span>
            <template v-if="isSemanticActive">
              <span class="inline-flex items-center gap-1">
                <i-tabler:sparkles class="w-3 h-3" />
                {{ $t('views.recordings.semantic_results', { count: semanticEventIds.size }) }}
              </span>
            </template>
          </div>

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
              <RecordingCard
                :event="item.event"
                :camera-name="cameraMap.get(item.event.cameraId)"
                :camera="cameraById.get(item.event.cameraId)"
                :load-thumbnails="loadThumbnails"
                :semantic-score="semanticEventIds.get(item.event.id)"
                :thumbnail-override="item.thumbnailOverride"
                @scroll-to-event="() => openRecordingDialog(item.event)"
              />
            </template>
          </CuiRecordingsGrid>

          <div v-if="isLoading || semanticSearching" class="flex justify-center py-4">
            <i-svg-spinners:ring-resize width="24px" height="24px" class="text-muted" />
          </div>

          <div v-if="!displayEvents.length && !isLoading && !semanticSearching" class="flex flex-1 min-h-0 flex-col items-center justify-center w-full gap-4">
            <i-mingcute:photo-album-fill class="w-12 h-12 text-muted" />
            <span class="text-muted text-sm">{{ $t('views.recordings.no_recordings') }}</span>
          </div>
        </div>
      </div>
    </main>

    <CuiFloatingButton
      v-if="availableCameras.length"
      :tooltip-props="{ value: $t('views.recordings.export.title') }"
      :button-props="{ class: 'text-white' }"
      :icon="DownloadIcon"
      :icon-props="{ width: '26px', height: '26px' }"
      force-visible
      @click="openExportDialog"
    />
  </div>
</template>

<script setup lang="ts">
import { EventHoverPreviewKey, getPrimaryThumbnailFromCache, thumbnailToUrl, useDetectionEvents, useEventHoverPreview, useSemanticSearch } from '@camera.ui/nvr';
import DownloadIcon from '~icons/tabler/download';
import SparklesIcon from '~icons/tabler/sparkles';

import { CamerasQuery } from '@/api/routes/cameras.js';
import CameraEventDialog from '@/components/CuiDialog/templates/CameraStreamEvent/CameraStreamEvent.vue';
import ExportRecordings from '@/components/CuiDialog/templates/ExportRecordings/ExportRecordings.vue';
import RecordingsFilterSidebar from '@/components/CuiRecordings/RecordingsFilterSidebar.vue';

import type { CameraStreamEventProps } from '@/components/CuiDialog/templates/CameraStreamEvent/types.js';
import type { GridRegion } from '@/components/CuiGridSearch/types.js';
import type { RecordingsFilterState } from '@/components/CuiRecordings/types.js';
import type { EventThumbnails, GetEventsOptions } from '@camera.ui/nvr';
import type { BoundingBox, DetectionEvent } from '@camera.ui/sdk';
import type { DBCamera } from '@shared/types';

interface UngroupedItem {
  event: DetectionEvent;
  key: string;
  thumbnailOverride?: { url: string; type: string; label?: string };
}

const camerasQuery = new CamerasQuery();

const dialog = useCuiDialog();
const { t } = useI18n();
const { smBreakpoint, xlBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { isTouch } = useSharedCuiUserAgent();
const { registerScrollToTop } = useCuiTopbarSlots();

if (!isTouch.value && typeof VideoDecoder !== 'undefined') {
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

const SIDEBAR_WIDTH = 288;
const GRID_COLS = 10;
const GRID_ROWS = 11;
const TIME_RANGE_MS: Record<string, number> = {
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
};

const gridRef = useTemplateRef<{ scrollToTop: () => void }>('gridRef');
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
// Stabilized: only emits a new object reference when the serialized value actually changes.
// withRecordingInfo is always requested so the download button can gate on real footage
// even when the "only with recordings" filter is off.
const serverFilter = shallowRef<GetEventsOptions>({ state: 'ended', hasDetections: true, withRecordingInfo: true, hasRecording: true });
let _prevFilterJSON = JSON.stringify(serverFilter.value);
const ungrouped = ref(false);
const ungroupedItems = shallowRef<UngroupedItem[]>([]);

const sidebarOpen = computed(() => {
  if (xlBreakpoint.value) return true;
  return sidebarState.value === 'opened';
});

const sidebarIsOverlay = computed(() => mdBreakpoint.value);

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

const { events, isLoading, hasMore, loadMore, loadThumbnails, getCachedThumbnails } = useDetectionEvents({
  availableCameraIds: allCameraIds,
  cameraIds,
  realtime: true,
  pageSize: 40,
  filter: serverFilter,
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

  // Slider value is in display % (0-1), convert back to raw cosine score using the same
  // normalization as RecordingCard: displayPct = (raw - CLIP_MIN) / (CLIP_MAX - CLIP_MIN)
  // So: raw = displayPct * (CLIP_MAX - CLIP_MIN) + CLIP_MIN
  if (isSemanticActive.value) {
    const CLIP_MIN = 0.15;
    const CLIP_MAX = 0.38;
    const minRawScore = f.minSemanticScore * (CLIP_MAX - CLIP_MIN) + CLIP_MIN;
    result = result.filter((e) => {
      const score = semanticEventIds.value.get(e.id);
      return score != null && score >= minRawScore;
    });
    result.sort((a, b) => (semanticEventIds.value.get(b.id) ?? 0) - (semanticEventIds.value.get(a.id) ?? 0));
  }

  return result;
});

const gridItems = computed<UngroupedItem[]>(() => {
  if (ungrouped.value && ungroupedItems.value.length) return ungroupedItems.value;
  return displayEvents.value.map((event) => ({ event, key: event.id }));
});

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

function boxOverlapsRegions(box: BoundingBox, regions: GridRegion[]): boolean {
  if (regions.length === 0) return true;
  const cellW = 1 / GRID_COLS;
  const cellH = 1 / GRID_ROWS;
  const bCol1 = box.x / cellW;
  const bCol2 = (box.x + box.width) / cellW;
  const bRow1 = box.y / cellH;
  const bRow2 = (box.y + box.height) / cellH;
  for (const r of regions) {
    if (bCol2 > r.col && bCol1 < r.col + r.w && bRow2 > r.row && bRow1 < r.row + r.h) {
      return true;
    }
  }
  return false;
}

function flattenCachedThumbnails(thumbs: EventThumbnails, event: DetectionEvent): { key: string; url: string; type: string; label?: string }[] {
  const entries: { key: string; url: string; type: string; label?: string }[] = [];

  if (thumbs.attributes) {
    for (const [key, data] of Object.entries(thumbs.attributes)) {
      const url = thumbnailToUrl(data);
      if (!url) continue;
      const colonIdx = key.indexOf(':');
      entries.push({
        key: `${event.id}:attr:${key}`,
        url,
        type: colonIdx >= 0 ? key.substring(0, colonIdx) : key,
        label: colonIdx >= 0 ? key.substring(colonIdx + 1) : undefined,
      });
    }
  }

  if (thumbs.detections) {
    for (const [key, data] of Object.entries(thumbs.detections)) {
      const url = thumbnailToUrl(data);
      if (!url) continue;
      const label = key.includes(':') ? key.split(':').slice(1).join(':') : key;
      entries.push({ key: `${event.id}:det:${key}`, url, type: label });
    }
  }

  if (thumbs.scenes) {
    for (const [key, data] of Object.entries(thumbs.scenes)) {
      const url = thumbnailToUrl(data);
      if (!url) continue;
      entries.push({ key: `${event.id}:scene:${key}`, url, type: 'scene' });
    }
  }

  // Deduplicate by URL (same thumbnail data can appear in scenes + detections)
  const seen = new Set<string>();
  return entries.filter((e) => {
    if (seen.has(e.url)) return false;
    seen.add(e.url);
    return true;
  });
}

function buildUngroupedItems(events: DetectionEvent[]): UngroupedItem[] {
  const items: UngroupedItem[] = [];
  for (const event of events) {
    const thumbs = getCachedThumbnails(event.id);
    if (!thumbs) {
      items.push({ event, key: event.id });
      continue;
    }
    const entries = flattenCachedThumbnails(thumbs, event);

    const primaryInfo = getPrimaryThumbnailFromCache(thumbs, event);
    if (primaryInfo.url) {
      const idx = entries.findIndex((e) => e.url === primaryInfo.url);
      if (idx > 0) entries.unshift(...entries.splice(idx, 1));
    }

    if (entries.length <= 1) {
      items.push({ event, key: event.id });
    } else {
      entries.forEach((entry, i) => {
        items.push({
          event,
          key: i === 0 ? event.id : entry.key,
          thumbnailOverride: { url: entry.url, type: entry.type, label: entry.label },
        });
      });
    }
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

function openRecordingDialog(event: DetectionEvent): void {
  const camera = cameraById.value.get(event.cameraId);
  if (!camera) return;

  dialog.openComponentDialog<CameraStreamEventProps>(CameraEventDialog, {
    data: {
      title: camera.name,
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

watch(ungrouped, (isUngrouped) => {
  if (isUngrouped) {
    ungroupedItems.value = buildUngroupedItems(displayEvents.value);
  } else {
    ungroupedItems.value = [];
  }
});

// Incremental update: keep existing items, add new, remove stale
watch(displayEvents, (events) => {
  if (!ungrouped.value) return;

  const currentEventIds = new Set(events.map((e) => e.id));
  const existingEventIds = new Set(ungroupedItems.value.map((item) => item.event.id));

  let updated = ungroupedItems.value.filter((item) => currentEventIds.has(item.event.id));

  const newEvents = events.filter((e) => !existingEventIds.has(e.id));
  if (newEvents.length) {
    const newItems = buildUngroupedItems(newEvents);
    updated = [...newItems, ...updated];
  }

  ungroupedItems.value = updated;
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
