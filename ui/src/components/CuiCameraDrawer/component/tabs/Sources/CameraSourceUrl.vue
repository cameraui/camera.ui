<template>
  <div class="flex flex-col field-gap">
    <label class="cui-label">{{ $t('components.form.label.rtsp_url') }}</label>
    <InputGroup>
      <InputText :model-value="probeData?.rtspUrl" :loading="isLoading" readonly type="text" />
      <CuiCopyAddon :value="probeData?.rtspUrl" />
    </InputGroup>
    <Message severity="secondary" variant="simple" size="small" class="cui-input-hint">{{ $t('components.form.hint.rtsp_url') }}</Message>
  </div>
</template>

<script setup lang="ts">
import { CamerasQuery } from '@/api/routes/cameras.js';

import type { CameraSourceUrlProps } from '../../types.js';

const camerasQuery = new CamerasQuery();

const props = defineProps<CameraSourceUrlProps>();

const { cameraName, source, loading } = toRefs(props);

const { data: probeData, isBusy: probeLoading } = camerasQuery.probeCameraSourceQuery(cameraName.value, source.value.name, {
  video: true,
  audio: true,
  microphone: true,
});

const isLoading = computed(() => Boolean(loading.value || probeLoading.value));
</script>

<style scoped></style>
