<!-- eslint-disable @stylistic/max-len -->
<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 970 550" role="img" area-hidden="true" :fill="color">
    <path
      fill-rule="evenodd"
      d="M1.5 9A7.5 7.5 0 0 1 9 1.5h952a7.5 7.5 0 0 1 7.5 7.5v532a7.5 7.5 0 0 1-7.5 7.5H9a7.5 7.5 0 0 1-7.5-7.5V9Zm960 168V94h-153v83h153Zm-160 0h-153V94h153v83Zm7-90h153V9a.5.5 0 0 0-.5-.5H808.5V87Zm-7-78.5V87h-153V8.5h153Zm0 175.5v84.5h-153V184h153Zm7 84.5V184h153v84.5h-153Zm-167-91.5V94h-149v83h149Zm0-90V8.5h-149V87h149Zm-149 97h149v84.5h-149V184Zm0 91.5H719V402H492.5V275.5Zm0 133.5v132.5H719V409H492.5Zm233.5 0v132.5h235a.5.5 0 0 0 .5-.5V409H726Zm235.5-7V275.5H726V402h235.5Zm-476-270V8.5H252V132h233.5ZM245 139H8.5v129.5H245V139Zm0-7V8.5H9a.5.5 0 0 0-.5.5v123H245Zm240.5 136.5V139H252v129.5h233.5Zm-477 7h157v81H8.5v-81Zm164 81v-81h153v81h-153Zm153 7h-153v83h153v-83Zm7 83v-83h153v83h-153Zm-7 7h-153v88h153v-88Zm7 88v-88h153v88h-153Zm0-185v-81h153v81h-153Zm-324 7h157v83H8.5v-83Zm0 90h157v88H9a.5.5 0 0 1-.5-.5v-87.5Z"
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
