<template>
  <CuiHomeValueCell :name="room.label" :value="room.value" :big :aria-label="room.description">
    <span :class="{ 'home-climate-room--heating': room.heating }"> <FireIcon v-if="room.heating" class="home-climate-room__flame" />{{ room.detail }} </span>
    <template v-if="big && room.humidity">{{ room.detail ? ' · ' : '' }}{{ room.humidity }}</template>
  </CuiHomeValueCell>
</template>

<script setup lang="ts">
import FireIcon from '~icons/mdi/fire';

import CuiHomeValueCell from './CuiHomeValueCell.vue';

import type { CuiHomeClimateRoomProps } from './climate.js';

defineProps<CuiHomeClimateRoomProps>();
</script>

<style scoped>
.home-climate-room--heating {
  color: var(--tile-ink);
}

.home-climate-room__flame {
  display: inline-block;
  width: 0.8125rem;
  height: 0.8125rem;
  margin-right: 0.1875rem;
  vertical-align: -0.125rem;
}
</style>
