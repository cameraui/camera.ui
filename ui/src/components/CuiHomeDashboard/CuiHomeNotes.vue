<template>
  <CuiTilePanel :icon="HOME_ICONS.notes" :title :state :active="count > 0" :color="count ? toneColor('warn') : undefined">
    <div class="home-notes__list">
      <section v-for="note in notes" :key="note.kind" class="contents">
        <span class="home-notes__label">{{ t(`views.home_dashboard.note_${note.kind}`) }}</span>
        <CuiSensorTile v-for="sensor in note.sensors" :key="sensor.id" :sensor size="small" :disabled />
      </section>
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import { toneColor } from '@/common/sensorDisplay.js';
import CuiTilePanel from '@/components/CuiSensorTile/frame/CuiTilePanel.vue';
import CuiSensorTile from '@/components/CuiSensorTile/CuiSensorTile.vue';

import { HOME_ICONS, homeNotes } from './home.js';

import type { CuiHomeNotesProps } from './types.js';

const props = defineProps<CuiHomeNotesProps>();

const { t } = useI18n();

const disabled = !canControlSensors();

const title = computed(() =>
  props.room ? t('views.home_dashboard.scoped_title', { title: t('views.home_dashboard.notes'), room: props.room }) : t('views.home_dashboard.notes'),
);
const notes = computed(() => homeNotes(props.tiles, props.batteries));
const count = computed(() => notes.value.reduce((sum, note) => sum + note.sensors.length, 0));
const state = computed(() => (count.value ? t('views.home_dashboard.notes_count', { count: count.value }, count.value) : t('views.home_dashboard.notes_none')));
</script>

<style scoped>
.home-notes__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  align-content: start;
  gap: 0.5rem 0.75rem;
}

.home-notes__label {
  grid-column: 1 / -1;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary-color);
}
</style>
