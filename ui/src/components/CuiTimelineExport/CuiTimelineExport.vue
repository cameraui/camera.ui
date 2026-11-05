<template>
  <Button
    v-tooltip.left="{ value: timelapseTooltip }"
    rounded
    severity="secondary"
    :disabled="timelapseDisabled"
    :label="timelapse > 0 ? TIMELAPSE_OPTIONS[timelapse] : undefined"
    class="shadow-md pointer-events-auto !text-xs !font-semibold"
    :class="horizontal ? 'cui-button-small' : 'w-[42px] h-[42px]'"
    @click="cycleTimelapse"
  >
    <template v-if="timelapse === 0" #icon>
      <i-tabler:clock-play width="100%" height="100%" class="opacity-40" />
    </template>
  </Button>
  <Button
    v-tooltip.left="{ value: $t('components.player.export_selection') }"
    rounded
    severity="success"
    :loading="exporting"
    class="shadow-md pointer-events-auto"
    :class="horizontal ? 'cui-button-small' : 'w-[42px] h-[42px]'"
    @click="exportSelection"
  >
    <template #icon>
      <i-tabler:download width="100%" height="100%" />
    </template>
  </Button>
</template>

<script setup lang="ts">
import { useRecordingExport } from '@camera.ui/nvr';

import { extractErrorMessage } from '@/common/utils.js';
import { TIMELAPSE_OPTIONS } from './types.js';

import type { CuiTimelineExportProps } from './types.js';

const props = defineProps<CuiTimelineExportProps>();

const { t } = useI18n();
const log = useLogger();
const toast = useCuiToast();
const { isAvailable, exportRange } = useRecordingExport();

const timelapse = ref(0);
const exporting = ref(false);

const durationMs = computed(() => {
  const range = props.timeline;
  if (!range?.trimStartMs || !range?.trimEndMs) return 0;
  return range.trimRecordingDurationMs ?? range.trimEndMs - range.trimStartMs;
});

const timelapseDisabled = computed(() => durationMs.value < 60 * 60 * 1000);

const timelapseTooltip = computed(() => {
  if (timelapseDisabled.value) return t('components.player.timelapse_min_duration');
  if (timelapse.value === 0) return t('components.player.timelapse_off');
  return `${t('components.player.timelapse')}: ${TIMELAPSE_OPTIONS[timelapse.value]}`;
});

function cycleTimelapse(): void {
  if (timelapseDisabled.value) return;
  timelapse.value = (timelapse.value + 1) % TIMELAPSE_OPTIONS.length;
}

async function exportSelection(): Promise<void> {
  const startMs = props.timeline?.trimStartMs;
  const endMs = props.timeline?.trimEndMs;
  if (!startMs || !endMs || !isAvailable.value) return;

  const setting = TIMELAPSE_OPTIONS[timelapse.value];
  const timelapseIntervalSec = setting === 'Off' ? 0 : parseInt(setting) * 60;

  exporting.value = true;
  try {
    const result = await exportRange(props.cameraId, startMs, endMs, {
      timelapseIntervalSec: timelapseIntervalSec || undefined,
      sourceRole: props.sourceRole || undefined,
    });
    await download({ url: result.url, filename: result.filename });
  } catch (error) {
    log.error('Export failed:', error);
    toast.add({ severity: 'error', summary: t('views.recordings.download_failed'), detail: extractErrorMessage(error), life: 5000 });
  } finally {
    exporting.value = false;
  }
}

watch(timelapseDisabled, (disabled) => {
  if (disabled) timelapse.value = 0;
});
</script>
