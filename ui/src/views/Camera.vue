<template>
  <div
    :class="{
      'pt-2': !smBreakpoint,
      'px-2': !smBreakpoint,
    }"
  >
    <div class="w-full h-full flex flex-col lg:flex-row gap-0 lg:gap-2 relative">
      <div
        ref="cameraColumnRef"
        class="w-full flex flex-col"
        :class="{
          'h-full': !smBreakpoint,
          // 'h-[50%]': smBreakpoint,
        }"
        :style="{
          paddingRight: sideTimeline ? `calc(${timeline.width.value || 400}px + 0.5rem)` : '0px',
        }"
      >
        <div
          ref="cameraPaneRef"
          :class="{
            flex: !smBreakpoint,
            'h-full': !smBreakpoint && recordingsInSheet,
          }"
          :style="recordingsInSheet ? undefined : { maxHeight: `min(${cameraShare * 100}%, calc(100% - ${TABS_MIN_HEIGHT}px))` }"
        >
          <CuiCameraPipCard
            ref="cameraCardRef"
            :key="cameraName"
            v-model:source-role="qualityRole"
            :back-button="smBreakpoint"
            :camera-info="cameraName"
            :flat-card="smBreakpoint"
            :resizable="smBreakpoint"
            :control-microphone-button="!smBreakpoint"
            :toolbar-timeline-button="cardTimeline"
            fullscreen-timeline
            :toolbar-description-button="nvrAvailable"
            :event-description="currentDescription"
            :current-event="currentTraceEvent"
            @open-trace="openTraceAtPlayhead"
            :pip-camera="pipCameraQuery"
            @open-camera="openPipCamera"
            :camera-name-overlay="false"
            show-shortcuts
            view-transition
            class="flex-1 h-full min-w-0"
          />
        </div>

        <div
          v-if="!recordingsInSheet"
          class="group relative z-10 h-3 -my-0.5 shrink-0 flex items-center justify-center cursor-ns-resize touch-none select-none"
          @pointerdown="onSplitStart"
          @pointermove="onSplitMove"
          @pointerup="onSplitEnd"
          @pointercancel="onSplitEnd"
          @dblclick="cameraShare = CAMERA_SHARE_DEFAULT"
        >
          <div class="w-9 h-1 rounded-full bg-surface-400/50 group-hover:bg-surface-400" />
        </div>

        <Card
          v-if="!recordingsInSheet"
          class="cui-card flex-1 min-h-0"
          :pt="{
            content: { class: 'overflow-hidden h-full flex flex-col' },
            body: { class: 'h-full' },
          }"
        >
          <template #content>
            <div v-if="!isContentReady" class="h-full flex items-center justify-center">
              <ProgressSpinner class="w-[32px] h-[32px]" stroke-width="4" />
            </div>
            <Tabs v-else v-model:value="cameraTab" lazy class="h-full flex flex-col">
              <TabList class="shrink-0">
                <Tab value="0" class="pt-0 text-sm">{{ $t('views.camera.recordings') }}</Tab>
                <Tab value="1" class="pt-0 text-sm">{{ $t('views.camera.cameras') }}</Tab>
                <Tab v-if="hasPermission(undefined, 'admin')" value="2" class="pt-0 text-sm">{{ $t('views.camera.shares') }}</Tab>
              </TabList>

              <TabPanels class="camera-tab-panels px-0 pb-0 flex-1 min-h-0">
                <TabPanel value="0" class="!overflow-hidden">
                  <CuiCameraRecordings
                    v-if="cameraId"
                    :key="cameraId"
                    :camera-id="cameraId"
                    :camera-name="cameraName"
                    :camera="camera"
                    @scroll-to-event="onScrollToEvent"
                  />
                </TabPanel>
                <TabPanel value="1">
                  <CuiCameraTable :active-camera="cameraName" />
                </TabPanel>
                <TabPanel v-if="hasPermission(undefined, 'admin')" value="2">
                  <CuiCameraShares v-if="cameraId" :camera-id="cameraId" :camera-name="cameraName" />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </template>
        </Card>
      </div>

      <div
        v-if="!cardTimeline"
        v-show="!cameraCardIsFullscreen"
        id="camera-sidebar"
        ref="timelineRef"
        :class="{
          'min-w-[300px]': smBreakpoint,
          'min-w-[400px]': !smBreakpoint,
          'border-t-[1px] border-color': smBreakpoint,
          'fixed right-safe-offset-2 bottom-[var(--cui-bottom-gap)]': sideTimeline,
        }"
        :style="{
          height: `calc(100% - ${topbarOffset}px - var(--safe-area-inset-top) - 0.5rem - var(--cui-bottom-gap))`,
        }"
      />
    </div>

    <CuiBottomSheet v-if="recordingsInSheet && isContentReady" v-model="showMobileSheet" height="70vh" max-height="85vh">
      <Tabs :key="cameraName" v-model:value="cameraTab" lazy class="h-full flex flex-col">
        <TabList class="shrink-0 w-full mt-5">
          <Tab value="0" class="pt-0 text-sm flex-1">{{ $t('views.camera.recordings') }}</Tab>
          <Tab value="1" class="pt-0 text-sm flex-1">{{ $t('views.camera.cameras') }}</Tab>
          <Tab v-if="hasPermission(undefined, 'admin')" value="2" class="pt-0 text-sm flex-1">{{ $t('views.camera.shares') }}</Tab>
        </TabList>
        <TabPanels class="mobile-sheet-panels px-0 pb-0 flex-1 min-h-0">
          <TabPanel value="0" class="h-full !overflow-hidden">
            <CuiCameraRecordings v-if="cameraId" :key="cameraId" :camera-id="cameraId" :camera-name="cameraName" :camera="camera" @scroll-to-event="onScrollToEvent" />
          </TabPanel>
          <TabPanel value="1" class="h-full overflow-auto">
            <CuiCameraTable :active-camera="cameraName" />
          </TabPanel>
          <TabPanel v-if="hasPermission(undefined, 'admin')" value="2" class="h-full overflow-auto">
            <CuiCameraShares v-if="cameraId" :camera-id="cameraId" :camera-name="cameraName" />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </CuiBottomSheet>

    <Teleport :key="cameraName" :to="horizontalTimeline ? (cameraCardRef?.timelineTarget ?? '#timeline-container') : '#camera-sidebar'" defer>
      <CuiTimeline
        ref="cuiTimelineRef"
        :key="cameraName"
        v-model:segment="timelineSegment"
        :camera-ids="cameraId ? [cameraId] : []"
        :loading="!isContentReady"
        :flat-card="smBreakpoint || horizontalTimeline"
        :type="!horizontalTimeline ? 'vertical' : 'horizontal'"
        :views="timelineViews"
        :find-count="findCount"
        :show-zoom="true"
        :initial-timestamp="startTs"
        :only-events="findKeys"
        :class="{
          'absolute bottom-0 left-0 w-full h-[200px]': horizontalTimeline,
          'h-full': !horizontalTimeline,
        }"
        :card-class="{
          'h-[200px]': horizontalTimeline,
        }"
        :transparent="horizontalTimeline"
        :dark-mode="cameraCardIsFullscreen"
        :overlay-class="cameraCardIsFullscreen ? 'timeline-overlay !z-0' : undefined"
        :locale-settings="timelineLocaleSettings"
        :trim-mode="exportMode || deleteMode"
        :trim-variant="deleteMode ? 'delete' : 'export'"
        :export-available="true"
        :delete-available="isAdmin && !cameraCardIsFullscreen"
        :ignore-bottom-safe-area="!horizontalTimeline"
        :md-breakpoint="mdBreakpoint || shortBreakpoint"
        :zone-filter-active="gridSearchActive"
        :zone-has-regions="gridSearchRegions.length > 0"
        :zone-box-matcher="zoneBoxMatcher"
        @scrolling="onTimelineScroll"
        @toggle-zone-filter="toggleZoneFilter"
        @toggle-export-mode="toggleExportMode"
        @toggle-delete-mode="toggleDeleteMode"
      >
        <template #bottom-right>
          <div class="flex gap-2 items-center empty:hidden" :class="horizontalTimeline ? 'flex-row-reverse' : 'flex-col-reverse'">
            <Button
              v-if="smBreakpoint && !exportMode && !deleteMode"
              v-tooltip.left="{ value: $t('components.player.intercom') }"
              rounded
              severity="primary"
              :disabled="cameraCardRef?.micButtonDisabled ?? true"
              class="shadow-md pointer-events-auto w-[46px] h-[46px]"
              @click="cameraCardRef?.toggleMicrophone(undefined, true)"
            >
              <template #icon>
                <i-mage:microphone-fill v-if="cameraCardRef?.micActive" width="100%" height="100%" />
                <i-mage:microphone-mute-fill v-else width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="recordingsInSheet && !cameraCardIsFullscreen && !exportMode && !deleteMode"
              v-tooltip.left="{ value: $t('components.player.more') }"
              rounded
              severity="secondary"
              class="shadow-md pointer-events-auto w-[42px] h-[42px]"
              @click="showMobileSheet = true"
            >
              <template #icon>
                <i-ri:menu-5-line width="100%" height="100%" />
              </template>
            </Button>

            <CuiTimelineExport
              v-if="exportMode && cameraId"
              :timeline="cuiTimelineRef"
              :camera-id="cameraId"
              :source-role="nvrController.effectiveRole.value"
              :horizontal="horizontalTimeline"
            />

            <Button
              v-if="deleteMode"
              v-tooltip.left="{ value: $t('components.player.delete_selection') }"
              rounded
              severity="danger"
              :loading="rangeDeleting"
              class="shadow-md pointer-events-auto"
              :class="horizontalTimeline ? 'cui-button-small' : 'w-[42px] h-[42px]'"
              @click="confirmRangeDelete"
            >
              <template #icon>
                <i-mdi:delete width="100%" height="100%" />
              </template>
            </Button>

            <template v-if="(recordingsInSheet || horizontalTimeline) && timelineSegment === 'timeline'">
              <Button
                v-tooltip.left="{ value: $t('components.form.tooltip.zoom_in') }"
                rounded
                severity="secondary"
                :disabled="(cuiTimelineRef?.zoomLevel ?? 0) >= 8"
                class="shadow-md pointer-events-auto"
                :class="horizontalTimeline ? 'cui-button-small' : 'w-[42px] h-[42px]'"
                @click="cuiTimelineRef?.zoomIn()"
              >
                <template #icon>
                  <i-tabler:zoom-in width="100%" height="100%" />
                </template>
              </Button>
              <Button
                v-tooltip.left="{ value: $t('components.form.tooltip.zoom_out') }"
                rounded
                severity="secondary"
                :disabled="(cuiTimelineRef?.zoomLevel ?? 0) <= 0"
                class="shadow-md pointer-events-auto"
                :class="horizontalTimeline ? 'cui-button-small' : 'w-[42px] h-[42px]'"
                @click="cuiTimelineRef?.zoomOut()"
              >
                <template #icon>
                  <i-tabler:zoom-out width="100%" height="100%" />
                </template>
              </Button>
            </template>
          </div>
        </template>

        <template #find="{ layout }">
          <CuiFindObjectView :layout @open="openFindMatch" @show-all="openSimilarSearch" />
        </template>
      </CuiTimeline>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { CuiTimeline, playheadUs, useEventStore, useNvrPlayback, useRecordingExport } from '@camera.ui/nvr';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { extractErrorMessage } from '@/common/utils.js';
