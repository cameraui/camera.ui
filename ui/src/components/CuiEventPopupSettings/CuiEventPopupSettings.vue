<template>
  <div v-if="settings">
    <span class="card-title">{{ $t('views.settings.notifications.event_popup') }}</span>
    <Card class="cui-card">
      <template #content>
        <div class="flex flex-col gap-6">
          <span class="text-sm">{{ $t('views.settings.notifications.event_popup_info') }}</span>

          <Message v-if="settings.enabled && paused" severity="secondary" size="small">
            <div class="flex items-center justify-between gap-3">
              <span>{{ $t('views.settings.notifications.event_popup_paused', { time: pausedTime }) }}</span>
              <Button class="cui-button-small" :label="$t('views.settings.notifications.event_popup_resume')" @click="save({ pausedUntil: null })" />
            </div>
          </Message>

          <div class="flex flex-col gap-2">
            <CuiToggleRow :label="$t('views.settings.notifications.event_popup_enable')" :hint="$t('views.settings.notifications.event_popup_enable_info')">
              <ToggleSwitch :model-value="settings.enabled" :loading="saving" @update:model-value="save({ enabled: $event })" />
            </CuiToggleRow>
          </div>

          <div v-if="settings.enabled" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div class="flex flex-col field-gap">
              <label for="event-popup-corner" class="cui-label">{{ $t('views.settings.notifications.event_popup_corner') }}</label>
              <Select
                input-id="event-popup-corner"
                :model-value="settings.corner"
                :options="corners"
                option-label="label"
                option-value="value"
                @update:model-value="save({ corner: $event })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('views.settings.notifications.event_popup_corner_hint')
              }}</Message>
            </div>
            <div class="flex flex-col field-gap">
              <label for="event-popup-size" class="cui-label">{{ $t('views.settings.notifications.event_popup_size') }}</label>
              <Select
                input-id="event-popup-size"
                :model-value="settings.size"
                :options="sizes"
                option-label="label"
                option-value="value"
                @update:model-value="save({ size: $event })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.notifications.event_popup_size_hint') }}</Message>
            </div>
            <div class="flex flex-col field-gap">
              <label for="event-popup-display" class="cui-label">{{ $t('views.settings.notifications.event_popup_display') }}</label>
              <Select
                input-id="event-popup-display"
                :model-value="settings.display"
                :options="displays"
                option-label="label"
                option-value="value"
                @update:model-value="save({ display: $event })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('views.settings.notifications.event_popup_display_hint')
              }}</Message>
            </div>
            <div class="flex flex-col field-gap">
              <label for="event-popup-sound" class="cui-label">{{ $t('views.settings.notifications.event_popup_sound') }}</label>
              <Select
                input-id="event-popup-sound"
                :model-value="settings.sound"
                :options="sounds"
                option-label="label"
                option-value="value"
                @update:model-value="save({ sound: $event })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('views.settings.notifications.event_popup_sound_hint') }}</Message>
            </div>
            <div class="flex flex-col field-gap">
              <label for="event-popup-windows" class="cui-label">{{ $t('views.settings.notifications.event_popup_windows') }}</label>
              <Select
                input-id="event-popup-windows"
                :model-value="settings.maxWindows"
                :options="maxWindows"
                option-label="label"
                option-value="value"
                @update:model-value="save({ maxWindows: $event })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('views.settings.notifications.event_popup_windows_hint')
              }}</Message>
            </div>
            <div class="flex flex-col field-gap">
              <label for="event-popup-cameras" class="cui-label">{{ $t('views.settings.notifications.event_popup_cameras') }}</label>
              <MultiSelect
                input-id="event-popup-cameras"
                :model-value="settings.cameraIds ?? []"
                :options="cameraOptions"
                option-label="label"
                option-value="value"
                :max-selected-labels="2"
                :selected-items-label="$t('views.settings.notifications.event_popup_cameras_selected', { n: settings.cameraIds?.length ?? 0 })"
                :placeholder="$t('views.settings.notifications.event_popup_cameras_all')"
                filter
                fluid
                @update:model-value="(ids: string[]) => save({ cameraIds: ids.length ? ids : null })"
              />
              <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
                $t('views.settings.notifications.event_popup_cameras_hint')
              }}</Message>
            </div>
          </div>

          <div v-if="settings.enabled" class="flex">
            <Button
              type="button"
              severity="secondary"
              class="cui-button-medium ml-auto"
              :disabled="!testCameras.length"
              :label="$t('views.settings.notifications.event_popup_test')"
              @click="showTest"
            />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';
