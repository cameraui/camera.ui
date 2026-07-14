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

  <div v-if="source.role !== 'snapshot'" class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.onvif_url') }}</label>
    <InputGroup>
      <InputText :model-value="probeData?.onvifUrl" :loading="isLoading" readonly type="text" />
      <InputGroupAddon>
        <CuiActionButton
          :action-text="$t('components.form.tooltip.copied')"
          :icon="CopyButton"
          :button-props="{
            severity: 'secondary',
            disabled: !probeData?.onvifUrl,
            loading: isLoading,
            text: true,
          }"
          @action="copy(probeData!.onvifUrl)"
        />
      </InputGroupAddon>
    </InputGroup>
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.onvif_url') }}</Message>
  </div>
</template>

<script setup lang="ts">
import ReloadIcon from '~icons/fluent/arrow-sync-16-filled';
import CopyButton from '~icons/fluent/copy-16-filled';

import { CamerasQuery, probeCameraSourceFn } from '@/api/routes/cameras.js';
import { copyToClipboard as copy } from '@/common/utils.js';

import type { StreamStatus } from '@/composables/sockets/useStreamStatus.js';
import type { CameraSourceProps } from '../../types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraSourceProps>();

const { t } = useI18n();
const { getSourceStatus, connect: connectStreamStatus } = useStreamStatus();
const queryClient = useQueryClient();
const toast = useCuiToast();

const INTERNAL_CONSUMERS = ['probe', 'preload'];

const { cameraId, cameraName, source, loading } = toRefs(props);
const isReprobing = ref(false);

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

const connections = computed(() => {
  return probeData.value?.probe.consumers.filter((consumer) => !INTERNAL_CONSUMERS.includes(consumer.format_name)).length || 0;
});

const videoCodecs = computed(() => producerCodecs('video'));

const audioCodecs = computed(() => producerCodecs('audio'));

function producerCodecs(type: 'video' | 'audio'): string[] {
  const names = (probeData.value?.probe.producers ?? [])
    .flatMap((producer) => producer.receivers ?? [])
    .filter((receiver) => receiver.codec.codec_type === type)
    .map((receiver) => receiver.codec.codec_name);
  return [...new Set(names)];
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
