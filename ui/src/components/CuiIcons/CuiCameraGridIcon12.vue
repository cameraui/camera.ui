<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm952 275v129H810.5V276H961Zm-158.5 0v129h-152V276h152Zm-152 265V413h152v128h-152Zm-8-265v129H493V276h149.5ZM493 541V413h149.5v128H493ZM9 276h476v265H9V276Zm801.5 265V413H961v128H810.5ZM961 9v259H493V9h468ZM9 268V9h476v259H9Z"
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
