<template>
  <div class="flex justify-center items-center draggable-region">
    <div class="card-background border-color relative w-full sm:w-[400px] sm:rounded-2xl sm:border-[1px] shadow-none sm:shadow-xl h-full sm:h-auto sm:my-4">
      <div class="flex flex-col h-full p-10 non-draggable-region">
        <div class="flex flex-col items-center justify-center mb-10">
          <InlineSvg :src="logoUrl" height="60px" title="camera.ui" aria-label="camera.ui" class="hover:scale-105 active:scale-105 focus:scale-105 transition-all" />
          <span class="text-2xl ml-3 mt-2 font-bold text-color">camera.ui</span>
        </div>

        <slot />

        <Divider class="mt-15" />

        <div class="flex justify-between items-center">
          <slot name="footer-left" />

          <div class="flex items-center gap-1 ml-auto">
            <Button severity="secondary" class="cui-icon-md" text rounded @click="$router.absUrl('https://github.com/cameraui/camera.ui', true)">
              <template #icon>
                <i-mdi:github class="text-muted" width="100%" height="100%" />
              </template>
            </Button>
            <Button severity="secondary" class="cui-icon-md" text rounded @click="$router.absUrl('https://discord.gg/bBGnGcbz8N', true)">
              <template #icon>
                <i-ic:baseline-discord class="text-muted" width="100%" height="100%" />
              </template>
            </Button>
            <Button severity="secondary" class="cui-icon-md" text rounded @click="$router.absUrl('https://reddit.com/r/cameraui/', true)">
              <template #icon>
                <i-fontisto:reddit class="text-muted" width="100%" height="100%" />
              </template>
            </Button>
          </div>
        </div>
      </div>

      <div class="bg-primary-500 opacity-0 sm:opacity-100 absolute blur-[20px] w-[200px] h-[30px] left-[50%] -translate-x-[50%] bottom-[25px] -z-1"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import type { CuiAuthCardProps } from './types.js';

defineProps<CuiAuthCardProps>();
</script>
