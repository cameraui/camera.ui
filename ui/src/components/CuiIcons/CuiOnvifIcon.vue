<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <defs>
      <linearGradient :id="gradientId" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color: #29abe2" />
        <stop offset="100%" style="stop-color: #4f2d7f" />
      </linearGradient>

      <mask :id="maskId">
        <rect width="100%" height="100%" fill="white" />
        <circle cx="54" cy="46" r="32" fill="black" />
      </mask>
    </defs>

    <circle cx="50" cy="50" r="40" :fill="`url(#${gradientId})`" :mask="`url(#${maskId})`" />
  </svg>
</template>

<script setup lang="ts">
import { randomLetter } from '@/common/utils.js';

const gradientId = ref<string>(randomLetter(10));
const maskId = ref<string>(randomLetter(10));
</script>
