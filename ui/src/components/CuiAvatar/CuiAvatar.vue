<template>
  <div
    class="bg-neutral-900 overflow-hidden rounded-full"
    :class="{
      'avatar-border': showBorder,
    }"
  >
    <CuiImage :src="src" :height="size" :width="size" :image-style="{ objectFit: 'cover' }" image-container-class="w-full h-full" />
  </div>
</template>

<script lang="ts" setup>
import type { CuiAvatarProps } from './types.js';

const props = withDefaults(defineProps<CuiAvatarProps>(), {
  size: 22,
  showBorder: true,
});

const { showBorder, size, src } = toRefs(props);
</script>

<style scoped>
.avatar-border {
  border: 1px solid #272727;
}
</style>
