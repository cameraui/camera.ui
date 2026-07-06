<template>
  <div class="cui-pip-wrapper" :style="{ '--pip-bottom': pipBottomOffset }">
    <CuiCameraCard
      v-if="!swapped || showPip"
      ref="cardARef"
      v-bind="propsA"
      v-model:activity-mode="activityModeA"
      v-model:source-role="sourceRole"
      v-model:streaming-mode="streamingModeA"
      :class="{
        'pip-main-position': !swapped,
        'pip-overlay-position cursor-pointer': swapped,
      }"
      @expand="onExpand"
      @stream-finished-loading="onStreamALoaded"
      @toggle-pip="togglePip"
      @click="swapped && swap()"
    />

    <CuiCameraCard
      v-if="hasPipSource && (swapped || showPip)"
      ref="cardBRef"
      v-bind="propsB"
      v-model:activity-mode="activityModeB"
      v-model:source-role="sourceRoleB"
      v-model:streaming-mode="streamingModeB"
      :class="{
        'pip-main-position': swapped,
        'pip-overlay-position cursor-pointer': !swapped,
      }"
      @stream-finished-loading="onStreamBLoaded"
      @toggle-pip="togglePip"
      @click="!swapped && swap()"
    />
  </div>
</template>

<script setup lang="ts">
import { createNvrPlayback, NvrPlaybackKey, NvrPlaybackMapKey } from '@camera.ui/nvr';

import { CAMERA_CARD_DEFAULTS } from '@/components/CuiCameraCard/types.js';

import type CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import type { CuiCameraCardModels, CuiCameraCardProps } from '@/components/CuiCameraCard/types.js';
import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { NvrPlayback } from '@camera.ui/nvr';
import type { StreamingRole } from '@camera.ui/sdk';
import type { CuiCameraPipCardEmits } from './types.js';

const props = withDefaults(defineProps<CuiCameraCardProps>(), {
  pipToggleButton: true,
  ...CAMERA_CARD_DEFAULTS,
});

const emit = defineEmits<CuiCameraPipCardEmits>();

const activityMode = defineModel<CuiCameraCardModels['activityMode']>('activityMode', {
  default: 'always-on',
});
const sourceRole = defineModel<CuiCameraCardModels['sourceRole']>('sourceRole');
const streamingMode = defineModel<CuiCameraCardModels['streamingMode']>('streamingMode');

const { pipSourceRole, cameraInfo, toolbar } = toRefs(props);

const overlayProps = {
  flatCard: true,
  toolbar: false,
  control: false,
  subcontrol: false,
  expandableCard: false,
  cameraNameOverlay: false,
  detectionIndicatorOverlay: false,
  boundingBoxOverlay: false,
  showShortcuts: false,
  liveIndicatorOverlay: false,
  modeOverlay: false,
  doubleClickZoom: false,
  resizable: false,
  viewTransition: false,
  backButton: false,
  isolatedStream: true,
};

const cardARef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cardARef');
const cardBRef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cardBRef');
const swapped = ref(false);
const showPip = ref(false);
const activityModeA = ref<CameraActivityMode>(activityMode.value ?? 'always-on');
const streamingModeA = ref<VideoStreamingMode | undefined>(streamingMode.value);
const activityModeB = ref<CuiCameraCardModels['activityMode']>('always-on');
const sourceRoleB = ref<StreamingRole>(pipSourceRole.value ?? 'low-resolution');
const streamingModeB = ref<VideoStreamingMode | undefined>(streamingMode.value);

const cameraName = computed(() => {
  if (typeof cameraInfo.value === 'string') {
    return cameraInfo.value;
  }
  return cameraInfo.value.name;
});

const { camera: cameraDevice } = useCameraById(cameraName);

