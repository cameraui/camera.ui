<template>
  <div class="camera-stream-event-container">
    <div class="stream-wrapper">
      <CuiCameraCard
        ref="cameraCardRef"
        :key="camera.name"
        v-model:source-role="qualityRole"
        :streaming-mode="'webrtc'"
        :camera-info="camera.name"
        flat-card
        :card-props="{ pt: { root: { class: { '!rounded-md': true } } } }"
        :camera-name-overlay="false"
        :toolbar="false"
        :subcontrol="true"
        :subcontrol-quality-button="true"
        :subcontrol-activity-mode-button="false"
        :subcontrol-ptz-button="false"
        :subcontrol-streaming-mode-button="false"
        :control-pip-button="false"
        :control-microphone-button="false"
      />

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <div v-if="currentDescription && showDescription" class="ai-description-overlay">
          <i-tabler:sparkles class="w-4 h-4 text-white/90 shrink-0 mt-0.5" />
          <div class="min-w-0">
            <p class="text-sm font-semibold text-white">{{ currentDescription.title }}</p>
            <p class="text-xs text-white/85 mt-1">{{ currentDescription.description }}</p>
          </div>
        </div>
      </Transition>
    </div>

    <CuiTimeline
      ref="cuiTimelineRef"
      :key="camera.name"
      :camera-ids="[camera._id]"
      :initial-timestamp="eventTimestamp"
      :loading="!isContentReady"
      :type="mdBreakpoint ? 'vertical' : 'horizontal'"
      :ignore-bottom-safe-area="mdBreakpoint"
      :show-segments="false"
      :show-zoom="false"
      :show-date="false"
      :md-breakpoint="mdBreakpoint"
      class="flex w-full border-t-[1px] border-color shrink-0"
      :class="mdBreakpoint ? 'h-full' : 'h-[200px]'"
      :card-class="{
        'mt-auto': !mdBreakpoint,
      }"
      flat-card
      :locale-settings="timelineLocaleSettings"
      @scrolling="onTimelineScroll"
    />
  </div>
</template>

<script setup lang="ts">
import { CuiTimeline, useNvrPlayback } from '@camera.ui/nvr';
import { usePrimeVue } from 'primevue';
import DownloadIcon from '~icons/tabler/download';
import SparklesIcon from '~icons/tabler/sparkles';

import { extractErrorMessage } from '@/common/utils.js';

import type CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import type { DialogRefProps } from '@/composables/useCuiDialog.js';
import type { CuiTimelineLocale } from '@camera.ui/nvr';
import type { EventDescription, StreamingRole } from '@camera.ui/sdk';
import type { CameraStreamEventProps } from './types.js';

const props = defineProps<CameraStreamEventProps>();

const log = useLogger();
const toast = useCuiToast();
const i18n = useI18n();
const { t } = i18n;
const primevue = usePrimeVue();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const headerToggles = inject<Record<number, boolean>>('dialogHeaderToggles', {});
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const { camera, eventTimestamp } = toRefs(props);

const cameraCardRef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cameraCardRef');
const cuiTimelineRef = useTemplateRef<InstanceType<typeof CuiTimeline>>('cuiTimelineRef');
const isContentReady = ref(false);
const qualityRole = ref<StreamingRole>();
const isDownloading = ref(false);

let playbackStarted = false;

const nvrController = useNvrPlayback(
  computed(() => camera.value._id),
  { sourceRole: qualityRole },
);

const isLoading = computed(() => Boolean(dialogRefProps.loading?.value));
const showDescription = computed(() => headerToggles[0] ?? false);
const currentDescription = computed<EventDescription | undefined>(() => {
  return cuiTimelineRef.value?.currentEventDescription;
});
const hasCurrentEvent = computed(() => Boolean(cuiTimelineRef.value?.currentEvent));
// Live mode has no event under the playhead worth acting on — and the live
// edge drifting in/out of a recent event's range would otherwise make the
// header buttons flicker. Default to `true` until the timeline reports.
const isLive = computed(() => cuiTimelineRef.value?.isLive ?? true);
const timelineLocaleSettings = computed<CuiTimelineLocale>(() => {
  return {
    locale: i18n.locale.value,
    dayNames: primevue.config.locale?.dayNames,
    dayNamesShort: primevue.config.locale?.dayNamesShort,
    monthNames: primevue.config.locale?.monthNames,
    monthNamesShort: primevue.config.locale?.monthNamesShort,
  };
});

async function handleDownload(): Promise<void> {
  if (isDownloading.value) return;
  const ev = cuiTimelineRef.value?.currentEvent;
  if (!ev) return;
  const nvrPlugin = nvrPluginRef.value as { nvrExport: (...args: any[]) => Promise<{ url: string; filename: string }> } | undefined;
  if (!nvrPlugin?.nvrExport) return;

  isDownloading.value = true;
  try {
    const result = await nvrPlugin.nvrExport(
      ev.cameraId,
      ev.startMs * 1000, // ms → μs
      ev.endMs * 1000,
    );
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Download failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    isDownloading.value = false;
  }
}

function onTimelineScroll(scrolling: boolean) {
  cameraCardRef.value?.timelineScroll(scrolling);
}

function resolveGoTo(): string | undefined {
  const liveMs = nvrController.currentTimestamp.value > 0 ? Math.floor(nvrController.currentTimestamp.value / 1000) : eventTimestamp.value;
  if (!liveMs) return `/cameras/${camera.value.name}`;
  return `/cameras/${camera.value.name}?startTs=${liveMs}`;
}

watch(
  [hasCurrentEvent, isLive, isDownloading],
  ([hasEvent, live]) => {
    if (!dialogRefProps.headerActions) return;
    const actions: { icon: any; tooltip?: string; onClick: () => void; toggle?: boolean; loading?: boolean }[] = [];
    actions.push({ icon: SparklesIcon, tooltip: t('components.player.ai_descriptions'), toggle: true, onClick: () => {} });
    if (!live && hasEvent && nvrPluginRef.value) {
      actions.push({ icon: DownloadIcon, tooltip: t('views.recordings.download'), onClick: handleDownload, loading: isDownloading.value });
    }
    dialogRefProps.headerActions.value = actions;
  },
  { immediate: true },
);

if (eventTimestamp.value) {
  nvrController.mode.value = 'play';
  nvrController.loading.value = true;
}

watch(
  [nvrPluginRef, eventTimestamp],
  ([proxy, ts]) => {
    if (!proxy || !ts || playbackStarted) return;
    playbackStarted = true;
    nvrController.play(ts * 1000);
  },
  { immediate: true },
);

onMounted(() => {
  setTimeout(() => {
    isContentReady.value = true;
  }, 300);
});

defineExpose({
  isLoading,
  resolveGoTo,
});
</script>

<style scoped>
.camera-stream-event-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  contain: inline-size;
}

.stream-wrapper {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  /* min-height: 0; */
  min-width: 0;
}

.stream-wrapper > :first-child {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.ai-description-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 0.75rem 1rem 1.25rem;
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.65) 55%, transparent 100%);
  pointer-events: none;
  z-index: 5;
  border-top-left-radius: inherit;
  border-top-right-radius: inherit;
}
</style>