import { EVENT_POPUP_CORNERS, EVENT_POPUP_DISPLAYS, EVENT_POPUP_MAX_WINDOWS, EVENT_POPUP_PREVIEW_STACK, EVENT_POPUP_SIZES, EVENT_POPUP_SOUNDS } from './types.js';

import type { EventPopupSettings } from '@/types/electron';

const camerasQuery = new CamerasQuery();

const { t, locale } = useI18n();
const toast = useCuiToast();
const { electron } = useElectron();
const { showEventPopup } = useEventPopup();
const now = useNow({ scheduler: (cb) => useIntervalFn(cb, 30_000) });

const { data: cameras } = camerasQuery.getCamerasQuery({ page: 1, pageSize: -1 });

const maxWindows = EVENT_POPUP_MAX_WINDOWS.map((value) => ({ value, label: String(value) }));

const settings = ref<EventPopupSettings | null>(null);
const saving = ref(false);

const corners = computed(() => EVENT_POPUP_CORNERS.map((value) => ({ value, label: t(`views.settings.notifications.event_popup_corners.${value.replace('-', '_')}`) })));
const sizes = computed(() => EVENT_POPUP_SIZES.map((value) => ({ value, label: t(`views.settings.notifications.event_popup_sizes.${value}`) })));
const displays = computed(() => EVENT_POPUP_DISPLAYS.map((value) => ({ value, label: t(`views.settings.notifications.event_popup_displays.${value}`) })));
const sounds = computed(() => EVENT_POPUP_SOUNDS.map((value) => ({ value, label: t(`views.settings.notifications.event_popup_sounds.${value}`) })));
const cameraOptions = computed(() => (cameras.value?.result ?? []).map((camera) => ({ value: camera._id, label: camera.name })));
const paused = computed(() => (settings.value?.pausedUntil ?? 0) > now.value.getTime());
const pausedTime = computed(() => (settings.value?.pausedUntil ? new Intl.DateTimeFormat(locale.value, { timeStyle: 'short' }).format(settings.value.pausedUntil) : ''));
const testCameras = computed(() => {
  const allowed = settings.value?.cameraIds;
  const all = (cameras.value?.result ?? []).filter((camera) => !camera.disabled);
  return (allowed ? all.filter((camera) => allowed.includes(camera._id)) : all).slice(0, (settings.value?.maxWindows ?? 1) + EVENT_POPUP_PREVIEW_STACK);
});

async function load(): Promise<void> {
  try {
    settings.value = (await electron?.invoke('get-event-popup-settings')) ?? null;
  } catch {
    // desktop apps before the event popup refuse the channel
  }
}

async function save(patch: Partial<EventPopupSettings>): Promise<void> {
  if (!settings.value || !electron) return;
  saving.value = true;
  try {
    settings.value = await electron.invoke('set-event-popup-settings', patch);
  } catch (err: any) {
    toast.add({ severity: 'error', detail: err, life: 3000 });
  } finally {
    saving.value = false;
  }
}

function showTest(): void {
  const id = Date.now();
  for (const camera of testCameras.value) {
    showEventPopup({
      id: `test-${camera._id}-${id}`,
      cameraId: camera._id,
      cameraName: camera.name,
      title: camera.name,
      subtitle: t('views.settings.notifications.event_popup_test_subtitle'),
      imageUrl: `/api/cameras/${encodeURIComponent(camera.name)}/snapshot`,
      source: 'test',
    });
  }
}

// the tray pauses without this page knowing
useEventListener(window, 'focus', load);

onMounted(load);
</script>
