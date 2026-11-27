<template>
  <CuiHomeToggleChip :sensor :label="sensor.displayName.value" :on="lit" :color="lightColor" :disabled @toggle="toggle" />
</template>

<script setup lang="ts">
import { useLight } from '@/components/CuiSensorTile/light/useLight.js';

import CuiHomeToggleChip from './groups/CuiHomeToggleChip.vue';

import type { CuiHomeLightChipProps } from './types.js';

const props = defineProps<CuiHomeLightChipProps>();

const { lit, lightColor, toggle } = useLight(() => props.sensor);
</script>
