<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm641.5 187.5H961v171H650.5v-171ZM961 9v171.5H650.5V9H961ZM642.5 9v350.5H9V9h633.5ZM9 541V367.5h315.5V541H9Zm323.5-173.5h310V541h-310V367.5Zm318 0H961V541H650.5V367.5Z"
    />
  </svg>
</template>

<script setup lang="ts">
import type { CuiIconProps } from './types.js';

const props = withDefaults(defineProps<CuiIconProps>(), {
  color: 'currentColor',
});

const { color } = toRefs(props);
</script>
