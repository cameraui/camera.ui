<template>
  <div
    class="plan-room"
    :class="{ 'plan-room--lit': room.lit, 'plan-room--open': room.status }"
    :style="{ '--plan-light': toneColor('light'), '--plan-warn': toneColor('warn'), '--plan-motion': toneColor('info') }"
  >
    <button type="button" class="plan-room__open" :aria-label="room.name" @click="openRoom" />

    <div class="plan-room__body">
      <span class="plan-room__name">{{ room.name }}</span>
      <span v-if="room.temperature" class="plan-room__temperature">{{ room.temperature }}</span>
      <span v-if="room.status" class="plan-room__status">{{ room.status }}</span>
    </div>

    <span v-if="room.motion" class="plan-room__motion" />

    <RouterLink
      v-if="room.camera"
      :to="`/cameras/${encodeURIComponent(room.camera.name)}`"
      class="plan-room__camera"
      :class="{ 'plan-room__camera--alert': room.alert }"
      :aria-label="t('views.home_dashboard.show_camera', { name: room.camera.name })"
    >
      <i-mdi:cctv />
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { toneColor } from '@/common/sensorDisplay.js';

import type { CuiHomePlanRoomProps } from './types.js';

const props = defineProps<CuiHomePlanRoomProps>();

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

function openRoom() {
  router.replace({ query: { ...route.query, page: props.room.id } });
}
</script>

<style scoped>
.plan-room {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 2px solid var(--border-color);
  border-radius: 0.875rem;
  background: color-mix(in srgb, var(--text-color) 4%, transparent);
  container-type: size;
  transition:
    background 0.3s ease,
    border-color 0.3s ease;
}

.plan-room--lit {
  background: color-mix(in srgb, var(--plan-light) 16%, transparent);
}

.plan-room--open {
  border-color: var(--plan-warn);
}

.plan-room__open {
  position: absolute;
  inset: 0;
  cursor: pointer;
}

.plan-room__open:hover {
  background: color-mix(in srgb, var(--text-color) 4%, transparent);
}

.plan-room__open:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: -2px;
}

.plan-room__body {
  position: absolute;
  inset: 0.625rem 0.75rem;
  display: flex;
  flex-direction: column;
  min-width: 0;
  pointer-events: none;
}

.plan-room__name {
  padding-right: 1rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text-color);
}

.plan-room__temperature {
  font-size: clamp(1rem, 22cqmin, 1.625rem);
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-color);
  font-variant-numeric: tabular-nums;
}

.plan-room__status {
  margin-top: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--plan-warn);
}

.plan-room__motion {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: var(--plan-motion);
  pointer-events: none;
}

.plan-room__camera {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 9999px;
  background: var(--p-content-hover-background);
  color: var(--text-color);
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.plan-room__camera:hover {
  background: var(--p-content-border-color);
}

.plan-room__camera--alert,
.plan-room__camera--alert:hover {
  background: var(--p-primary-color);
  color: var(--p-primary-contrast-color);
}

.plan-room__camera:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.plan-room:has(.plan-room__camera) .plan-room__status {
  padding-right: 2rem;
}

@container (height < 4.5rem) {
  .plan-room__status {
    display: none;
  }
}

@container (height < 3rem) or (width < 3.5rem) {
  .plan-room__body,
  .plan-room__camera {
    display: none;
  }
}
</style>