// Card B needs its own NVR controller to avoid hijacking Card A's canvas.
// The follower mirrors the main controller's scrub/play/pause/seek calls.
// In CamView (multi-camera), NvrPlaybackMapKey provides per-camera controllers.
// We need the per-camera controller for follower sync, NOT the master controller.
// In single-camera mode, NvrPlaybackKey provides the controller directly.
const nvrMap = inject(NvrPlaybackMapKey, undefined);
const nvrDirect = inject(NvrPlaybackKey, undefined);
const hasNvr = Boolean(nvrMap || nvrDirect);
const cameraId = computed(() => cameraDevice.value?.id ?? '');

// Reactive — in CamView the map populates after mount.
const mainNvr = computed<NvrPlayback | undefined>(() => {
  if (nvrMap?.value) {
    const ctrl = cameraId.value ? nvrMap.value.get(cameraId.value) : undefined;
    if (ctrl) return ctrl;
  }
  return nvrDirect;
});
const pipNvrController = createNvrPlayback(cameraId, { managed: true, sourceRole: 'scrub' });

// Sync follower with main controller — only when PiP is visible and has a source.
// Without this guard, the follower creates duplicate backend sessions (scrub + play)
// for the same camera, causing double JB RESETs, frame interleaving, and decoder errors.
if (hasNvr) {
  watch(
    () => mainNvr.value?.mode.value,
    (mainMode, oldMode) => {
      if (!showPip.value || !hasPipSource.value) {
        // PiP hidden — ensure follower is stopped
        if (pipNvrController.mode.value !== 'idle') {
          pipNvrController.stop();
        }
        return;
      }
      const nvr = mainNvr.value;
      if (!nvr) return;
      if (mainMode === 'idle') {
        pipNvrController.stop();
      } else if (mainMode === 'play' && oldMode !== 'play') {
        pipNvrController.speed.value = nvr.speed.value;
        pipNvrController.muted.value = true; // PiP always muted
        pipNvrController.play(nvr.currentTimestamp.value, true);
      } else if (mainMode === 'pause' && oldMode === 'play') {
        pipNvrController.pause();
      } else if (mainMode === 'play' && oldMode === 'pause') {
        pipNvrController.resume();
      }
    },
  );

  watch(
    () => mainNvr.value?.currentTimestamp.value,
    (tsUs) => {
      if (!showPip.value || !hasPipSource.value) return;
      if (!tsUs) return;
      if (mainNvr.value?.mode.value === 'scrub') {
        pipNvrController.scrub(tsUs, true);
      }
    },
  );

  // Detect a fresh play() call on the main controller (e.g. clicking a recording
  // while already in play mode). The mode-watcher above doesn't fire on play→play,
  // so we watch playbackAnchor.targetMs which is *only* set inside play() and gets
  // cleared once the first frame arrives — making it a clean "fresh seek" signal.
  watch(
    () => mainNvr.value?.playbackAnchor.value?.targetMs,
    (targetMs) => {
      if (!showPip.value || !hasPipSource.value) return;
      if (!targetMs) return;
      const nvr = mainNvr.value;
      if (!nvr || nvr.mode.value !== 'play') return;
      pipNvrController.speed.value = nvr.speed.value;
      pipNvrController.muted.value = true;
      pipNvrController.play(targetMs * 1000, true);
    },
  );

  watch(
    () => mainNvr.value?.speed.value,
    (newSpeed) => {
      if (!showPip.value || !hasPipSource.value) return;
      if (!newSpeed) return;
      if (mainNvr.value?.mode.value === 'play') {
        pipNvrController.setSpeed(newSpeed);
      }
    },
  );
}

const pipSourceRoleResolved = computed<StreamingRole | undefined>(() => {
  if (pipSourceRole.value) {
    return pipSourceRole.value;
  }

  const sources = cameraDevice.value?.camera.value?.sources;
  if (!sources?.length) return undefined;

  // Use sourceRole directly (not cardARef.activeResolution) to avoid dependency on
  // Card A's reactive state. cardARef.activeResolution changes during PiP swap when
  // nvrController changes, causing hasPipSource to flicker → follower stop/restart → visual revert.
  const mainRole = sourceRole.value ?? 'high-resolution';

  const mainSource = sources.find((s) => s.role === mainRole);
  if (!mainSource?.childSourceId) return undefined;

  const childSource = sources.find((s) => s._id === mainSource.childSourceId);
  return childSource?.role as StreamingRole | undefined;
});

