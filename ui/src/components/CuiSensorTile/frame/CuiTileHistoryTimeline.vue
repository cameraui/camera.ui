<template>
  <CuiTileTimeline :sensor :property :entries :now :color-of />
</template>

<script setup lang="ts">
import { useSensorHistory } from '../useSensorHistory.js';
import CuiTileTimeline from './CuiTileTimeline.vue';

import type { CuiTileHistoryTimelineProps } from './types.js';

const props = defineProps<CuiTileHistoryTimelineProps>();

const { entries, now } = useSensorHistory(
  () => props.sensor,
  () => props.property,
);
</script>
