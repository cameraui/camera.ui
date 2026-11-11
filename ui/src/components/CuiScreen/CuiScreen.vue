<template>
  <div class="flex justify-center items-center w-full h-full draggable-region print:block print:h-auto">
    <div class="relative flex flex-col w-full h-full sm:w-[400px] sm:h-auto sm:max-h-[min(46rem,calc(100%-2rem))] print:w-full print:h-auto print:max-h-none">
      <div class="hidden sm:block print:hidden bg-primary-500 absolute blur-[20px] w-[200px] h-[30px] left-1/2 -translate-x-1/2 bottom-[25px] -z-1"></div>

      <DefineNav>
        <Button
          v-if="back"
          severity="secondary"
          text
          class="cui-button p-2 text-color absolute top-2 left-2 z-20 print:hidden"
          :aria-label="$t('components.form.button.back')"
          @click="emit('back')"
        >
          <template #icon>
            <i-weui:back-filled class="w-6 h-6" />
          </template>
        </Button>

        <div v-if="$slots.actions" class="absolute top-2 right-2 z-20 flex items-center">
          <slot name="actions" />
        </div>
      </DefineNav>

      <div
        class="relative flex flex-col flex-1 sm:flex-initial min-h-0 w-full overflow-hidden non-draggable-region bg-(--ground-background) sm:bg-(--card-background) sm:[--cui-group-background:var(--card-inner-background)] sm:rounded-2xl sm:border sm:border-(--border-color) sm:shadow-xl print:h-auto print:overflow-visible print:border-0 print:shadow-none"
      >
        <header v-if="title" class="relative flex items-center justify-center shrink-0 h-14 px-14">
          <span class="font-semibold text-lg truncate">{{ title }}</span>
          <ReuseNav />
        </header>

        <div ref="body" class="flex-1 min-h-0 flex flex-col overflow-y-auto overscroll-contain print:overflow-visible">
          <div
            class="relative flex-[1_0_auto] flex flex-col px-4 pb-4 sm:px-6 sm:pb-6"
            :class="title ? 'pt-4' : 'pt-8'"
            :style="heldHeight ? { minHeight: `${heldHeight}px` } : undefined"
          >
            <ReuseNav v-if="!title" />

            <div v-if="spaced" class="flex-1"></div>

            <div v-if="brand" class="flex flex-col items-center text-center pb-10">
              <InlineSvg :src="getImageUrl('logo_animated.svg')" height="64px" class="block" title="camera.ui" aria-label="camera.ui" />
              <span class="mt-3 text-2xl font-bold">camera.ui</span>
              <span v-if="subtitle" class="text-sm text-muted mt-1 max-w-full truncate">{{ subtitle }}</span>
            </div>

            <div v-if="loading" class="flex justify-center pb-12">
              <ProgressSpinner stroke-width="5" class="w-[30px] h-[30px]" />
            </div>

            <template v-else>
              <slot />

              <div v-if="$slots.footer" class="flex flex-col gap-3 pt-10">
                <slot name="footer" />
              </div>
            </template>

            <div v-if="spaced" class="flex-[2]"></div>

            <div v-if="brand" class="flex justify-center items-center gap-1 mt-auto pt-6 print:hidden">
              <Button severity="secondary" class="cui-icon-md" text rounded aria-label="GitHub" @click="$router.absUrl('https://github.com/cameraui/camera.ui', true)">
                <template #icon>
                  <i-mdi:github class="text-muted" width="100%" height="100%" />
                </template>
              </Button>
              <Button severity="secondary" class="cui-icon-md" text rounded aria-label="Discord" @click="$router.absUrl('https://discord.gg/bBGnGcbz8N', true)">
                <template #icon>
                  <i-ic:baseline-discord class="text-muted" width="100%" height="100%" />
                </template>
              </Button>
              <Button severity="secondary" class="cui-icon-md" text rounded aria-label="Reddit" @click="$router.absUrl('https://reddit.com/r/cameraui/', true)">
                <template #icon>
                  <i-fontisto:reddit class="text-muted" width="100%" height="100%" />
                </template>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { getImageUrl } from '@/common/utils.js';

import type { CuiScreenEmits, CuiScreenProps } from './types.js';

const props = defineProps<CuiScreenProps>();
const emit = defineEmits<CuiScreenEmits>();

const [DefineNav, ReuseNav] = createReusableTemplate();

const body = useTemplateRef<HTMLElement>('body');
const heldHeight = ref(0);

const spaced = computed(() => props.center || props.loading);

let restHeight = 0;

useResizeObserver(body, ([entry]) => {
  const height = entry.contentRect.height;
  if (document.documentElement.classList.contains('cui-keyboard-open')) {
    heldHeight.value ||= restHeight;
    return;
  }
  if (heldHeight.value && height < heldHeight.value - 1) return;
  heldHeight.value = 0;
  restHeight = height;
});
</script>
