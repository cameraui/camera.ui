<template>
  <div
    :class="{
      'pt-2': !smBreakpoint,
      'px-2': !smBreakpoint,
    }"
  >
    <div class="w-full h-full flex flex-col lg:flex-row gap-0 lg:gap-2 relative">
      <div
        class="w-full flex flex-col gap-2"
        :class="{
          'h-full': !smBreakpoint,
          // 'h-[50%]': smBreakpoint,
        }"
        :style="{
          paddingRight: !smBreakpoint && !xmdBreakpoint ? `calc(${timeline.width.value || 400}px + 0.5rem)` : '0px',
        }"
      >
        <div
          :class="{
            'flex max-h-[60%]': !smBreakpoint,
          }"
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
            :toolbar-timeline-button="xmdBreakpoint"
            :toolbar-description-button="Boolean(nvrPluginRef)"
            :event-description="currentDescription"
            :camera-name-overlay="false"
            show-shortcuts
            view-transition
            class="flex-1 h-full min-w-0"
          />
        </div>

        <Card
          v-if="!smBreakpoint"
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
            <Tabs v-else value="0" class="h-full flex flex-col">
              <TabList class="shrink-0">
                <Tab value="0" class="pt-0 text-sm">{{ $t('views.camera.recordings') }}</Tab>
                <Tab value="1" class="pt-0 text-sm">{{ $t('views.camera.cameras') }}</Tab>
                <Tab v-if="hasPermission(undefined, 'admin')" value="2" class="pt-0 text-sm">{{ $t('views.camera.shares') }}</Tab>
              </TabList>

              <TabPanels class="camera-tab-panels px-0 pb-0 flex-1 min-h-0">
                <TabPanel value="0" class="!overflow-hidden">
                  <CuiCameraRecordings v-if="cameraId" :camera-id="cameraId" :camera-name="cameraName" :camera="camera" @scroll-to-event="onScrollToEvent" />
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
        v-if="!xmdBreakpoint"
        v-show="!cameraCardIsFullscreen"
        id="camera-sidebar"
        ref="timelineRef"
        class="min-w-[400px]"
        :class="{
          'border-t-[1px] border-color': smBreakpoint,
          'lg:fixed lg:right-safe-offset-2 lg:bottom-safe-offset-2': !smBreakpoint && !xmdBreakpoint,
        }"
        :style="{
          height: `calc(100% - ${topbarHeight}px - 1rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))`,
        }"
      />
    </div>

    <CuiBottomSheet v-if="smBreakpoint && isContentReady" v-model="showMobileSheet" height="70vh" max-height="85vh">
      <Tabs :key="cameraName" value="0" class="h-full flex flex-col">
        <TabList class="shrink-0 w-full mt-5">
          <Tab value="0" class="pt-0 text-sm flex-1">{{ $t('views.camera.recordings') }}</Tab>
          <Tab value="1" class="pt-0 text-sm flex-1">{{ $t('views.camera.cameras') }}</Tab>
          <Tab value="2" class="pt-0 text-sm flex-1">{{ $t('views.camera.shares') }}</Tab>
        </TabList>
        <TabPanels class="mobile-sheet-panels px-0 pb-0 flex-1 min-h-0">
          <TabPanel value="0" class="h-full !overflow-hidden">
            <CuiCameraRecordings v-if="cameraId" :camera-id="cameraId" :camera-name="cameraName" :camera="camera" compact @scroll-to-event="onScrollToEvent" />
          </TabPanel>
          <TabPanel value="1" class="h-full overflow-auto">
            <CuiCameraTable :active-camera="cameraName" />
          </TabPanel>
          <TabPanel value="2" class="h-full overflow-auto">
            <CuiCameraShares v-if="cameraId" :camera-id="cameraId" :camera-name="cameraName" />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </CuiBottomSheet>

    <Teleport :key="cameraName" :to="xmdBreakpoint ? '#timeline-container' : '#camera-sidebar'" defer>
      <CuiTimeline
        ref="cuiTimelineRef"
        :key="cameraName"
        :camera-ids="cameraId ? [cameraId] : []"
        :loading="!isContentReady"
        :flat-card="smBreakpoint || xmdBreakpoint"
        :type="!xmdBreakpoint ? 'vertical' : 'horizontal'"
        :show-segments="!smBreakpoint && !xmdBreakpoint"
        :show-zoom="true"
        :initial-timestamp="startTs"
        :class="{
          'absolute bottom-0 left-0 w-full h-[200px]': xmdBreakpoint,
          'h-full': !xmdBreakpoint,
        }"
        :card-class="{
          'h-[200px]': xmdBreakpoint,
        }"
        :transparent="xmdBreakpoint"
        :dark-mode="xmdBreakpoint"
        :overlay-class="xmdBreakpoint ? 'timeline-overlay !z-0' : undefined"
        :locale-settings="timelineLocaleSettings"
        :trim-mode="cameraCardRef?.trimMode"
        :ignore-bottom-safe-area="!xmdBreakpoint"
        :md-breakpoint="mdBreakpoint"
        @scrolling="onTimelineScroll"
      >
        <template #bottom-right>
          <div class="flex flex-col-reverse gap-2 items-center">
            <Button
              v-if="smBreakpoint"
              v-tooltip.left="{ value: $t('components.player.intercom') }"
              rounded
              severity="primary"
              :disabled="cameraCardRef?.micButtonDisabled ?? true"
              class="shadow-md pointer-events-auto w-12 h-12"
              @click="cameraCardRef?.toggleMicrophone(undefined, true)"
            >
              <template #icon>
                <i-mage:microphone-fill v-if="cameraCardRef?.micActive" width="100%" height="100%" />
                <i-mage:microphone-mute-fill v-else width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="smBreakpoint"
              v-tooltip.left="{ value: $t('components.player.more') }"
              rounded
              severity="secondary"
              class="shadow-md pointer-events-auto w-12 h-12"
              @click="showMobileSheet = true"
            >
              <template #icon>
                <i-ri:menu-5-line width="100%" height="100%" />
              </template>
            </Button>

            <template v-if="cameraCardRef?.trimMode">
              <Button
                v-tooltip.left="{
                  value: timelapseDisabled
                    ? $t('components.player.timelapse_min_duration')
                    : trimTimelapse > 0
                      ? `${$t('components.player.timelapse')}: ${TIMELAPSE_OPTIONS[trimTimelapse]}`
                      : $t('components.player.timelapse_off'),
                }"
                rounded
                severity="secondary"
                :disabled="timelapseDisabled"
                :label="trimTimelapse > 0 ? TIMELAPSE_OPTIONS[trimTimelapse] : undefined"
                class="shadow-md pointer-events-auto w-12 h-12 !text-xs !font-semibold"
                @click="cycleTrimTimelapse"
              >
                <template v-if="trimTimelapse === 0" #icon>
                  <i-tabler:clock-play width="100%" height="100%" class="opacity-40" />
                </template>
              </Button>
              <Button
                v-tooltip.left="{ value: $t('components.player.export_selection') }"
                rounded
                severity="success"
                :loading="trimExporting"
                class="shadow-md pointer-events-auto w-12 h-12"
                @click="onTrimExport"
              >
                <template #icon>
                  <i-tabler:download width="100%" height="100%" />
                </template>
              </Button>
            </template>

            <template v-if="smBreakpoint || xmdBreakpoint">
              <Button
                v-tooltip.left="{ value: $t('components.form.tooltip.zoom_in') }"
                rounded
                severity="secondary"
                :disabled="(cuiTimelineRef?.zoomLevel ?? 0) >= 8"
                class="shadow-md pointer-events-auto w-12 h-12"
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
                class="shadow-md pointer-events-auto w-12 h-12"
                @click="cuiTimelineRef?.zoomOut()"
              >
                <template #icon>
                  <i-tabler:zoom-out width="100%" height="100%" />
                </template>
              </Button>
            </template>
          </div>
        </template>
      </CuiTimeline>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { CuiTimeline, useNvrPlayback } from '@camera.ui/nvr';
