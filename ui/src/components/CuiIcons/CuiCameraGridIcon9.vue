<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      d="M969.5 359v-.5h-.5V9a8 8 0 0 0-8-8H9a8 8 0 0 0-8 8v532a8 8 0 0 0 8 8h952a8 8 0 0 0 8-8V366.5h.5V359ZM961 187v171.5H651V187h310ZM651 541V366.5h310V541H651Zm-8-354v171.5H330V187h313ZM330 541V366.5h313V541H330Zm-8-354v171.5H9V187h313ZM9 541V366.5h313V541H9ZM961 9v170H651V9h310ZM643 9v170H330V9h313ZM322 9v170H9V9h313Z"
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
