<template>
  <div class="loader flex flex-col justify-center items-center">
    <InlineSvg :src="getImageUrl('logo_loading_circle.svg')" :width="width" :height="height" title="camera.ui" aria-label="camera.ui" />

    <div v-if="icon || text" class="absolute flex flex-col items-center justify-center pb-safe bottom-10">
      <div v-if="icon" class="offline">
        <component :is="icon" class="w-8 h-8 text-primary" />
      </div>

      <div v-if="text" class="text-center text-white text-sm font-bold mt-2">{{ text }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import InlineSvg from 'vue-inline-svg';

import { getImageUrl } from '@/common/utils.js';

import type { CuiLoadingScreenProps } from './types.js';

const props = withDefaults(defineProps<CuiLoadingScreenProps>(), {
  reload: false,
  height: '200px',
  width: '200px',
});

const { reload, width, height, text, icon } = toRefs(props);

const { start: startLensTimeout } = useTimeoutFn(
  () => {
    document.getElementById('lens')?.classList.add('cameraLens');
    document.getElementById('CameraUI_U')?.classList.add('cameraLetter');
  },
  100,
  { immediate: false },
);

const { resume: resumeLoader } = useIntervalFn(
  () => {
    document.getElementById('lens')?.classList.remove('cameraLens');
    document.getElementById('CameraUI_U')?.classList.remove('cameraLetter');
    startLensTimeout();
  },
  2300,
  { immediate: false },
);

onMounted(() => {
  if (reload.value) {
    resumeLoader();
  }
});
</script>

<style scoped>
.loader {
  background: var(--ground-background);
  width: 100dvw;
  min-width: 100dvw;
  max-width: 100dvw;
  height: 100dvh;
  min-height: 100dvh;
  max-height: 100dvh;
}

div :deep(.cameraLens) {
  -webkit-animation:
    lensMove 0.8s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    lensRotate 0.8s ease-in-out 0.4s forwards,
    lensMoveBack 0.6s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.3s forwards;
  -moz-animation:
    lensMove 0.8s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    lensRotate 0.8s ease-in-out 0.4s forwards,
    lensMoveBack 0.6s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.3s forwards;
  -o-animation:
    lensMove 0.8s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    lensRotate 0.8s ease-in-out 0.4s forwards,
    lensMoveBack 0.6s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.3s forwards;
  animation:
    lensMove 0.8s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    lensRotate 0.8s ease-in-out 0.4s forwards,
    lensMoveBack 0.6s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.3s forwards;
  -webkit-transform-origin: 35% 55%;
  -moz-transform-origin: 35% 55%;
  -o-transform-origin: 35% 55%;
  transform-origin: 35% 55%;
}

div :deep(.cameraLetter) {
  -moz-animation:
    letterScale 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    letterScaleBack 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.2s forwards;
  -o-animation:
    letterScale 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    letterScaleBack 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.2s forwards;
  -webkit-animation:
    letterScale 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    letterScaleBack 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.2s forwards;
  animation:
    letterScale 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) forwards,
    letterScaleBack 0.4s cubic-bezier(0.47, 1.84, 0.21, 0.8) 1.2s forwards;
  -webkit-transform-origin: center;
  -moz-transform-origin: center;
  -o-transform-origin: center;
  transform-origin: center;
}

@keyframes letterScale {
  0% {
    -webkit-transform: scale(1);
    -moz-transform: scale(1);
    -o-transform: scale(1);
    transform: scale(1);
  }

  100% {
    -webkit-transform: scale(0.8);
    -moz-transform: scale(0.8);
    -o-transform: scale(0.8);
    transform: scale(0.8);
  }
}

@keyframes letterScaleBack {
  0% {
    -webkit-transform: scale(0.8);
    -moz-transform: scale(0.8);
    -o-transform: scale(0.8);
    transform: scale(0.8);
  }

  100% {
    -webkit-transform: scale(1);
    -moz-transform: scale(1);
    -o-transform: scale(1);
    transform: scale(1);
  }
}

@keyframes lensMove {
  0% {
    -webkit-transform: translateY(0px);
    -moz-transform: translateY(0px);
    -o-transform: translateY(0px);
    transform: translateY(0px);
  }

  100% {
    -webkit-transform: translateY(-40px);
    -moz-transform: translateY(-40px);
    -o-transform: translateY(-40px);
    transform: translateY(-40px);
  }
}

@keyframes lensMoveBack {
  0% {
    -webkit-transform: translateY(-40px);
    -moz-transform: translateY(-40px);
    -o-transform: translateY(-40px);
    transform: translateY(-40px);
  }

  100% {
    -webkit-transform: translateY(0px);
    -moz-transform: translateY(0px);
    -o-transform: translateY(0px);
    transform: translateY(0px);
  }
}

@keyframes lensRotate {
  0% {
    -webkit-transform: translateY(-40px) rotate(0deg);
    -moz-transform: translateY(-40px) rotate(0deg);
    -o-transform: translateY(-40px) rotate(0deg);
    transform: translateY(-40px) rotate(0deg);
  }

  100% {
    -webkit-transform: translateY(-40px) rotate(-360deg);
    -moz-transform: translateY(-40px) rotate(-360deg);
    -o-transform: translateY(-40px) rotate(-360deg);
    transform: translateY(-40px) rotate(-360deg);
  }
}
</style>