import { FindObjectKey } from '@/components/CuiFindObjectView/types.js';
import { GridSearchKey } from '@/components/CuiGridSearch/types.js';
import { boxOverlapsRegions } from '@/components/CuiGridSearch/utils.js';

import type CuiCameraPipCard from '@/components/CuiCameraPipCard/CuiCameraPipCard.vue';
import type { FindPick } from '@/components/CuiFindObjectView/types.js';
import type { SimilarResultOpen } from '@/components/CuiSimilarResults/types.js';
import type { EventDescription, RecordedEvent } from '@camera.ui/nvr';
import type { BoundingBox, StreamingRole } from '@camera.ui/sdk';

const CuiCameraRecordings = asyncComponent(() => import('@/components/CuiCameraRecordings/CuiCameraRecordings.vue'));
const CuiCameraTable = asyncComponent(() => import('@/components/CuiCameraTable/CuiCameraTable.vue'));
const CuiCameraShares = asyncComponent(() => import('@/components/CuiCameraShares/CuiCameraShares.vue'));
const CuiBottomSheet = asyncComponent(() => import('@/components/CuiBottomSheet/CuiBottomSheet.vue'));

const camerasQuery = new CamerasQuery();
const eventStore = useEventStore();

const log = useLogger();
const toast = useCuiToast();
const dialog = useCuiDialog();
const i18n = useI18n();
const timelineLocaleSettings = useTimelineLocale();
const route = useRoute();
const router = useRouter();
const assistantActions = useAssistantActions();
const { openEventTrace } = useEventTraceDialog();
const { openSimilarSearch, openOnCamera, cameraSearch, forgetCameraSearch } = useSimilarSearchRoute();
const { xmdBreakpoint, smBreakpoint, mdBreakpoint, shortBreakpoint } = useSharedCuiBreakpoint();
const { topbarOffset } = useSharedCuiStates();
const { isAvailable: nvrAvailable } = useRecordingExport();

