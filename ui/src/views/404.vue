<template>
  <div class="relative flex items-center justify-center draggable-region">
    <div class="container mx-auto px-6 relative z-10">
      <div class="text-center">
        <h1 class="text-8xl font-bold mb-4 relative flex items-center justify-center">
          <span>4</span>
          <div class="relative w-24 h-24 mx-2 group">
            <div class="relative z-1 scale-150 non-draggable-region">
              <InlineSvg
                :src="getImageUrl('logo_animated.svg')"
                width="95px"
                height="80px"
                title="camera.ui"
                aria-label="camera.ui"
                class="transform transition-transform duration-300 group-hover:scale-110"
              />
            </div>
          </div>
          <span>4</span>
        </h1>

        <h2 class="text-3xl font-semibold mb-4">Oops!</h2>
        <p class="text-muted max-w-md mx-auto mb-8">
          {{ $t('views.404.error_message') }}
        </p>

        <div class="flex items-center justify-center gap-4">
          <RouterLink to="/">
            <Button class="cui-button flex items-center gap-2 non-draggable-region">
              <i-mdi:home class="text-white" />
              <span class="text-white">{{ $t('components.form.button.home') }}</span>
            </Button>
          </RouterLink>

          <Button severity="secondary" :label="$t('components.form.button.back')" class="cui-button non-draggable-region" @click="$router.back()">
            <template #icon>
              <i-lets-icons:back class="text-muted" />
            </template>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import InlineSvg from 'vue-inline-svg';

import { getImageUrl } from '@/common/utils.js';
</script>

<style scoped></style>
