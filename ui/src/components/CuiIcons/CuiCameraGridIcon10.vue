<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm726 275h226v130H735V276Zm-242 0h234v130H493V276Zm0 265V414h234v127H493ZM9 541V276h476v265H9Zm726 0V414h226v127H735ZM961 9v121H735V9h226ZM735 138h226v130H735V138ZM727 9v121H493V9h234ZM493 138h234v130H493V138ZM485 9v259H9V9h476Z"
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