const routerStore = useRouterStore();

const cameraName = computed(() => route.params.cameraname as string);

const { data: camera } = camerasQuery.getCameraQuery(cameraName);

const CAMERA_SHARE_DEFAULT = 0.5;
const CAMERA_SHARE_MIN = 0.2;
const TABS_MIN_HEIGHT = 160;

const cameraCardRef = useTemplateRef<InstanceType<typeof CuiCameraPipCard>>('cameraCardRef');
const cuiTimelineRef = useTemplateRef<InstanceType<typeof CuiTimeline>>('cuiTimelineRef');
const timelineRef = useTemplateRef('timelineRef');
const cameraColumnRef = useTemplateRef('cameraColumnRef');
const cameraPaneRef = useTemplateRef('cameraPaneRef');
const cameraShare = useLocalStorage('cui-camera-view-split', CAMERA_SHARE_DEFAULT);
const isContentReady = ref(!routerStore.isTransitioning);
const wasTimelineActive = ref(false);
const showMobileSheet = ref(false);
const gridSearchActive = ref(false);
const gridSearchRegions = ref<import('@/components/CuiGridSearch/types').GridRegion[]>([]);
const qualityRole = ref<StreamingRole>();
const consumedStartTs = ref<number>();
const rangeDeleting = ref(false);
const exportMode = ref(false);
const deleteMode = ref(false);
const cameraTab = ref('0');

