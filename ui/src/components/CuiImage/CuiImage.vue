<template>
  <Image :alt="alt" class="w-full h-full flex items-center justify-center">
    <template #image>
      <ProgressSpinner v-if="showSpinner" stroke-width="6" class="w-[50%] h-[50%] max-w-[30px] max-h-[30px]" />

      <div v-show="!showSpinner" :class="imageContainerClass" :style="imageContainerStyle">
        <img
          v-if="!error && displayedUrl"
          :src="displayedUrl"
          :alt="alt"
          decoding="async"
          :style="[
            {
              width: formatWidth,
              height: formatHeight,
            },
            imageStyle,
          ]"
          :class="imageClass"
        />

        <img v-if="error || !src" :src="fallbackUrl" :alt="alt" decoding="async" :width="width" :height="height" class="object-contain h-full" />
      </div>
    </template>
  </Image>
</template>

<script setup lang="ts">
import { getImageUrl } from '@/common/utils.js';

import type { CuiImageProps } from './types.js';

const props = withDefaults(defineProps<CuiImageProps>(), {
  alt: 'Image',
  width: '100%',
  height: '100%',
});

const { src, width, height, imageStyle, imageClass, imageContainerClass, imageContainerStyle } = toRefs(props);
const error = ref(false);
const imgEl = new Image();
const displayedUrl = ref<string | undefined>();

const preloadUrl = computed(() => (src.value ? getImageUrl(src.value) : undefined));
const showSpinner = computed(() => !!src.value && !displayedUrl.value && !error.value);
const fallbackUrl = computed(() => getImageUrl());
const snapshotDimensions = computed(() => {
  imgEl.src = displayedUrl.value || preloadUrl.value || '';
  return { width: imgEl.width, height: imgEl.height };
});
const formatWidth = computed(() => {
  if (!width.value) return 'auto';
  return typeof width.value === 'number' ? `${width.value}px` : width.value;
});
const formatHeight = computed(() => {
  if (!height.value) return 'auto';
  return typeof height.value === 'number' ? `${height.value}px` : height.value;
});

watch(
  preloadUrl,
  (url) => {
    error.value = false;
    if (!url) {
      displayedUrl.value = undefined;
      return;
    }
    if (url === displayedUrl.value) {
      return;
    }

    const loader = new Image();
    loader.src = url;
    loader
      .decode()
      .then(() => {
        if (preloadUrl.value === url) {
          displayedUrl.value = url;
        }
      })
      .catch(() => {
        if (preloadUrl.value === url) {
          error.value = true;
        }
      });
  },
  { immediate: true },
);

defineExpose({
  snapshotDimensions,
});
</script>

<style scoped>
img {
  -webkit-transition: opacity 0.3s ease;
  transition: opacity 0.3s ease;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  opacity: 1;
}

img[v-show='false'] {
  opacity: 0;
}

/* Safari: prevent flash on initial load */
@supports (-webkit-touch-callout: none) {
  img {
    -webkit-transition-delay: 0.016s;
    transition-delay: 0.016s;
  }
}
</style>
