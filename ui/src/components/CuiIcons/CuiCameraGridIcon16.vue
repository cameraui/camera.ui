<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M9 1a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V9a8 8 0 0 0-8-8H9Zm952 8v121.5H732.5V9H961ZM724.5 9v121.5H493V9h231.5ZM493 268V138.5h231.5V268H493Zm0 137.5V276h231.5v129.5H493Zm468 0H732.5V276H961v129.5ZM493 541V413.5h231.5V541H493Zm468 0H732.5V413.5H961V541Zm0-273H732.5V138.5H961V268ZM485 9v121.5H250.5V9H485ZM250.5 138.5H485V268H250.5V138.5ZM242.5 9v121.5H9V9h233.5ZM9 138.5h233.5V268H9V138.5ZM250.5 276H485v129.5H250.5V276Zm0 137.5H485V541H250.5V413.5Zm-8-137.5v129.5H9V276h233.5ZM9 541V413.5h233.5V541H9Z"
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
