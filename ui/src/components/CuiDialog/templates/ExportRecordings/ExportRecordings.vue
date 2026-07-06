<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.recordings.export.cameras') }}</label>
      <MultiSelect
        v-model="selectedCameraIds"
        :options="cameras"
        option-label="name"
        option-value="id"
        display="chip"
        filter
        :placeholder="$t('views.recordings.export.cameras_placeholder')"
        class="w-full"
      />
    </div>

    <div class="flex flex-col field-gap">
      <label class="cui-label">{{ $t('views.recordings.export.range') }}</label>
      <div class="grid grid-cols-1 xs:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">{{ $t('views.recordings.export.from') }}</span>
          <DatePicker v-model="from" show-time hour-format="24" fluid :max-date="to" />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-xs text-muted">{{ $t('views.recordings.export.to') }}</span>
          <DatePicker v-model="to" show-time hour-format="24" fluid :min-date="from" />
        </div>
      </div>
      <Message v-if="!rangeValid" severity="error" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.recordings.export.invalid_range') }}
      </Message>
      <Message v-else severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.recordings.export.range_hint') }}
      </Message>
    </div>

    <div class="grid grid-cols-1 xs:grid-cols-2 gap-x-6 gap-y-4">
      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('views.recordings.export.quality') }}</label>
        <SelectButton
          v-model="quality"
          :options="qualityOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          :pt="{ root: { class: 'flex w-full' }, pcToggleButton: { root: { class: 'flex-1' } } }"
        />
      </div>

      <div class="flex flex-col field-gap">
        <label class="cui-label">{{ $t('views.recordings.export.timelapse') }}</label>
        <Select v-model="timelapseInterval" :options="timelapseOptions" option-label="label" option-value="value" class="w-full" />
      </div>
    </div>

    <div class="flex flex-col field-gap">
      <div class="flex items-center gap-3">
        <label class="cui-label !mb-0">{{ $t('views.recordings.export.result') }}</label>
        <div v-if="files.length" class="ml-auto flex items-center gap-2.5 text-sm tabular-nums">
          <span class="font-semibold">{{ files.length }} {{ files.length === 1 ? $t('views.recordings.export.file') : $t('views.recordings.export.files') }}</span>
          <span class="text-muted">·</span>
          <span class="font-semibold">{{ approx }}{{ fmtBytes(totalBytes) }}</span>
          <Tag value="ZIP" severity="info" />
        </div>
      </div>

      <div class="border border-color rounded-xl card-background overflow-hidden">
        <div class="flex flex-col gap-3 max-h-[240px] overflow-y-auto p-2.5">
          <div v-if="estimating && !files.length" class="flex items-center justify-center gap-2 text-muted text-sm py-6">
            <ProgressSpinner style="width: 1rem; height: 1rem" stroke-width="4" class="m-0" />
            <span>{{ $t('views.recordings.export.estimating') }}</span>
          </div>
          <div v-else-if="!files.length" class="text-center text-muted text-sm py-6">
            {{ emptyMessage }}
          </div>

          <div v-for="group in grouped" v-else :key="group.cameraId" class="flex flex-col gap-1">
            <span class="text-xs text-muted px-0.5">{{ group.cameraName }} · {{ group.files.length }} · {{ approx }}{{ fmtBytes(group.bytes) }}</span>
            <div v-for="f in group.files" :key="f.name" class="flex items-center gap-3 card-inner-background border border-color rounded-lg px-3 py-2">
              <i-mdi:file-video-outline class="w-4 h-4 text-muted shrink-0" />
              <span class="font-mono text-xs truncate flex-1">{{ f.name }}</span>
              <span class="text-xs text-muted tabular-nums shrink-0">{{ f.span }}</span>
              <span class="font-mono text-xs text-muted tabular-nums shrink-0 min-w-[58px] text-right">{{ approx }}{{ fmtBytes(f.bytes) }}</span>
            </div>
          </div>
        </div>
      </div>

      <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">
        {{ $t('views.recordings.export.size_hint') }}
      </Message>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NvrExportEstimateFile, NvrExportSlice } from '@camera.ui/nvr';

