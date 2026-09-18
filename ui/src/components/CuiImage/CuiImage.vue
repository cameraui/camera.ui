<template>
  <div class="w-full h-full flex items-center justify-center">
    <div v-if="showSpinner" class="cui-image-spinner" />

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

      <img v-if="error || !src" :src="fallbackUrl" :alt="alt" decoding="async" :style="{ width: formatWidth, height: formatHeight }" class="object-contain" />
    </div>
  </div>
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
const slowLoad = ref(false);
let spinnerTimer: ReturnType<typeof setTimeout> | undefined;

const preloadUrl = computed(() => (src.value ? getImageUrl(src.value) : undefined));
const showSpinner = computed(() => !!src.value && !displayedUrl.value && !error.value && slowLoad.value);
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
    clearTimeout(spinnerTimer);
    slowLoad.value = false;
    if (!url) {
      displayedUrl.value = undefined;
      return;
    }
    if (url === displayedUrl.value) {
      return;
    }

    const loader = new Image();
    loader.src = url;
    if (loader.complete && loader.naturalWidth > 0) {
      displayedUrl.value = url;
      return;
    }
    spinnerTimer = setTimeout(() => {
      slowLoad.value = true;
    }, 150);
    loader
      .decode()
      .then(() => {
        if (preloadUrl.value === url) {
          displayedUrl.value = url;
          clearTimeout(spinnerTimer);
          slowLoad.value = false;
        }
      })
      .catch(() => {
        if (preloadUrl.value === url) {
          error.value = true;
          clearTimeout(spinnerTimer);
          slowLoad.value = false;
        }
      });
  },
  { immediate: true },
);

onUnmounted(() => clearTimeout(spinnerTimer));

defineExpose({
  snapshotDimensions,
});
</script>

<style scoped>
.cui-image-spinner {
  width: 50%;
  height: 50%;
  max-width: 30px;
  max-height: 30px;
  border: 3px solid color-mix(in srgb, var(--text-color) 25%, transparent);
  border-top-color: var(--p-primary-color);
  border-radius: 50%;
  animation: cui-image-spin 0.9s linear infinite;
}

@keyframes cui-image-spin {
  to {
    transform: rotate(360deg);
  }
}

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

@supports (-webkit-touch-callout: none) {
  img {
    -webkit-transition-delay: 0.016s;
    transition-delay: 0.016s;
  }
}
</style>
