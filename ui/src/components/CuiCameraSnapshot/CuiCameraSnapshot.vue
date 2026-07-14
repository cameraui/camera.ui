<template>
  <div
    class="bg-black aspect-video flex items-center justify-center"
    :class="{ relative: showTimestamp }"
    :style="{
      width: `${width}`,
      height: `${height}`,
    }"
  >
    <ProgressSpinner
      v-if="isLoading"
      class="m-0 max-w-[30px] max-h-[30px]"
      stroke-width="5"
      :style="{
        width: `calc(${width} / 2)`,
        height: `calc(${height} / 2)`,
      }"
    />
    <CuiImage
      v-else-if="!isDisabled"
      ref="cuiImageRef"
      :src="snapshotSrc"
      image-container-class="w-full h-full flex items-center justify-center"
      :image-style="cuiImageStyle"
      :image-class="cuiImageClass"
    />

    <span
      v-if="showTimestamp && snapshotTimestamp && !isDisabled"
      class="absolute top-0 right-0 m-4 px-1.5 py-0.5 text-[10px] font-semibold bg-black/30 rounded-full text-white pointer-events-none"
      >{{ snapshotAge }}</span
    >
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { CuiCameraSnapshotProps } from './types.js';

const props = withDefaults(defineProps<CuiCameraSnapshotProps>(), {
  showLoadingScreen: true,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

const { camera, loading, src, width, height, showLoadingScreen, objectFit, aspectRatio, imageStyle, imageClass, showTimestamp } = toRefs(props);

const { snapshotSrc: cachedSnapshotSrc, isLoading: snapshotLoading, snapshotTimestamp, refresh } = useSnapshot(camera);

const now = props.showTimestamp ? useNow({ interval: 1000 }) : undefined;

const cuiImageRef = useTemplateRef('cuiImageRef');

const isDisabled = computed(() => typeof camera.value === 'object' && camera.value?.disabled === true);

const snapshotSrc = computed(() => src.value || cachedSnapshotSrc.value);

const isLoading = computed(() => {
  if (isDisabled.value) return false;
  return (loading.value || snapshotLoading.value) && showLoadingScreen.value && !snapshotSrc.value;
});

const cuiImageStyle = computed<HTMLAttributes['style']>(() => {
  if (imageStyle.value) {
    return imageStyle.value;
  }

  return {
    objectFit: objectFit.value,
    aspectRatio: aspectRatio.value,
    width: width.value,
    height: height.value,
  };
});

const cuiImageClass = computed<HTMLAttributes['class']>(() => {
  return imageClass.value || '';
});

const cameraName = computed(() => {
  const cam = camera.value;
  return typeof cam === 'string' ? cam : cam.name;
});

const snapshotDimensions = computed(() => cuiImageRef.value?.snapshotDimensions);

const snapshotAge = computed(() => {
  if (!now || !snapshotTimestamp.value) return undefined;
  return formatAge(now.value.getTime() - snapshotTimestamp.value);
});

function formatAge(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 1) return 'now';
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}m`;
  return `${Math.floor(days / 365)}y`;
}

async function downloadSnapshot() {
  if (snapshotSrc.value) {
    const imageName = `${cameraName.value.replace(/ /g, '_').toLowerCase()}_${new Date().toISOString()}.png`;
    await download({ dataUrl: snapshotSrc.value, filename: imageName, mimeType: 'image/png' });
  }
}

defineExpose({ download: downloadSnapshot, refresh, isLoading, snapshotSrc, snapshotDimensions });
</script>

<style scoped></style>
