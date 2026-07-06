<template>
  <div class="mb-5 h-min">
    <CuiBBoxPlayground :detections />
    <img :src alt="Preview" class="w-full" />
  </div>
</template>

<script setup lang="ts">
import type { AnyDetection } from '@/components/CuiBBoxPlayground/types.js';
import type { PluginObjectInterfaceProps } from './types.js';

const props = defineProps<PluginObjectInterfaceProps>();

const { response, src } = toRefs(props);

const detections = computed<AnyDetection[]>(() => {
  return response.value.detections;
});
</script>

<style scoped></style>