const hasPipSource = computed(() => Boolean(pipSourceRoleResolved.value));

// When PiP becomes visible during active playback/scrub, sync follower immediately.
// When PiP is hidden, stop the follower to avoid duplicate backend sessions.
if (hasNvr) {
  watch([showPip, hasPipSource], ([pip, has]) => {
    const nvr = mainNvr.value;
    if (pip && has && nvr) {
      if (nvr.mode.value === 'play') {
        pipNvrController.speed.value = nvr.speed.value;
        pipNvrController.muted.value = true;
        pipNvrController.play(nvr.currentTimestamp.value, true);
      } else if (nvr.mode.value === 'scrub' && nvr.currentTimestamp.value) {
        pipNvrController.scrub(nvr.currentTimestamp.value, true);
      }
    } else if (!pip || !has) {
      if (pipNvrController.mode.value !== 'idle') {
        pipNvrController.stop();
      }
    }
  });
}

// Main controller's sourceRole is owned by the master CuiCameraCard (which
// binds it to camera.streamingSource / user quality choice). The PiP overlay
// runs its own `pipNvrController` with a fixed `'scrub'` role, so we don't
// need to touch the main controller's role here — that would stomp on the
// user's quality selection. Previous versions did that as a DualPipeline-era
// bandwidth-saving trick with magic values ("recording"/"scrub") that no
// longer match the multi-tier role set (high/mid/low/scrub).

const mainControlVisible = computed(() => {
  const mainCard = swapped.value ? cardBRef.value : cardARef.value;
  return mainCard?.showControl ?? false;
});

// toolbar height (60px + border) + 8px base, raised further when player controls visible
const pipBottomOffset = computed(() => {
  const base = toolbar.value ? 68 : 8; // 60px toolbar + 8px gap, or just 8px
  const raised = mainControlVisible.value ? 48 : 0; // control bar ~48px
  return `${base + raised}px`;
});

// Controllers stay fixed on their cards — Card A always uses mainNvr, Card B always uses pipNvrController.
// Only visual props (overlay chrome vs full UI) swap based on position.
// This ensures swap actually moves the content: Card A's canvas (mainNvr/4K) moves to overlay,
// Card B's canvas (pipNvr/sub-stream) moves to main.
// If we also swapped controllers, the content would follow the visual position and cancel out the CSS swap.
//
// In CamView (nvrMap available), Card A must NOT receive nvrController — it resolves
// the per-camera controller from the map itself. Passing the master controller would
// short-circuit the map lookup and bind the master's (unused) canvas instead.
// In CamView (nvrMap), PiP overlay makes no sense — cameras are already side-by-side.
const pipEnabled = computed(() => !nvrMap && hasPipSource.value);

const propsA = computed(() => {
  const nvrCtrl = nvrMap ? undefined : mainNvr.value;
  const base = { ...props, nvrController: nvrCtrl };
  if (swapped.value) {
    return { ...base, ...overlayProps };
  }
  return {
    ...base,
    toolbarPipToggleButton: pipEnabled.value,
    toolbarPipToggleActive: showPip.value,
  };
});

const propsB = computed(() => {
  const base = { ...props, nvrController: pipNvrController };
  if (swapped.value) {
    return {
      ...base,
      toolbarPipToggleButton: pipEnabled.value,
      toolbarPipToggleActive: showPip.value,
    };
  }
  return { ...base, ...overlayProps };
});

const activeCard = computed(() => (swapped.value ? cardBRef.value : cardARef.value));

function swap() {
  if (!hasPipSource.value) return;
  swapped.value = !swapped.value;
  emit('swap');
}

function togglePip(state?: boolean) {
  const newState = state !== undefined ? state : !showPip.value;
  showPip.value = newState;
}

