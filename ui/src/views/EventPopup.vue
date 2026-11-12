<template>
  <div ref="rootRef" class="event-popup" @dblclick="onDoubleClick">
    <template v-if="event">
      <CuiCameraCard
        ref="cardRef"
        :key="event.cameraId"
        :camera-info="event.cameraName"
        activity-mode="always-on"
        source-role="low-resolution"
        card-fit="cover"
        card-click-action="none"
        flat-card
        detection-icons-overlay
        :double-click-zoom="false"
        :camera-name-overlay="false"
        :toolbar="false"
        :control="false"
        :subcontrol="false"
        class="w-full h-full"
        @stream-finished-loading="onStreamLoading"
        @mute-change="muted = $event"
      />

      <img v-if="poster && !streaming" :src="poster" alt="" class="event-popup-poster" />

      <div class="event-popup-header" :class="{ 'event-popup-header-faded': !titleShown && !hovered }">
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ event.title }}</p>
          <p v-if="event.subtitle" class="truncate text-xs text-white/80">{{ event.subtitle }}</p>
        </div>

        <div class="event-popup-actions">
          <Button
            v-tooltip.bottom="{ value: pinned ? $t('views.event_popup.unpin') : $t('views.event_popup.pin') }"
            class="dark-mode cui-icon-md hover:bg-black/40 active:bg-black/60"
            rounded
            text
            severity="contrast"
            @click="togglePin"
          >
            <template #icon>
              <i-mdi:pin v-if="pinned" width="100%" height="100%" />
              <i-mdi:pin-outline v-else width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.bottom="{ value: muted ? $t('views.event_popup.unmute') : $t('views.event_popup.mute') }"
            class="dark-mode cui-icon-md hover:bg-black/40 active:bg-black/60"
            rounded
            text
            severity="contrast"
            @click="cardRef?.toggleMute()"
          >
            <template #icon>
              <i-heroicons:speaker-x-mark-16-solid v-if="muted" width="100%" height="100%" />
              <i-heroicons:speaker-wave-16-solid v-else width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.bottom="{ value: $t('views.event_popup.open') }"
            class="dark-mode cui-icon-md hover:bg-black/40 active:bg-black/60"
            rounded
            text
            severity="contrast"
            @click="act({ type: 'open' })"
          >
            <template #icon>
              <i-mdi:open-in-new width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-if="state && (state.windows > 1 || waiting.length)"
            v-tooltip.bottom="{ value: $t('views.event_popup.close_all') }"
            class="dark-mode cui-icon-md hover:bg-black/40 active:bg-black/60"
            rounded
            text
            severity="contrast"
            @click="act({ type: 'closeAll' })"
          >
            <template #icon>
              <i-mdi:close-box-multiple-outline width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.bottom="{ value: $t('views.event_popup.close') }"
            class="dark-mode cui-icon-md hover:bg-black/40 active:bg-black/60"
            rounded
            text
            severity="contrast"
            @click="act({ type: 'close' })"
          >
            <template #icon>
              <i-mdi:close width="100%" height="100%" />
            </template>
          </Button>
        </div>
      </div>

      <div v-if="waiting.length" ref="deckRef" class="event-popup-deck" :class="{ 'event-popup-deck-open': deckHovered }">
        <button
          v-for="(other, index) in deck"
          :key="other.cameraId"
          v-tooltip.top="{ value: other.subtitle ? `${other.title} · ${other.subtitle}` : other.title }"
          type="button"
          class="event-popup-deck-card"
          :style="{ zIndex: deck.length - index }"
          :aria-label="other.title"
          @click="act({ type: 'switch', cameraId: other.cameraId })"
        >
          <CuiImage :src="notificationImageUrl(other.imageUrl)" alt="" :image-style="{ objectFit: 'cover' }" image-container-class="w-full h-full" />
        </button>
        <span v-if="waiting.length > deck.length" class="event-popup-deck-more">+{{ waiting.length - deck.length }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { useMotionSensor, useObjectSensor } from '@camera.ui/browser';

import { notificationImageUrl } from '@/common/utils.js';

import type CuiCameraCard from '@/components/CuiCameraCard/CuiCameraCard.vue';
import type { EventPopupAction, EventPopupView, IpcRendererEvent } from '@/types/electron';

const { electron } = useElectron();

const LINGER_MS = 10_000;
const PREVIEW_LINGER_MS = 30_000;
const MAX_OPEN_MS = 3 * 60_000;
const TITLE_MS = 5000;

const rootRef = useTemplateRef<HTMLElement>('rootRef');
const deckRef = useTemplateRef<HTMLElement>('deckRef');
const cardRef = useTemplateRef<InstanceType<typeof CuiCameraCard>>('cardRef');
const state = shallowRef<EventPopupView | null>(null);
const streaming = ref(false);
const muted = ref(true);
const titleShown = ref(true);
let lastActivity = 0;
let lastEvent = 0;
let lastHover = 0;
let soundFor: string | undefined;

const hovered = useElementHover(rootRef);
const deckHovered = useElementHover(deckRef);
const { start: fadeTitle } = useTimeoutFn(() => (titleShown.value = false), TITLE_MS, { immediate: false });

const event = computed(() => state.value?.event);
const waiting = computed(() => state.value?.waiting ?? []);
const deck = computed(() => waiting.value.slice(0, deckHovered.value ? 5 : 3));
const pinned = computed(() => state.value?.pinned ?? false);
const poster = computed(() => notificationImageUrl(event.value?.imageUrl));

const { camera: cameraDevice } = useCameraById(() => event.value?.cameraId ?? '');
const { sensor: motionSensor } = useMotionSensor(cameraDevice);
const { sensor: objectSensor } = useObjectSensor(cameraDevice);

const detecting = computed(() => Boolean(motionSensor.value?.properties.detected || objectSensor.value?.properties.detected));

useIntervalFn(() => {
  if (!event.value || pinned.value) return;
  const now = Date.now();
  if (detecting.value) lastActivity = now;
  if (hovered.value) lastHover = now;
  if (now - lastHover < LINGER_MS) return;
  const linger = event.value.source === 'test' ? PREVIEW_LINGER_MS : LINGER_MS;
  if (now - lastActivity > linger || now - lastEvent > MAX_OPEN_MS) act({ type: 'expire' });
}, 1000);

function show(next: EventPopupView | null): void {
  const previous = state.value?.event;
  state.value = next;
  if (!next || next.event.id === previous?.id) return;

  lastEvent = Date.now();
  lastActivity = lastEvent;
  titleShown.value = true;
  fadeTitle();
  if (next.event.cameraId !== previous?.cameraId) {
    streaming.value = false;
    muted.value = true;
  }
  applySound();
}

function applySound(): void {
  const current = state.value;
  if (!current?.sound || !streaming.value || soundFor === current.event.id) return;
  soundFor = current.event.id;
  cardRef.value?.toggleMute(false);
}

function onStreamLoading(loaded: boolean): void {
  streaming.value = loaded;
  applySound();
}

function act(action: EventPopupAction): void {
  electron?.send('event-popup-action', action);
}

function togglePin(): void {
  if (!state.value) return;
  const pin = !state.value.pinned;
  state.value = { ...state.value, pinned: pin };
  lastEvent = Date.now();
  lastActivity = lastEvent;
  act({ type: pin ? 'pin' : 'unpin' });
}

function onDoubleClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).closest('button')) return;
  act({ type: 'open' });
}

