<template>
  <div class="flex items-center justify-between">
    <label class="cui-label">{{ $t('components.form.label.stream_status') }}</label>
    <Tag :severity="sourceStatusSeverity" :value="sourceStatusLabel" />
  </div>

  <div class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.connections') }}</label>
    <InputGroup>
      <InputText :value="connections" :loading="isLoading" readonly type="text" />
      <InputGroupAddon>
        <Button v-tooltip.left="$t('components.form.tooltip.copy_stream_json')" severity="secondary" text :loading="isCopyingStream" @click="copyStreamJson">
          <template #icon>
            <CopyButton class="w-4 h-4" />
          </template>
        </Button>
      </InputGroupAddon>
      <InputGroupAddon>
        <Button v-tooltip.left="$t('components.form.button.reload')" severity="secondary" text :loading="isReprobing" :disabled="isLoading" @click="reprobe">
          <template #icon>
            <ReloadIcon class="w-4 h-4" />
          </template>
        </Button>
      </InputGroupAddon>
    </InputGroup>
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.connections') }}</Message>
  </div>

  <div v-for="(videoCodec, i) in videoCodecs" :key="i" class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.video_codec') }}</label>
    <InputGroup>
      <InputText :model-value="videoCodec" :loading="isLoading" readonly type="text" />
    </InputGroup>
    <Message v-if="i === videoCodecs.length - 1" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
      $t('components.form.hint.video_codec')
    }}</Message>
  </div>

  <div v-for="(audioCodec, i) in audioCodecs" :key="i" class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.audio_codec') }}</label>
    <InputGroup>
      <InputText :model-value="audioCodec" :loading="isLoading" readonly type="text" />
    </InputGroup>
    <Message v-if="i === audioCodecs.length - 1" severity="secondary" variant="simple" size="small" class="cui-input-hint">{{
      $t('components.form.hint.audio_codec')
    }}</Message>
  </div>

  <div v-if="source.role !== 'snapshot'" class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.rtsp_url') }}</label>
    <InputGroup>
      <InputText :model-value="probeData?.rtspUrl" :loading="isLoading" readonly type="text" />
      <InputGroupAddon>
        <CuiActionButton
          :action-text="$t('components.form.tooltip.copied')"
          :icon="CopyButton"
          :button-props="{
            severity: 'secondary',
            disabled: !probeData?.rtspUrl,
            loading: isLoading,
            text: true,
          }"
          @action="copy(probeData!.rtspUrl)"
        />
      </InputGroupAddon>
    </InputGroup>
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.rtsp_url') }}</Message>
  </div>
</template>

<script setup lang="ts">
import ReloadIcon from '~icons/fluent/arrow-sync-16-filled';
import CopyButton from '~icons/fluent/copy-16-filled';

import { CamerasQuery, probeCameraSourceFn, streamSourceInfoFn } from '@/api/routes/cameras.js';
import { copyToClipboard as copy } from '@/common/utils.js';

import type { StreamStatus } from '@/composables/sockets/useStreamStatus.js';
import type { CameraSourceProps } from '../../types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraSourceProps>();

const { t } = useI18n();
const { getSourceStatus, getSourceConnections, getSourceCodecs, connect: connectStreamStatus } = useStreamStatus();
const queryClient = useQueryClient();
const toast = useCuiToast();

const { cameraId, cameraName, source, loading } = toRefs(props);
const isReprobing = ref(false);
const isCopyingStream = ref(false);

const { data: probeData, isBusy: probeLoading } = camerasQuery.probeCameraSourceQuery(cameraName.value, source.value.name, {
  video: true,
  audio: true,
  microphone: true,
});

connectStreamStatus();

const sourceStatus = computed<StreamStatus>(() => getSourceStatus(cameraId.value, source.value.name));

const sourceStatusSeverity = computed<'success' | 'warn' | 'danger' | 'secondary'>(() => {
  switch (sourceStatus.value) {
    case 'connected':
      return 'success';
    case 'connecting':
      return 'warn';
    case 'error':
      return 'danger';
    default:
      return 'secondary';
  }
});

const sourceStatusLabel = computed(() => {
  switch (sourceStatus.value) {
    case 'connected':
      return t('components.camera_table.online');
    case 'connecting':
      return t('components.camera_table.connecting');
    case 'error':
      return t('components.camera_table.error');
    default:
      return t('components.camera_table.idle');
  }
});

const isLoading = computed(() => Boolean(loading.value || probeLoading.value));

const connections = computed(() => getSourceConnections(cameraId.value, source.value.name));

const liveCodecs = computed(() => getSourceCodecs(cameraId.value, source.value.name));

const videoCodecs = computed(() => liveCodecs.value?.video ?? producerCodecs('video'));

const audioCodecs = computed(() => liveCodecs.value?.audio ?? producerCodecs('audio'));

function producerCodecs(type: 'video' | 'audio'): string[] {
  const names = (probeData.value?.probe.producers ?? [])
    .flatMap((producer) => producer.receivers ?? [])
    .filter((receiver) => receiver.codec.codec_type === type)
    .map((receiver) => receiver.codec.codec_name);
  return [...new Set(names)];
}

async function copyStreamJson(): Promise<void> {
  if (isCopyingStream.value) return;
  isCopyingStream.value = true;
  try {
    const info = await streamSourceInfoFn({ cameraname: cameraName.value, sourcename: source.value.name });
    const copied = await copy(JSON.stringify(info, null, 2));
    toast.add({ severity: copied ? 'success' : 'error', detail: t(copied ? 'components.form.tooltip.copied' : 'components.toast.copy_failed'), life: 3000 });
  } catch {
    toast.add({ severity: 'error', detail: t('components.toast.copy_failed'), life: 3000 });
  } finally {
    isCopyingStream.value = false;
  }
}

async function reprobe(): Promise<void> {
  if (isReprobing.value) return;
  isReprobing.value = true;
  try {
    const data = await probeCameraSourceFn({
      cameraname: cameraName.value,
      sourcename: source.value.name,
      probeConfig: { video: true, audio: true, microphone: true },
      force: true,
    });
    queryClient.setQueryData(['cameras', cameraName.value, 'probe', source.value.name], data);
  } catch {
    toast.add({ severity: 'error', detail: t('components.toast.probe_failed'), life: 3000 });
  } finally {
    isReprobing.value = false;
  }
}
</script>

<style scoped></style>
