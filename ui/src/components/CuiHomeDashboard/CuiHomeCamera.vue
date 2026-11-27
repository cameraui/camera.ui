<template>
  <div
    ref="rootRef"
    class="home-camera"
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
      <CuiCameraSnapshot ref="snapshotRef" :camera="shown" width="100%" height="100%" :object-fit="pictureFit" show-timestamp />
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

    <div v-if="!editing" class="home-camera__bar">
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

      <div class="home-camera__actions">
        <template v-if="!shown.disabled && !isPrivate">
          <template v-if="live">
            <Button
              v-if="cardRef?.streamHasSound"
              v-tooltip.top="t(speakerOn ? 'components.form.tooltip.mute' : 'components.form.tooltip.unmute')"
              severity="secondary"
              rounded
              class="dark-mode cui-icon-md"
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
              class="dark-mode cui-icon-md"
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
          </template>
          <Button
            v-else
            v-tooltip.top="t('components.player.refresh_snapshot')"
            severity="secondary"
            rounded
            class="home-camera__tool dark-mode cui-icon-md"
            :aria-label="t('components.player.refresh_snapshot')"
            @click="snapshotRef?.refresh()"
          >
            <template #icon>
              <i-material-symbols:refresh-rounded width="100%" height="100%" />
            </template>
          </Button>
          <Button
            v-if="isAdmin"
            v-tooltip.top="t('components.player.log')"
            severity="secondary"
            rounded
            class="home-camera__tool dark-mode cui-icon-md"
            :aria-label="t('components.player.log')"
            @click="openCameraConsole(shown)"
          >
            <template #icon>
              <i-icon-park-outline:terminal width="100%" height="100%" />
            </template>
          </Button>
        </template>
        <Button
          v-if="isAdmin && !shown.disabled"
          v-tooltip.top="t(isPrivate ? 'components.player.privacy_off' : 'components.player.privacy_on')"
          :severity="isPrivate ? 'primary' : 'secondary'"
          rounded
          class="dark-mode cui-icon-md"
          :class="{ 'home-camera__tool': !isPrivate }"
          :loading="switching"
          :aria-label="t(isPrivate ? 'components.player.privacy_off' : 'components.player.privacy_on')"
          :aria-pressed="isPrivate"
          @click="setPrivacy(shown.name, !isPrivate)"
        >
          <template #icon>
            <i-mdi:eye-off v-if="isPrivate" width="100%" height="100%" />
            <i-mdi:eye-outline v-else width="100%" height="100%" />
          </template>
        </Button>
        <Button
          v-if="isAdmin"
          v-tooltip.top="t('components.player.settings')"
          severity="secondary"
          rounded
          class="home-camera__tool dark-mode cui-icon-md"
          :aria-label="t('components.player.settings')"
          @click="drawer.open({ cameraName: shown.name })"
        >
          <template #icon>
            <i-mdi:cog width="100%" height="100%" />
          </template>
        </Button>
        <template v-if="!shown.disabled && !isPrivate">
          <Button
            v-if="live"
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
          <Button
            v-tooltip.top="t(live ? 'views.home_dashboard.show_snapshot' : 'views.home_dashboard.show_live')"
            severity="secondary"
            rounded
            class="dark-mode cui-icon-md"
            :aria-label="t(live ? 'views.home_dashboard.show_snapshot' : 'views.home_dashboard.show_live')"
            @click="live = !live"
          >
            <template #icon>
              <i-mdi:stop v-if="live" width="100%" height="100%" />
              <i-mdi:play v-else width="100%" height="100%" />
            </template>
          </Button>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
const shownCameras = new Map<string, string>();
</script>

<script setup lang="ts">
import { useNvrPlayback } from '@camera.ui/nvr';

import { inPrivacy, usePrivacyActive, usePrivacySwitch } from '@/common/cameraPrivacy.js';
import { detectionStyle } from '@/common/detectionLabels.js';
import { detectionLabelKey } from '@/common/eventLabels.js';
import CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import { useRelativeTime } from '@/components/CuiSensorTile/useRelativeTime.js';

import { useCameraRotation } from './useCameraRotation.js';

import type { CuiHomeCameraProps } from './types.js';

const props = defineProps<CuiHomeCameraProps>();

const { t } = useI18n();
const { now, timeAgo } = useRelativeTime();
const drawer = useCuiCameraDrawer();
const { openCameraConsole } = useCameraConsoleDialog();
const { switching, setPrivacy } = usePrivacySwitch();

const routerStore = useRouterStore();

const RECENT_MS = 10 * 60_000;

const isAdmin = hasPermission(undefined, 'admin');

const rootRef = useTemplateRef<HTMLDivElement>('rootRef');
const cardRef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cardRef');
const snapshotRef = useTemplateRef('snapshotRef');

const live = ref(false);
const shownId = ref(shownCameras.get(props.camera._id) ?? props.camera._id);
const fullscreen = ref(false);

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
  return latest && now.value.getTime() - latest.time < RECENT_MS ? latest : undefined;
});
const followable = computed(
  () => new Map([...props.activity].filter(([id]) => props.cameras.some((camera) => camera._id === id && !camera.disabled && !inPrivacy(camera)))),
);
const pictureFit = computed(() => (props.fit === 'aspect' ? 'contain' : props.fit));

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
  threshold: 40,
  onSwipeEnd: (_, swiped) => {
    if (props.editing || fullscreen.value) return;
    if (swiped === 'left') step('next');
    else if (swiped === 'right') step('previous');
  },
});

const nvrController = useNvrPlayback(
  computed(() => shown.value._id),
  { sourceRole: computed(() => shown.value.interfaceSettings.playbackSource) },
);

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

.home-camera__actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  margin-left: auto;
  pointer-events: auto;
}

@container home-camera (width < 18rem) {
  .home-camera__tool {
    display: none;
  }
}
</style>
