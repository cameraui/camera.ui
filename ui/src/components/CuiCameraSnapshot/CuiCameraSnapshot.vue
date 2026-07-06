<template>
  <div
    class="bg-black aspect-video flex items-center justify-center"
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
    <!-- Disabled cameras: render nothing — the container's bg-black shows through.
         The CuiImage fallback would otherwise display the camera.ui logo. -->
    <CuiImage
      v-else-if="!isDisabled"
      ref="cuiImageRef"
      :src="snapshotSrc"
      image-container-class="w-full h-full flex items-center justify-center"
      :image-style="cuiImageStyle"
      :image-class="cuiImageClass"
    />
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

const { camera, loading, src, width, height, showLoadingScreen, objectFit, aspectRatio, imageStyle, imageClass } = toRefs(props);

const { snapshotSrc: cachedSnapshotSrc, isLoading: snapshotLoading, refresh } = useSnapshot(camera);

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

async function downloadSnapshot() {
  if (snapshotSrc.value) {
    const imageName = `${cameraName.value.replace(/ /g, '_').toLowerCase()}_${new Date().toISOString()}.png`;
    await download({ dataUrl: snapshotSrc.value, filename: imageName, mimeType: 'image/png' });
  }
}

defineExpose({ download: downloadSnapshot, refresh, isLoading, snapshotSrc, snapshotDimensions });
</script>

<style scoped></style>
