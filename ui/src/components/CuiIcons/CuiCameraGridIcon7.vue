<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm725.5 275H961v130H734.5V276Zm0 265V414H961v127H734.5Zm-8-265v130H493V276h233.5ZM493 541V414h233.5v127H493ZM9 276h476v265H9V276ZM961 9v259H493V9h468ZM9 268V9h476v259H9Z"
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
