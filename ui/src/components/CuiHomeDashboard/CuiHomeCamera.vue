<template>
  <div
    ref="rootRef"
    class="home-camera select-none"
    :class="{ 'no-tab-swipe': cameras.length > 1 }"
    :style="{ viewTransitionName: morphTarget ? 'camera-morph' : undefined }"
    :data-camera-morph="morphTarget || undefined"
  >
    <CuiCameraCard
      v-if="live"
      ref="cardRef"
      :key="shown._id"
      :camera-info="shown"
      flat-card
      :card-fit="pictureFit"
      :router-link="cameraPath"
      :card-click-action="fullscreen ? 'none' : 'redirect'"
      :toolbar="false"
      :control="fullscreen"
      :subcontrol="fullscreen"
      :double-click-zoom="false"
      :camera-name-overlay="fullscreen"
      :bounding-box-overlay="false"
      detection-indicator-overlay
      :detection-icons-overlay="fullscreen"
      fullscreen-shortcuts
      fullscreen-timeline
      embedded-timeline
      class="home-camera__view w-full h-full"
      :data-enter="direction"
      @fullscreen="onFullscreen"
    />
    <RouterLink v-else :key="shown._id" :to="cameraPath" class="home-camera__view block w-full h-full" :data-enter="direction">
      <CuiCameraSnapshot :camera="shown" width="100%" height="100%" :object-fit="pictureFit" show-timestamp />
    </RouterLink>

    <div class="home-camera__top">
      <span v-if="live" class="home-camera__live">
        <span class="home-camera__live-dot" />
        {{ t('views.home_dashboard.live') }}
      </span>
      <span class="home-camera__name">
        <span class="home-camera__title">{{ shown.name }}</span>
        <span v-if="room" class="home-camera__room">{{ room }}</span>
      </span>
      <span v-if="detection" class="home-camera__detection">
        <component :is="detectionStyle(detection.type).icon" class="home-camera__detection-icon" :style="{ color: detectionStyle(detection.type).color }" />
        {{ t(detectionLabelKey(detection.type)) }} · {{ timeAgo(detection.time) }}
      </span>
    </div>

    <div v-if="!editing" class="home-camera__bar" :class="{ 'home-camera__bar--open': open && layout === 'row' }">
      <div v-if="cameras.length > 1" class="home-camera__switch" :style="{ '--rotate': `${rotate}s` }">
        <button
          v-for="camera in cameras"
          :key="camera._id"
          v-tooltip.top="camera.name"
          type="button"
          class="home-camera__dot"
          :class="{ 'home-camera__dot--active': camera._id === shown._id, 'home-camera__dot--timed': timed && camera._id === shown._id }"
          :aria-label="t('views.home_dashboard.show_camera', { name: camera.name })"
          :aria-pressed="camera._id === shown._id"
          @click="show(camera._id)"
        />
      </div>

      <div class="home-camera__end">
        <div v-if="playable" class="home-camera__actions" :inert="open && layout === 'row'">
          <Button
            v-tooltip.top="t(live ? 'views.home_dashboard.show_snapshot' : 'views.home_dashboard.show_live')"
            severity="secondary"
            rounded
            class="dark-mode cui-icon-md"
            :aria-label="t(live ? 'views.home_dashboard.show_snapshot' : 'views.home_dashboard.show_live')"
            @click="live = !live"
          >
            <template #icon>
              <i-solar:stop-bold v-if="live" width="60%" height="60%" />
              <i-solar:play-bold v-else width="70%" height="70%" />
            </template>
          </Button>
          <template v-if="live">
            <Button
              v-if="cardRef?.streamHasSound"
              v-tooltip.top="t(speakerOn ? 'components.form.tooltip.mute' : 'components.form.tooltip.unmute')"
              severity="secondary"
              rounded
              class="home-camera__extra dark-mode cui-icon-md"
              :aria-label="t(speakerOn ? 'components.form.tooltip.mute' : 'components.form.tooltip.unmute')"
              :aria-pressed="speakerOn"
              @click="cardRef.toggleMute()"
            >
              <template #icon>
                <i-heroicons:speaker-wave-16-solid v-if="speakerOn" width="100%" height="100%" />
                <i-heroicons:speaker-x-mark-16-solid v-else width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-if="cardRef?.streamHasIntercom"
              v-tooltip.top="t(talking ? 'views.home_dashboard.talk_stop' : 'views.home_dashboard.talk')"
              :severity="talking ? 'primary' : 'secondary'"
              rounded
              class="home-camera__extra dark-mode cui-icon-md"
              :disabled="cardRef.micButtonDisabled"
              :aria-label="t(talking ? 'views.home_dashboard.talk_stop' : 'views.home_dashboard.talk')"
              :aria-pressed="talking"
              @click="cardRef.toggleMicrophone()"
            >
              <template #icon>
                <i-mdi:microphone v-if="talking" width="100%" height="100%" />
                <i-mdi:microphone-outline v-else width="100%" height="100%" />
              </template>
            </Button>
            <Button
              v-tooltip.top="t('views.home_dashboard.fullscreen')"
              severity="secondary"
              rounded
              class="dark-mode cui-icon-md"
              :aria-label="t('views.home_dashboard.fullscreen')"
              @click="cardRef?.toggleFs()"
            >
              <template #icon>
                <i-mdi:fullscreen width="100%" height="100%" />
              </template>
            </Button>
          </template>
        </div>
        <template v-if="tools.length">
          <Button
            v-if="layout === 'menu'"
            v-tooltip.top="t('views.home_dashboard.camera_actions')"
            severity="secondary"
            rounded
            class="home-camera__more dark-mode cui-icon-md"
            :aria-label="t('views.home_dashboard.camera_actions')"
            aria-haspopup="menu"
            @click="menuRef?.toggleMenu($event)"
          >
            <template #icon>
              <CuiDotsIcon :open="!!menuRef?.isOpen" class="home-camera__dots" />
            </template>
          </Button>
          <Button
            v-else
            v-tooltip.top="t('views.home_dashboard.camera_actions')"
            severity="secondary"
            rounded
            class="home-camera__more dark-mode cui-icon-md"
            :aria-label="t('views.home_dashboard.camera_actions')"
            :aria-expanded="open"
            @click="open = !open"
          >
            <template #icon>
              <CuiDotsIcon :open class="home-camera__dots" />
            </template>
          </Button>
        </template>
      </div>

      <div v-if="tools.length && layout !== 'menu'" class="home-camera__tools" :class="{ 'home-camera__tools--up': layout === 'column' }" :inert="!open">
        <Button
          v-for="tool in tools"
          :key="tool.key"
          v-tooltip.top="tool.label"
          :severity="tool.on ? 'primary' : 'secondary'"
          rounded
          class="dark-mode cui-icon-md"
          :loading="tool.busy"
          :aria-label="tool.label"
          :aria-pressed="tool.on"
          @click="tool.run()"
        >
          <template #icon>
            <component :is="tool.icon" width="100%" height="100%" />
          </template>
        </Button>
      </div>
    </div>

    <CuiMenu v-if="layout === 'menu' && tools.length" ref="menuRef" :items="toolItems" />
  </div>