function onExpand(expanded: boolean) {
  emit('expand', expanded);
}

function onStreamALoaded(state: boolean) {
  if (!swapped.value) {
    emit('streamFinishedLoading', state);
  }
}

function onStreamBLoaded(state: boolean) {
  if (swapped.value) {
    emit('streamFinishedLoading', state);
  }
}

function togglePlay() {
  return activeCard.value?.togglePlay();
}
function toggleSourceRole(state?: StreamingRole) {
  return activeCard.value?.toggleSourceRole(state);
}
function togglePictureInPicture() {
  return activeCard.value?.togglePictureInPicture();
}
function toggleActivityMode(state?: CuiCameraCardModels['activityMode']) {
  return activeCard.value?.toggleActivityMode(state);
}
function toggleStreamingMode(state?: CuiCameraCardModels['streamingMode']) {
  return activeCard.value?.toggleStreamingMode(state);
}
function toggleFs() {
  return activeCard.value?.toggleFs();
}
function toggleMute(state?: boolean) {
  return activeCard.value?.toggleMute(state);
}
function toggleMicrophone(state?: boolean, enableSpeaker?: boolean) {
  return activeCard.value?.toggleMicrophone(state, enableSpeaker);
}
function toggleShortcuts() {
  return activeCard.value?.toggleShortcuts();
}
function togglePtz() {
  return activeCard.value?.togglePtz();
}
function toggleFastForward() {
  return activeCard.value?.toggleFastForward();
}
function toggleRewind() {
  return activeCard.value?.toggleRewind();
}
function toggleBbox(state?: boolean) {
  return activeCard.value?.toggleBbox(state);
}
function toggleZones() {
  return activeCard.value?.toggleZones();
}
function toggleTimeline() {
  return activeCard.value?.toggleTimeline();
}
function timelineScroll(scrolling: boolean) {
  return activeCard.value?.timelineScroll(scrolling);
}
function captureScreenshot() {
  return activeCard.value?.captureScreenshot();
}

watch(activityModeA, (val) => (activityMode.value = val));

watch(streamingModeA, (val) => (streamingMode.value = val));

watch(streamingMode, (val) => {
  streamingModeA.value = val;
  streamingModeB.value = val;
});

watch(
  pipSourceRoleResolved,
  (role) => {
    if (role) {
      sourceRoleB.value = role;
    }
  },
  { immediate: true },
);

defineExpose({
  swapped,
  showPip,
  cardA: cardARef,
  cardB: cardBRef,
  swap,
  togglePip,
  togglePlay,
  toggleSourceRole,
  togglePictureInPicture,
  toggleActivityMode,
  toggleStreamingMode,
  toggleFs,
  toggleMute,
  toggleMicrophone,
  toggleShortcuts,
  togglePtz,
  toggleFastForward,
  toggleRewind,
  toggleBbox,
  toggleZones,
  toggleTimeline,
  micActive: computed(() => activeCard.value?.micActive ?? false),
  streamHasIntercom: computed(() => activeCard.value?.streamHasIntercom ?? false),
  micButtonDisabled: computed(() => activeCard.value?.micButtonDisabled ?? true),
  isFullscreen: computed(() => activeCard.value?.isFullscreen ?? false),
  timelineState: computed(() => activeCard.value?.timelineState),
  trimMode: computed(() => activeCard.value?.trimMode),
  timelineScroll,
  captureScreenshot,
});
</script>

<style scoped>
.cui-pip-wrapper {
  position: relative;
  height: 100%;
  min-width: 0;
}

.pip-main-position {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.pip-overlay-position {
  position: absolute;
  bottom: var(--pip-bottom, 8px);
  left: 8px;
  width: 25%;
  min-width: 140px;
  max-width: 220px;
  height: auto;
  z-index: 10;
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  border: 2px solid var(--p-surface-300);
  transition: bottom 0.2s ease;
}

:deep(.dark) .pip-overlay-position {
  border-color: var(--p-surface-600);
}
</style>