function onEvent(_event: IpcRendererEvent, data: EventPopupView | null): void {
  show(data);
}

onMounted(async () => {
  electron?.on('event-popup', onEvent);
  show((await electron?.invoke('get-event-popup')) ?? null);
});

onUnmounted(() => {
  electron?.removeListener('event-popup', onEvent);
});
</script>

<style scoped>
.event-popup {
  position: relative;
  width: 100dvw;
  height: 100dvh;
  overflow: hidden;
  background: #000000;
}

.event-popup-poster {
  position: absolute;
  inset: 0;
  z-index: 5;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.event-popup-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.5rem 1.5rem 0.75rem;
  color: #ffffff;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent);
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.event-popup-header-faded {
  opacity: 0;
}

.event-popup-actions {
  display: flex;
  flex-shrink: 0;
  gap: 0.125rem;
  padding: 0.125rem;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.4);
  opacity: 0;
  pointer-events: auto;
  transition: opacity 0.2s ease;
}

.event-popup:hover .event-popup-actions,
.event-popup-actions:focus-within {
  opacity: 1;
}

.event-popup-deck {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  z-index: 10;
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
}

.event-popup-deck-card {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1.5px solid rgba(255, 255, 255, 0.8);
  border-radius: 0.375rem;
  color: #ffffff;
  background: #1f1f1f;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  cursor: pointer;
  transition:
    margin 0.2s ease,
    transform 0.2s ease,
    border-color 0.2s ease;
}

/* the cards behind the newest one peek out to its left */
.event-popup-deck-card + .event-popup-deck-card {
  margin-right: -2.875rem;
}

.event-popup-deck-open .event-popup-deck-card + .event-popup-deck-card {
  margin-right: 0.25rem;
}

.event-popup-deck-card:hover {
  border-color: #ffffff;
  transform: translateY(-2px);
}

.event-popup-deck-more {
  margin-right: 0.375rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.6);
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