</template>

<script lang="ts">
const shownCameras = new Map<string, string>();
</script>

<script setup lang="ts">
import { useNvrPlayback, useRecordingExport } from '@camera.ui/nvr';
import LogIcon from '~icons/icon-park-outline/terminal';
import SettingsIcon from '~icons/mdi/cog';
import PowerIcon from '~icons/mdi/power';

import { bulkPatchCamerasFn } from '@/api/routes/cameras.js';
import { inPrivacy, usePrivacyActive, usePrivacySwitch } from '@/common/cameraPrivacy.js';
import { detectionStyle } from '@/common/detectionLabels.js';
import { detectionLabelKey } from '@/common/eventLabels.js';
import { extractErrorMessage } from '@/common/utils.js';
import CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import { useRelativeTime } from '@/components/CuiSensorTile/useRelativeTime.js';

import { HOME_ACTION_LOOKS } from './actions.js';
import { useCameraRotation } from './useCameraRotation.js';

import type { BulkPatchCamerasInput } from '@shared/types';
import type { MenuItem } from '../CuiMenu/types.js';
import type { CuiHomeCameraProps, HomeCameraTool } from './types.js';

const props = defineProps<CuiHomeCameraProps>();

const { t } = useI18n();
const { now, timeAgo } = useRelativeTime();
const drawer = useCuiCameraDrawer();
const toast = useCuiToast();
const queryClient = useQueryClient();
const { openCameraConsole } = useCameraConsoleDialog();
const { switching, setPrivacy } = usePrivacySwitch();
const { isAvailable: hasNvr } = useRecordingExport();

