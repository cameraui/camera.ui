<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm0 8h952v532H9V9Z" />
  </svg>
</template>

<script setup lang="ts">
import type { CuiIconProps } from './types.js';

const props = withDefaults(defineProps<CuiIconProps>(), {
  color: 'currentColor',
});

const { color } = toRefs(props);
</script>
