<template>
  <CuiHomeStatusRow
    class="home-alarm-row"
    :sensor="row.sensor"
    :icon="row.icon"
    :name="row.name"
    :state="row.state"
    :on="row.on"
    :color="row.color"
    :offline="row.offline"
  >
    <CuiTileHoldAction
      v-if="row.action && interactive"
      :class="{ 'home-alarm-row__key': narrow }"
      :show-label="!narrow"
      :icon="narrow ? row.action.icon : undefined"
      :label="row.action.label"
      :aria-label="row.action.ariaLabel"
      :guarded="row.action.guarded"
      :interactive="row.action.ready"
      @press="row.action.press"
      @hint="emit('hint', $event)"
    />
  </CuiHomeStatusRow>
</template>

<script setup lang="ts">
import CuiTileHoldAction from '@/components/CuiSensorTile/frame/CuiTileHoldAction.vue';

import CuiHomeStatusRow from './CuiHomeStatusRow.vue';

import type { CuiHomeAlarmRowEmits, CuiHomeAlarmRowProps } from './alarm.js';

defineProps<CuiHomeAlarmRowProps>();
const emit = defineEmits<CuiHomeAlarmRowEmits>();
</script>

<style scoped>
.home-alarm-row.home-status-row {
  height: 2.75rem;
}

.home-alarm-row :deep(.home-status-row__icon) {
  width: 2rem;
  height: 2rem;
}

.home-alarm-row__key {
  width: 2.25rem;
}
</style>