import type { CustomDialogComponent, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { ExportRecordingsFile, ExportRecordingsProps, ExportRecordingsProxy } from './types.js';

const props = defineProps<ExportRecordingsProps>();

const { t } = useI18n();
const toast = useCuiToast();
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;
const { plugin: nvrPluginRef } = usePlugin('@camera.ui/camera-ui-nvr');

const TIMELAPSE_FACTOR = 30;

const estimateFiles = ref<NvrExportEstimateFile[]>([]);
const estimating = ref(false);
const selectedCameraIds = ref(props.preselect?.length ? [...props.preselect] : props.cameras.map((c) => c.id));
const quality = ref<'best' | 'smallest'>('best');
const timelapseInterval = ref(0);
const from = ref(new Date(new Date().setHours(0, 0, 0, 0)));
const to = ref(new Date());

const qualityOptions = computed(() => [
  { label: t('views.recordings.export.quality_best'), value: 'best' },
  { label: t('views.recordings.export.quality_smallest'), value: 'smallest' },
]);

const timelapseOptions = computed(() =>
  [0, 1, 2, 5, 10, 30, 60].map((v) => ({
    label: v === 0 ? t('views.recordings.export.timelapse_off') : `${v} s`,
    value: v,
  })),
);

const timelapse = computed(() => timelapseInterval.value > 0);

const approx = computed(() => (timelapse.value ? '~' : ''));

const cameraName = computed(() => new Map(props.cameras.map((c) => [c.id, c.name])));

const rangeValid = computed(() => from.value instanceof Date && to.value instanceof Date && from.value < to.value);

const daySlices = computed<NvrExportSlice[]>(() => {
  if (!rangeValid.value) return [];
  const out: NvrExportSlice[] = [];
  const rangeStart = from.value.getTime();
  const rangeEnd = to.value.getTime();
  const cursor = new Date(from.value);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(to.value);
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= last.getTime()) {
    const dayStart = new Date(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const s = Math.max(dayStart.getTime(), rangeStart);
    const e = Math.min(dayEnd.getTime(), rangeEnd);
    if (e > s) out.push({ day: dayKey(dayStart), startUs: s * 1000, endUs: e * 1000 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
});

const files = computed<ExportRecordingsFile[]>(() =>
  estimateFiles.value.map((f) => {
    const name = cameraName.value.get(f.cameraId) ?? f.cameraId;
    const start = new Date(f.startUs / 1000);
    const end = new Date(f.endUs / 1000);
    const whole = start.getHours() === 0 && start.getMinutes() === 0 && f.endUs - f.startUs === 24 * 3600 * 1_000_000;
    const endLabel = end.getHours() === 0 && end.getMinutes() === 0 ? '24:00' : hhmm(end);
    return {
      cameraId: f.cameraId,
      cameraName: name,
      name: `${sanitize(name)}_${f.day}${timelapse.value ? '_timelapse' : ''}.mp4`,
      span: whole ? t('views.recordings.export.whole_day') : `${hhmm(start)}–${endLabel}`,
      bytes: timelapse.value ? f.bytes / TIMELAPSE_FACTOR : f.bytes,
    };
  }),
);

const grouped = computed(() => {
  const map = new Map<string, { cameraId: string; cameraName: string; files: ExportRecordingsFile[]; bytes: number }>();
  for (const f of files.value) {
    let g = map.get(f.cameraId);
    if (!g) {
      g = { cameraId: f.cameraId, cameraName: f.cameraName, files: [], bytes: 0 };
      map.set(f.cameraId, g);
    }
    g.files.push(f);
    g.bytes += f.bytes;
  }
  return [...map.values()];
});

const totalBytes = computed(() => files.value.reduce((a, f) => a + f.bytes, 0));

const emptyMessage = computed(() => {
  if (selectedCameraIds.value.length === 0) return t('views.recordings.export.no_cameras');
  if (!rangeValid.value) return t('views.recordings.export.no_range');
  return t('views.recordings.export.no_footage');
});

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hhmm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

function fmtBytes(bytes: number) {
  if (bytes <= 0) return '0 MB';
  const mb = bytes / 1_000_000;
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = bytes / 1_000_000_000;
  return `${gb.toFixed(gb < 10 ? 1 : 0)} GB`;
}

async function runEstimate() {
  const plugin = nvrPluginRef.value as ExportRecordingsProxy | undefined;
  if (!plugin?.nvrExportEstimate || selectedCameraIds.value.length === 0 || daySlices.value.length === 0) {
    estimateFiles.value = [];
    estimating.value = false;
    return;
  }
  estimating.value = true;
  try {
    const res = await plugin.nvrExportEstimate({ cameras: selectedCameraIds.value, slices: daySlices.value, quality: quality.value });
    estimateFiles.value = res.files ?? [];
  } catch {
    estimateFiles.value = [];
  } finally {
    estimating.value = false;
  }
}

async function onConfirm(): Promise<void | null> {
  if (!rangeValid.value || selectedCameraIds.value.length === 0 || daySlices.value.length === 0) return null;

  const plugin = nvrPluginRef.value as ExportRecordingsProxy | undefined;
  if (!plugin?.nvrExportBatch) {
    toast.add({ severity: 'error', detail: t('views.recordings.export.plugin_missing'), life: 3000 });
    return null;
  }

  const res = await plugin.nvrExportBatch({
    cameras: selectedCameraIds.value,
    slices: daySlices.value,
    quality: quality.value,
    timelapseIntervalSec: timelapse.value ? timelapseInterval.value : 0,
  });
  await download({ url: res.url, filename: res.filename });
}

watchDebounced([selectedCameraIds, daySlices, quality], runEstimate, { debounce: 350, immediate: true, deep: true });

watchEffect(() => {
  if (dialogRefProps.disabled) dialogRefProps.disabled.value = !rangeValid.value || selectedCameraIds.value.length === 0;
});

defineExpose<CustomDialogComponent>({ onConfirm });
</script>
