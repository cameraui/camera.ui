<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M250 549.5h.5v-.5H961a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h233.5v.5h7.5Zm.5-273.5H485v129.5H250.5V276Zm-8 0v129.5H9V276h233.5ZM961 9v121H735V9h226ZM727 9v121H493V9h234ZM493 138h234v130H493V138ZM485 9v259H9V9h476Zm250 129h226v130H735V138Zm0 267.5V276h226v129.5H735ZM493 276h234v129.5H493V276Zm0 265V413.5h234V541H493Zm-242.5 0V413.5H485V541H250.5ZM9 541V413.5h233.5V541H9Zm726 0V413.5h226V541H735Z"
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
