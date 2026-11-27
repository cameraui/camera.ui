<template>
  <CuiTileCard
    v-if="row"
    :icon
    :title="automation.name"
    :state="stateText"
    :color
    :active="busy || done"
    compact
    role="button"
    :aria-label="t('views.home_dashboard.scene_run', { name: automation.name })"
    :aria-disabled="busy"
    tabindex="0"
    @click="run"
    @keydown="onToggleKey($event, run)"
  />
  <CuiTileWidget v-else :icon :title="automation.name" :state="t('views.home_dashboard.scene')" :summary="stateText" :color :active="busy || done" :hero="stateText">
    <CuiTileAction show-label :icon="RunIcon" :label="t('components.scene_control.run')" :color :active="done" :interactive="!busy" @click="run" />
  </CuiTileWidget>
</template>

<script setup lang="ts">
import { SensorType } from '@camera.ui/sdk';
import RunIcon from '~icons/mdi/play';

import { AutomationsQuery } from '@/api/routes/automations.js';
import { sensorToneColor, sensorTypeIcon, toneColor } from '@/common/sensorDisplay.js';
import CuiTileAction from '@/components/CuiSensorTile/frame/CuiTileAction.vue';
import CuiTileCard from '@/components/CuiSensorTile/frame/CuiTileCard.vue';
import CuiTileWidget from '@/components/CuiSensorTile/frame/CuiTileWidget.vue';
import { onToggleKey } from '@/components/CuiSensorTile/keys.js';
import { useRelativeTime } from '@/components/CuiSensorTile/useRelativeTime.js';

import type { CuiHomeSceneProps } from './types.js';

const props = defineProps<CuiHomeSceneProps>();

const { t } = useI18n();
const toast = useCuiToast();
const { timeAgo } = useRelativeTime();

const { mutateAsync: trigger } = new AutomationsQuery().triggerAutomationQuery();

const DONE_MS = 2000;
const icon = sensorTypeIcon(SensorType.Scene);

const busy = ref(false);
const done = ref(false);

const failed = computed(() => props.automation.lastRun?.status === 'error');
const color = computed(() => (failed.value ? toneColor('alarm') : (sensorToneColor(SensorType.Scene, true) ?? toneColor('info'))));

const stateText = computed(() => {
  if (busy.value) return t('components.sensor_state.running');
  if (done.value) return t('views.home_dashboard.scene_started');
  const last = props.automation.lastRun;
  if (!last?.timestamp) return t('components.sensor_state.ready');
  return t(failed.value ? 'views.home_dashboard.scene_failed' : 'components.scene_control.ran', { time: timeAgo(last.timestamp) });
});

const resetDone = useTimeoutFn(() => (done.value = false), DONE_MS, { immediate: false });

async function run() {
  if (busy.value) return;
  busy.value = true;
  try {
    await trigger({ id: props.automation._id });
    done.value = true;
    resetDone.start();
  } catch {
    toast.add({ severity: 'error', detail: t('views.automation.trigger_failed'), life: 3000 });
  } finally {
    busy.value = false;
  }
}
</script>