let splitFrom: { y: number; height: number } | undefined;
let routeSearch = cameraSearch();

const isAdmin = computed(() => hasPermission(undefined, 'admin'));

const cameraId = computed(() => camera.value?._id);

const cameraCardIsFullscreen = computed(() => Boolean(cameraCardRef.value?.isFullscreen));
// a short window keeps the timeline beside the camera and the recordings in the sheet
const cardTimeline = computed(() => xmdBreakpoint.value && !shortBreakpoint.value);
const sideTimeline = computed(() => !smBreakpoint.value && !cardTimeline.value);
const recordingsInSheet = computed(() => smBreakpoint.value || shortBreakpoint.value);
const horizontalTimeline = computed(() => cardTimeline.value || cameraCardIsFullscreen.value);

const find = useFindObject({
  shown: () => !horizontalTimeline.value || Boolean(cameraCardRef.value?.timelineState),
  searchable: () => Boolean(camera.value?.assignments?.object),
});
const { segment: timelineSegment, views: timelineViews, keys: findKeys, count: findCount } = find;

const currentDescription = computed<EventDescription | undefined>(() => cuiTimelineRef.value?.currentEventDescription);

const currentTraceEvent = computed<RecordedEvent | undefined>(() => {
  const id = cuiTimelineRef.value?.currentEvent?.id;
  return id ? eventStore.getEvent(id) : undefined;
});

const timeline = useElementSize(timelineRef);

const playbackSourceRole = computed(() => camera.value?.interfaceSettings?.playbackSource ?? 'auto');

const nvrController = useNvrPlayback(
  computed(() => cameraId.value ?? ''),
  { sourceRole: playbackSourceRole },
);

const startTs = computed(() => {
  const raw = route.query.startTs;
  const val = Number(raw);
  return raw && !isNaN(val) ? val : undefined;
});

const pipCameraQuery = computed(() => (typeof route.query.pip === 'string' && route.query.pip ? route.query.pip : undefined));

provide(GridSearchKey, { active: gridSearchActive, regions: gridSearchRegions });
provide(FindObjectKey, find);