const routerStore = useRouterStore();

const RECENT_MS = 10 * 60_000;
const TOOL_STEP = 32;
const BAR_INSET = 16;
const TOP_ROOM = 64;
const SWIPE_PX = 40;

const isAdmin = hasPermission(undefined, 'admin');

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const cardRef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cardRef');
const menuRef = useTemplateRef('menuRef');

const live = ref(false);
const shownId = ref(shownCameras.get(props.camera._id) ?? props.camera._id);
const fullscreen = ref(false);
const open = ref(false);
const busy = ref<string>();

let mouseStart: { x: number; y: number } | undefined;
let dragged = false;

const { width: cardWidth, height: cardHeight } = useElementSize(rootRef);

const shown = computed(() => props.cameras.find((camera) => camera._id === shownId.value) ?? props.camera);
const isPrivate = usePrivacyActive(shown);
const room = computed(() => (shown.value.roomId ? props.roomNames.get(shown.value.roomId) : undefined));
const cameraPath = computed(() => `/cameras/${encodeURIComponent(shown.value.name)}`);
const morphTarget = computed(() => routerStore.morphCamera === shown.value.name);
const talking = computed(() => !!cardRef.value?.micActive);
const speakerOn = computed(() => !!cardRef.value?.speakerOn);
const detection = computed(() => {
  if (isPrivate.value) return undefined;
  const latest = props.detections.get(shown.value._id);
  if (!latest) return undefined;
  // the home lists get no ticks, a running event is now
  if (latest.active) return { ...latest, time: now.value.getTime() };
  return now.value.getTime() - latest.time < RECENT_MS ? latest : undefined;
});
const followable = computed(
  () => new Map([...props.activity].filter(([id]) => props.cameras.some((camera) => camera._id === id && !camera.disabled && !inPrivacy(camera)))),
);
const pictureFit = computed(() => (props.fit === 'aspect' ? 'contain' : props.fit));
const playable = computed(() => !shown.value.disabled && !isPrivate.value);
const tools = computed<HomeCameraTool[]>(() => {
  if (!isAdmin) return [];
  const camera = shown.value;
  const power: HomeCameraTool = {
    key: 'power',
    label: t(camera.disabled ? 'views.home_dashboard.camera_enable' : 'views.home_dashboard.camera_disable'),
    icon: PowerIcon,
    on: camera.disabled,
    busy: busy.value === 'power',
    run: () => patch('power', { disabled: !camera.disabled }),
  };
  const settings: HomeCameraTool = { key: 'settings', label: t('components.player.settings'), icon: SettingsIcon, run: () => drawer.open({ cameraName: camera.name }) };
  if (camera.disabled) return [settings, power];

  const snoozed = !!camera.detectionSettings?.snooze;
  const paused = !!camera.recordingSettings?.paused;
  return [
    settings,
    { key: 'log', label: t('components.player.log'), icon: LogIcon, run: () => openCameraConsole(camera) },
    {
      key: 'snooze',
      label: t(snoozed ? 'views.home_dashboard.detection_resume' : 'views.home_dashboard.detection_pause'),
      icon: snoozed ? HOME_ACTION_LOOKS.snooze.onIcon : HOME_ACTION_LOOKS.snooze.icon,
      on: snoozed,
      busy: busy.value === 'snooze',
      run: () => patch('snooze', { detectionSettings: { snooze: !snoozed } }),
    },
    {
      key: 'privacy',
      label: t(isPrivate.value ? 'components.player.privacy_off' : 'components.player.privacy_on'),
      icon: isPrivate.value ? HOME_ACTION_LOOKS.privacy.onIcon : HOME_ACTION_LOOKS.privacy.icon,
      on: isPrivate.value,
      busy: switching.value,
      run: () => setPrivacy(camera.name, !isPrivate.value),
    },
    ...(hasNvr.value && camera.recordingSettings?.enabled
      ? [
          {
            key: 'recording',
            label: t(paused ? 'views.home_dashboard.recording_resume' : 'views.home_dashboard.recording_pause'),
            icon: paused ? HOME_ACTION_LOOKS.recording.onIcon : HOME_ACTION_LOOKS.recording.icon,
            on: paused,
            busy: busy.value === 'recording',
            run: () => patch('recording', { recordingSettings: { paused: !paused } }),
          },
        ]
      : []),
    power,
  ];
});
const toolItems = computed<MenuItem[]>(() =>
  tools.value.map((tool) => ({ key: tool.key, label: tool.label, icon: tool.icon, active: tool.on, loading: tool.busy, onClick: tool.run })),
);

