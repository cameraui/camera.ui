<template>
  <section class="home-dock-panel" :class="{ 'home-dock-panel--inline': inline }" :aria-label="item.label">
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="home-dock-panel__title">{{ item.label }}</h2>
        <span class="home-dock-panel__state">{{ item.state }}</span>
      </div>
      <Button text rounded severity="secondary" class="cui-icon-xl shrink-0" :aria-label="t('components.form.button.close')" @click="emit('close')">
        <template #icon>
          <i-mdi:close />
        </template>
      </Button>
    </header>

    <div v-if="item.key === 'cameras'" class="home-dock-panel__cameras">
      <RouterLink v-for="camera in cameras" :key="camera._id" :to="`/cameras/${encodeURIComponent(camera.name)}`" class="home-dock-panel__camera">
        <CuiCameraSnapshot :camera width="100%" height="100%" object-fit="cover" />
        <span class="absolute left-2 bottom-2 max-w-[calc(100%-1rem)] text-xs font-semibold p-2 bg-black/60 rounded-full text-white truncate">{{ camera.name }}</span>
      </RouterLink>
    </div>

    <p v-if="item.key === 'cameras' ? !cameras.length : !groups.length" class="home-dock-panel__empty">{{ t('views.home_dashboard.dock_empty') }}</p>

    <section v-for="group in groups" :key="group.id" class="flex flex-col gap-2">
      <span class="home-dock-panel__group">{{ group.name }}</span>
      <CuiHomeTileGrid :sensors="group.sensors" :disabled />
    </section>
  </section>
</template>

<script setup lang="ts">
import CuiHomeTileGrid from './CuiHomeTileGrid.vue';
import { compareSensors, DOCK_CATEGORIES } from './home.js';

import type { ReactiveSensor } from '@camera.ui/browser';
import type { CuiHomeDockPanelEmits, CuiHomeDockPanelProps } from './types.js';

const props = defineProps<CuiHomeDockPanelProps>();
const emit = defineEmits<CuiHomeDockPanelEmits>();

const { t } = useI18n();

const disabled = !canControlSensors();

const groups = computed(() => {
  const category = DOCK_CATEGORIES.find((entry) => entry.key === props.item.key);
  if (!category) return [];

  const byRoom = new Map<string, ReactiveSensor[]>();
  for (const sensor of props.tiles) {
    if (!category.types.includes(sensor.type)) continue;
    const room = sensor.roomId.value ?? '';
    byRoom.set(room, [...(byRoom.get(room) ?? []), sensor]);
  }

  const named = (id: string) => props.roomNames.has(id);
  return [...byRoom]
    .map(([id, sensors]) => ({ id, name: props.roomNames.get(id) ?? t('views.home_dashboard.no_room'), sensors: sensors.sort(compareSensors) }))
    .sort((a, b) => Number(!named(a.id)) - Number(!named(b.id)) || a.name.localeCompare(b.name));
});
</script>

<style scoped>
.home-dock-panel__empty {
  padding: 1.5rem 0;
  font-size: 0.875rem;
  color: var(--text-secondary-color);
  text-align: center;
}

.home-dock-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-height: calc(100dvh - var(--cui-top-bar) - var(--cui-bottom-bar) - var(--cui-bottom-gap) - 8rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1.5rem;
  border-radius: 2rem;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
  box-shadow: 0 -10px 60px rgb(0 0 0 / 0.45);
}

.home-dock-panel--inline {
  padding: 1rem;
  border-radius: 1.5rem;
}

.home-dock-panel__title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--text-color);
}

.home-dock-panel--inline .home-dock-panel__title {
  font-size: 1.25rem;
}

.home-dock-panel__state {
  font-size: 0.875rem;
  color: var(--text-secondary-color);
}

.home-dock-panel__group {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary-color);
}

.home-dock-panel__cameras {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 0.75rem;
}

.home-dock-panel--inline .home-dock-panel__cameras {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.home-dock-panel__camera {
  position: relative;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 1rem;
  background: #000;
}
</style>