function openPipCamera(name: string): void {
  const query: Record<string, string> = { pip: cameraName.value };
  if (nvrController.mode.value !== 'idle') query.startTs = String(Math.floor(playheadUs(nvrController) / 1000));
  router.push({ path: `/cameras/${encodeURIComponent(name)}`, query, state: { pipFullscreen: cameraCardIsFullscreen.value } });
}

function openTraceAtPlayhead(): void {
  const event = currentTraceEvent.value;
  if (!event || !camera.value) return;
  const atMs = cuiTimelineRef.value?.currentTimeMs;
  openEventTrace(event, camera.value, atMs ? Math.floor(atMs) : undefined);
}

function zoneBoxMatcher(box: BoundingBox): boolean {
  return boxOverlapsRegions(box, gridSearchRegions.value);
}

function toggleZoneFilter(): void {
  gridSearchActive.value = !gridSearchActive.value;
  if (!gridSearchActive.value) gridSearchRegions.value = [];
}

if (!isContentReady.value) {
  const stop = watch(
    () => routerStore.isTransitioning,
    (active) => {
      if (!active) {
        isContentReady.value = true;
        stop();
      }
    },
  );

  setTimeout(() => {
    if (!isContentReady.value) {
      isContentReady.value = true;
      stop();
    }
  }, 1000);
}

function onTimelineScroll(scrolling: boolean) {
  try {
    cameraCardRef.value?.timelineScroll(scrolling);
  } catch {}
}

function onSplitStart(e: PointerEvent): void {
  const pane = cameraPaneRef.value;
  if (!pane) return;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  splitFrom = { y: e.clientY, height: pane.offsetHeight };
}

function onSplitMove(e: PointerEvent): void {
  const column = cameraColumnRef.value?.clientHeight;
  if (!splitFrom || !column) return;
  const share = (splitFrom.height + e.clientY - splitFrom.y) / column;
  cameraShare.value = Math.min(Math.max(share, CAMERA_SHARE_MIN), 1 - TABS_MIN_HEIGHT / column);
}

function onSplitEnd(): void {
  splitFrom = undefined;
}

function openCardTimeline(): void {
  if (cameraCardRef.value?.timelineState === false) cameraCardRef.value.toggleTimeline();
}

function onScrollToEvent(timestamp: number) {
  cuiTimelineRef.value?.scrollToEvent(timestamp);
}

function openFindMatch({ event, camera: matchCamera, timestamp }: SimilarResultOpen, pick: FindPick): void {
  if (event.cameraId === cameraId.value) {
    find.releaseAll(false);
    onScrollToEvent(timestamp);
    return;
  }
  if (matchCamera) openOnCamera(matchCamera.name, timestamp, pick.request);
}

function confirmRangeDelete() {
  const tl = cuiTimelineRef.value;
  if (!tl?.trimStartMs || !tl?.trimEndMs || !cameraId.value) return;

  dialog.openTextDialog({
    data: {
      title: i18n.t('components.dialog.title.confirm'),
      contentText: i18n.t('components.player.delete_range_confirm'),
      confirmText: i18n.t('components.form.button.remove'),
      confirmButtonProps: {
        severity: 'danger',
      },
    },
    onConfirm: () => onRangeDelete(),
  });
}

async function onRangeDelete() {
  const tl = cuiTimelineRef.value;
  if (!tl?.trimStartMs || !tl?.trimEndMs || !cameraId.value) return;

  if (!nvrAvailable.value) return;

  rangeDeleting.value = true;
  try {
    const result = await eventStore.deleteRange(cameraId.value, tl.trimStartMs, tl.trimEndMs);
    if (result.endMs > result.startMs) {
      toast.add({ severity: 'success', detail: i18n.t('components.player.delete_range_done'), life: 4000 });
      deleteMode.value = false;
    } else if (tl.trimEndMs > Date.now() - 3 * 60_000) {
      // the writer owns the trailing minutes, the plugin refuses to touch them
      toast.add({ severity: 'info', detail: i18n.t('components.player.delete_range_too_recent'), life: 5000 });
    } else {
      toast.add({ severity: 'info', detail: i18n.t('components.player.delete_range_nothing'), life: 4000 });
    }
  } catch (error) {
    log.error('Range delete failed:', error);
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 5000 });
  } finally {
    rangeDeleting.value = false;
  }
}