const layout = computed(() => {
  const length = (tools.value.length + 1) * TOOL_STEP + 2 * BAR_INSET;
  if (cardWidth.value >= length) return 'row';
  return cardHeight.value >= length + TOP_ROOM ? 'column' : 'menu';
});

const onScreen = useElementVisibility(rootRef);
const page = useDocumentVisibility();
const { direction, timed, show, step } = useCameraRotation({
  ids: () => props.cameras.map((camera) => camera._id),
  shownId,
  seconds: () => props.rotate,
  follow: () => props.follow,
  activity: () => followable.value,
  paused: () => props.editing || fullscreen.value || talking.value,
  waiting: () => live.value || !onScreen.value || page.value === 'hidden',
});

useSwipe(rootRef, {
  threshold: SWIPE_PX,
  onSwipeEnd: (_, swiped) => {
    if (props.editing || fullscreen.value) return;
    if (swiped === 'left') step('next');
    else if (swiped === 'right') step('previous');
  },
});

useEventListener(
  rootRef,
  'pointerdown',
  (event: PointerEvent) => {
    const switchable = props.cameras.length > 1 && !props.editing && !fullscreen.value;
    const onButton = (event.target as Element).closest('button');
    mouseStart = switchable && event.pointerType === 'mouse' && event.button === 0 && !onButton ? { x: event.clientX, y: event.clientY } : undefined;
  },
  { capture: true, passive: true },
);

useEventListener(
  rootRef,
  'pointerup',
  (event: PointerEvent) => {
    if (!mouseStart) return;
    const dx = event.clientX - mouseStart.x;
    const dy = event.clientY - mouseStart.y;
    mouseStart = undefined;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    step(dx < 0 ? 'next' : 'previous');
    dragged = true;
    setTimeout(() => (dragged = false));
  },
  { capture: true, passive: true },
);

useEventListener(rootRef, 'dragstart', (event: DragEvent) => {
  if (mouseStart) event.preventDefault();
});

useEventListener(
  rootRef,
  'click',
  (event: MouseEvent) => {
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
  },
  { capture: true },
);

const nvrController = useNvrPlayback(
  computed(() => shown.value._id),
  { sourceRole: computed(() => shown.value.interfaceSettings.playbackSource) },
);

async function patch(key: string, cameraData: BulkPatchCamerasInput['cameraData']) {
  busy.value = key;
  try {
    const { failed } = await bulkPatchCamerasFn({ cameranames: [shown.value.name], cameraData });
    if (failed.length) toast.add({ severity: 'error', detail: failed.map((entry) => entry.error).join(', '), life: 5000 });
  } catch (error) {
    toast.add({ severity: 'error', detail: extractErrorMessage(error), life: 4000 });
  } finally {
    await queryClient.refetchQueries({ queryKey: ['camerasList'] });
    busy.value = undefined;
  }
}

function onFullscreen(active: boolean) {
  fullscreen.value = active;
  if (!active && nvrController.isActive.value) nvrController.stop();
}

watch(
  () => props.camera._id,
  (id) => (shownId.value = id),
);

watch(shownId, (id) => shownCameras.set(props.camera._id, id));

watch(live, () => (direction.value = undefined));

watch([shownId, () => props.editing, layout], () => (open.value = false));

watch(
  () => isPrivate.value || shown.value.disabled,
  (blocked) => {
    if (blocked) live.value = false;
  },
);
</script>

