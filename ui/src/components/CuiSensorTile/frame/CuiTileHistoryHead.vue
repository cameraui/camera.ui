<template>
  <div class="history-head">
    <span class="text-xs font-medium text-muted">{{ label }}</span>
    <Button text size="small" severity="secondary" :label="t('views.sensors.history')" @click="openHistory">
      <template #icon>
        <HistoryIcon class="history-head__icon" />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import HistoryIcon from '~icons/mdi/history';

import { useSensorHistoryDialog } from '@/components/CuiDialog/templates/SensorHistory/useSensorHistoryDialog.js';

import type { CuiTileHistoryHeadProps } from './types.js';

const props = defineProps<CuiTileHistoryHeadProps>();

const { t } = useI18n();
const openSensorHistory = useSensorHistoryDialog();

function openHistory() {
  const { sensor } = props;
  openSensorHistory({ id: sensor.id, name: sensor.displayName.value, type: sensor.type, propertySpecs: sensor.propertySpecs.value });
}
</script>

<style scoped>
.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.history-head__icon {
  width: 1rem;
  height: 1rem;
}
</style>
