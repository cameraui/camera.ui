<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M250 549.5h.5v-.5H961a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h233.5v.5h7.5Zm.5-144V276H485v129.5H250.5Zm-8-129.5v129.5H9V276h233.5Zm570 90H961v82H812.5v-82Zm-160 0h152v82h-152v-82ZM961 276v82H812.5v-82H961Zm-308.5 0h152v82h-152v-82Zm0 180h152v85h-152v-85ZM961 541H812.5v-85H961v85Zm-316.5-93H493v-82h151.5v82Zm0-172v82H493v-82h151.5Zm0 180v85H493v-85h151.5ZM485 413.5V541H250.5V413.5H485Zm-242.5 0V541H9V413.5h233.5ZM961 9v259H493V9h468ZM9 9h476v259H9V9Z"
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