<style scoped>
.home-camera {
  position: relative;
  height: 100%;
  overflow: hidden;
  border-radius: 1.5rem;
  background: #000;
  box-shadow: inset 0 0 0 1px var(--border-color);
  container: home-camera / inline-size;
}

.home-camera__top {
  position: absolute;
  inset: 0 0 auto;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1rem 2rem;
  background: linear-gradient(rgb(0 0 0 / 0.45), transparent);
  pointer-events: none;
}

.home-camera__live {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  color: white;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.home-camera__live-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--p-red-500);
}

.home-camera__name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: white;
  text-shadow: 0 1px 2px rgb(0 0 0 / 0.5);
}

.home-camera__detection {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
  margin-left: auto;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.45);
  backdrop-filter: blur(12px);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.home-camera__detection-icon {
  width: 0.875rem;
  height: 0.875rem;
}

/* the name needs the room on a narrow card */
@container home-camera (width < 20rem) {
  .home-camera__detection {
    display: none;
  }
}

.home-camera__title,
.home-camera__room {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-camera__title {
  font-size: 0.9375rem;
  font-weight: 600;
}

.home-camera__room {
  font-size: 0.8125rem;
  opacity: 0.8;
}

.home-camera__bar {
  position: absolute;
  inset: auto 0 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 1rem;
  pointer-events: none;
}

.home-camera__switch {
  display: flex;
  min-width: 0;
  height: 1.75rem;
  padding: 0 0.125rem;
  overflow: hidden;
  border-radius: 9999px;
  background: rgb(0 0 0 / 0.6);
  pointer-events: auto;
}

.home-camera__dot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  padding: 0 0.3125rem;
  border-radius: 9999px;
  cursor: pointer;
}

.home-camera__dot::before {
  content: '';
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 9999px;
  background: white;
  opacity: 0.5;
  transition:
    width 0.2s ease,
    opacity 0.2s ease;
}

.home-camera__dot:hover::before,
.home-camera__dot--active::before {
  opacity: 1;
}

.home-camera__dot--active::before {
  width: 1rem;
}

.home-camera__dot--timed::before {
  background: linear-gradient(white, white) left / 0 100% no-repeat rgb(255 255 255 / 0.45);
  animation: home-camera-timer var(--rotate) linear forwards;
}

@keyframes home-camera-timer {
  to {
    background-size: 100% 100%;
  }
}

.home-camera__view[data-enter] {
  animation: home-camera-enter 0.25s ease-out;
}

.home-camera__view[data-enter='previous'] {
  --enter-from: -12%;
}

@keyframes home-camera-enter {
  from {
    opacity: 0.4;
    translate: var(--enter-from, 12%) 0;
  }
}

.home-camera__dot:focus-visible {
  outline: 2px solid white;
  outline-offset: -2px;
}

.home-camera__end {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  margin-left: auto;
}

.home-camera__actions {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 0.25rem;
  pointer-events: auto;
  transition:
    opacity 0.2s ease,
    translate 0.2s ease;
}

.home-camera__bar--open .home-camera__actions,
.home-camera__bar--open .home-camera__switch {
  opacity: 0;
  translate: -0.5rem 0;
  pointer-events: none;
}

.home-camera__switch {
  transition: opacity 0.2s ease;
}

.home-camera__more {
  flex-shrink: 0;
  pointer-events: auto;
}

.home-camera__dots {
  --cui-dots-size: 4px;
  --cui-dots-gap: 2px;
}

.home-camera__tools {
  position: absolute;
  right: 3rem;
  bottom: 1rem;
  display: flex;
  flex-direction: row-reverse;
  gap: 0.25rem;
  pointer-events: auto;
  transition:
    opacity 0.2s ease,
    translate 0.2s ease,
    visibility 0.2s;
}

.home-camera__tools--up {
  right: 1rem;
  bottom: 3rem;
  flex-direction: column-reverse;
}

.home-camera__tools[inert] {
  visibility: hidden;
  opacity: 0;
  translate: 0.75rem 0;
}

.home-camera__tools--up[inert] {
  translate: 0 0.75rem;
}

@container home-camera (width < 14rem) {
  .home-camera__extra {
    display: none;
  }
}
</style>