import { usePrimeVue } from 'primevue';

import { CamerasQuery } from '@/api/routes/cameras.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import { extractErrorMessage } from '@/common/utils.js';
import { GridSearchKey } from '@/components/CuiGridSearch/types.js';

import type CuiCameraPipCard from '@/components/CuiCameraPipCard/CuiCameraPipCard.vue';
import type { CuiTimelineLocale } from '@camera.ui/nvr';
import type { EventDescription, StreamingRole } from '@camera.ui/sdk';

const CuiCameraRecordings = asyncComponent(() => import('@/components/CuiCameraRecordings/CuiCameraRecordings.vue'));
const CuiCameraTable = asyncComponent(() => import('@/components/CuiCameraTable/CuiCameraTable.vue'));
const CuiCameraShares = asyncComponent(() => import('@/components/CuiCameraShares/CuiCameraShares.vue'));
const CuiBottomSheet = asyncComponent(() => import('@/components/CuiBottomSheet/CuiBottomSheet.vue'));

const camerasQuery = new CamerasQuery();

const log = useLogger();
const toast = useCuiToast();
const i18n = useI18n();
const primevue = usePrimeVue();
const route = useRoute();
const router = useRouter();
const { xmdBreakpoint, smBreakpoint, mdBreakpoint } = useSharedCuiBreakpoint();
const { topbarHeight } = useSharedCuiStates();
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const routerStore = useRouterStore();

const cameraName = computed(() => route.params.cameraname as string);

const { data: camera } = camerasQuery.getCameraQuery(cameraName);

const TIMELAPSE_OPTIONS = ['Off', '1m', '2m', '3m', '5m'] as const;

const cameraCardRef = useTemplateRef<InstanceType<typeof CuiCameraPipCard>>('cameraCardRef');
const cuiTimelineRef = useTemplateRef<InstanceType<typeof CuiTimeline>>('cuiTimelineRef');
const timelineRef = useTemplateRef('timelineRef');
const isContentReady = ref(!routerStore.isTransitioning);
const wasTimelineActive = ref(false);
const showMobileSheet = ref(false);
const gridSearchActive = ref(false);
const gridSearchRegions = ref<import('@/components/CuiGridSearch/types').GridRegion[]>([]);
const qualityRole = ref<StreamingRole>();
const consumedStartTs = ref<number>();
const trimTimelapse = ref(0); // index into TIMELAPSE_OPTIONS
const trimExporting = ref(false);