function toggleExportMode(): void {
  exportMode.value = !exportMode.value;
  if (exportMode.value) deleteMode.value = false;
}

function toggleDeleteMode(): void {
  deleteMode.value = !deleteMode.value;
  if (deleteMode.value) exportMode.value = false;
}

watch(
  () => cameraCardRef.value?.timelineState,
  (open) => {
    if (open === false) {
      exportMode.value = false;
      deleteMode.value = false;
    }
  },
);

watch(
  startTs,
  (ts) => {
    if (ts) {
      nvrController.mode.value = 'play';
    }
  },
  { immediate: true, flush: 'sync' },
);

watch(
  [cameraId, startTs],
  ([id, ts]) => {
    if (!id || !ts) return;
    if (consumedStartTs.value === ts) return;
    if (camera.value?.name !== cameraName.value) return;
    consumedStartTs.value = ts;
    nvrController.play(ts * 1000);
    // a later deep link on the same page must move the timeline too, only the first mount centres on it by itself
    cuiTimelineRef.value?.scrollToTime(ts);
    router.replace({ query: { ...route.query, startTs: undefined } });
  },
  { immediate: true },
);

watch(cameraName, () => {
  routeSearch = cameraSearch();
  find.endSearch();
});

watch(
  () => (camera.value?.name === cameraName.value ? camera.value : undefined),
  (loaded) => {
    if (!loaded || !routeSearch) return;
    find.add(loaded, routeSearch);
    routeSearch = undefined;
  },
  { immediate: true },
);

watch(
  () => find.picks.value.length,
  (count) => {
    if (!count && !routeSearch) forgetCameraSearch();
  },
);

watch([timelineSegment, cameraCardRef], ([segment]) => {
  if (segment === 'find' && horizontalTimeline.value) openCardTimeline();
});

watch(
  cameraName,
  (_, oldName) => {
    if (oldName && cardTimeline.value && wasTimelineActive.value) {
      nextTick(() => {
        nextTick(() => {
          try {
            openCardTimeline();
          } catch {}
        });
      });
    }
  },
  { flush: 'pre' },
);

watch(
  () => cameraCardRef.value?.timelineState,
  (state) => {
    if (state !== undefined) {
      wasTimelineActive.value = state;
    }
  },
);

watch(cameraCardRef, (card) => {
  if (!card || !window.history.state?.pipFullscreen) return;
  // a reload must not bring the fullscreen back
  window.history.replaceState({ ...window.history.state, pipFullscreen: false }, '');
  if (!card.isFullscreen) card.toggleFs();
});

watch(cameraCardIsFullscreen, (fullscreen) => {
  if (fullscreen) deleteMode.value = false;
});

onBeforeRouteUpdate((to, from) => {
  if (to.params.cameraname !== from.params.cameraname && nvrController.isActive.value) {
    nvrController.stop();
  }
});

onMounted(() => {
  camerasQuery.ensureCamerasList({ page: 1, pageSize: -1 }).catch(() => undefined);

  assistantActions.register({
    name: 'timeline.seek',
    description: 'Jump the recording of the open camera to a time. Args: { time: ISO 8601 with offset }.',
    run: (args) => {
      const time = Date.parse(String(args.time ?? ''));
      if (Number.isNaN(time)) throw new Error('time is not a valid ISO 8601 timestamp');
      nvrController.play(time * 1000);
      cuiTimelineRef.value?.scrollToTime(time);
      return `timeline at ${new Date(time).toLocaleString()}`;
    },
  });
  assistantActions.register({
    name: 'timeline.zoom',
    description: 'Zoom the timeline of the open camera. Args: { direction: "in" | "out" }.',
    run: (args) => {
      if (args.direction === 'in') cuiTimelineRef.value?.zoomIn();
      else cuiTimelineRef.value?.zoomOut();
      return `timeline zoomed ${args.direction === 'in' ? 'in' : 'out'}`;
    },
  });
});
</script>

<style scoped>
.camera-tab-panels :deep(.p-tabpanel) {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.camera-tab-panels :deep(.p-tabpanel::-webkit-scrollbar) {
  display: none;
}

.mobile-sheet-panels :deep(.p-tabpanel) {
  height: 100%;
  scrollbar-width: none;
}

.mobile-sheet-panels :deep(.p-tabpanel::-webkit-scrollbar) {
  display: none;
}
</style>
