<template>
  <CuiTilePanel :icon="HOME_ICONS.events" :title>
    <div class="home-events__strip">
      <CuiCameraEvents :cameras :hidden-types="query.hidden" :shown-types="query.shown" :pending="pending || !ready" :bleed="false" class="w-full" />
    </div>
  </CuiTilePanel>
</template>

<script setup lang="ts">
import CuiTilePanel from '@/components/CuiSensorTile/frame/CuiTilePanel.vue';

import { HOME_ICONS } from './home.js';

import type { CuiHomeEventsProps } from './types.js';

const props = defineProps<CuiHomeEventsProps>();

const { t } = useI18n();
const { query, ready } = useRecentEventTypes(() => props.cameras);

const title = computed(() =>
  props.room ? t('views.home_dashboard.scoped_title', { title: t('views.home_dashboard.events'), room: props.room }) : t('views.home_dashboard.events'),
);
</script>

<style scoped>
.home-events__strip {
  display: flex;
  align-items: center;
  flex: 1;
  min-height: 0;
}

@container home-widget (height < 16rem) {
  :deep(.tile-panel__header) {
    display: none;
  }
}
</style>