const cameraId = computed(() => camera.value?._id);

const cameraCardIsFullscreen = computed(() => Boolean(cameraCardRef.value?.isFullscreen));

const currentDescription = computed<EventDescription | undefined>(() => cuiTimelineRef.value?.currentEventDescription);

const timeline = useElementSize(timelineRef);

const nvrController = useNvrPlayback(
  computed(() => cameraId.value ?? ''),
  { sourceRole: qualityRole },
);

const startTs = computed(() => {
  const raw = route.query.startTs;
  const val = Number(raw);
  return raw && !isNaN(val) ? val : undefined;
});

const timelineLocaleSettings = computed<CuiTimelineLocale>(() => {
  return {
    locale: i18n.locale.value,
    dayNames: primevue.config.locale?.dayNames,
    dayNamesShort: primevue.config.locale?.dayNamesShort,
    monthNames: primevue.config.locale?.monthNames,
    monthNamesShort: primevue.config.locale?.monthNamesShort,
  };
});

const trimDurationMs = computed(() => {
  const tl = cuiTimelineRef.value;
  if (!tl?.trimStartMs || !tl?.trimEndMs) return 0;
  return tl.trimRecordingDurationMs ?? tl.trimEndMs - tl.trimStartMs;
});

const timelapseDisabled = computed(() => trimDurationMs.value < 60 * 60 * 1000);

provide(GridSearchKey, { active: gridSearchActive, regions: gridSearchRegions });

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

function cycleTrimTimelapse() {
  if (timelapseDisabled.value) return;
  trimTimelapse.value = (trimTimelapse.value + 1) % TIMELAPSE_OPTIONS.length;
}

function onTimelineScroll(scrolling: boolean) {
  try {
    cameraCardRef.value?.timelineScroll(scrolling);
  } catch {
    //
  }
}

function onScrollToEvent(timestamp: number) {
  cuiTimelineRef.value?.scrollToEvent(timestamp);
}

async function onTrimExport() {
  const tl = cuiTimelineRef.value;
  if (!tl) return;

  const startMs = tl.trimStartMs;
  const endMs = tl.trimEndMs;
  if (!startMs || !endMs || !cameraId.value) return;

  const nvrPlugin = nvrPluginRef.value as { nvrExport: (...args: any[]) => Promise<any> } | undefined;
  if (!nvrPlugin?.nvrExport) return;

  const timelapseSetting = TIMELAPSE_OPTIONS[trimTimelapse.value];
  const timelapseIntervalSec = timelapseSetting === 'Off' ? 0 : parseInt(timelapseSetting) * 60;

  trimExporting.value = true;
  try {
    const result = await nvrPlugin.nvrExport(cameraId.value, startMs * 1000, endMs * 1000, { timelapseIntervalSec: timelapseIntervalSec || undefined });
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Export failed:', error);
    toast.add({ severity: 'error', summary: i18n.t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    trimExporting.value = false;
  }
}

// Pre-set mode so CuiCameraCard skips live autostart when navigating with ?startTs=
// flush: 'sync' ensures mode is set BEFORE child components mount (CuiCameraPipCard checks nvrMode for autoStart)
watch(
  startTs,
  (ts) => {
    if (ts) {
      nvrController.mode.value = 'play';
    }
  },
  { immediate: true, flush: 'sync' },
);

// Auto-play at startTs when cameraId resolves after navigation with ?startTs=
// Guard: camera.name must match route param to prevent play() with stale cameraId
// (tanstack-query resolves cached data async — cameraId can briefly hold the OLD camera's ID).
// play() defers internally when the container isn't bound yet, so no container check here.
watch(
  [cameraId, startTs],
  ([id, ts]) => {
    if (!id || !ts) return;
    if (consumedStartTs.value === ts) return;
    if (camera.value?.name !== cameraName.value) return;
    consumedStartTs.value = ts;
    nvrController.play(ts * 1000);
    router.replace({ query: { ...route.query, startTs: undefined } });
  },
  { immediate: true },
);

watch(
  cameraName,
  (_, oldName) => {
    if (oldName && xmdBreakpoint.value && wasTimelineActive.value) {
      nextTick(() => {
        nextTick(() => {
          try {
            cameraCardRef.value?.toggleTimeline();
          } catch {
            //
          }
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

watch(
  () => cameraCardRef.value?.trimMode,
  (active) => {
    if (!active) trimTimelapse.value = 0;
  },
);

watch(timelapseDisabled, (disabled) => {
  if (disabled) trimTimelapse.value = 0;
});

// Stop playback cleanly when switching cameras (not on query-only changes like clearing startTs)
onBeforeRouteUpdate((to, from) => {
  if (to.params.cameraname !== from.params.cameraname && nvrController.isActive.value) {
    nvrController.stop();
  }
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
