<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm952 94v82H812.5V95H961Zm-156.5 82h-152V95h152v82ZM961 9v78H812.5V9H961ZM652.5 9h152v78h-152V9Zm0 176h152v83h-152v-83ZM961 268H812.5v-83H961v83Zm-308.5 8h152v82h-152v-82Zm160 0H961v82H812.5v-82Zm-168-181v82H493V95h151.5Zm0-86v78H493V9h151.5ZM493 268v-83h151.5v83H493Zm0 90v-82h151.5v82H493ZM9 9h476v259H9V9Zm952 357v82H812.5v-82H961Zm-156.5 0v82h-152v-82h152Zm-152 90h152v85h-152v-85ZM961 541H812.5v-85H961v85ZM644.5 366v82H493v-82h151.5ZM493 541v-85h151.5v85H493ZM9 276h476v265H9V276Z"
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
