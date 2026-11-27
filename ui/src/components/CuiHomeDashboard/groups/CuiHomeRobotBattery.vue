<template>
  <span class="cui-tile home-robot-battery" :class="{ 'home-robot-battery--low': battery.low }" :style="style"><i class="home-robot-battery__glyph" />{{ text }}</span>
</template>

<script setup lang="ts">
import { toneColor } from '@/common/sensorDisplay.js';

import type { CuiHomeRobotBatteryProps } from './robots.js';

const props = defineProps<CuiHomeRobotBatteryProps>();

const { t } = useI18n();

const text = computed(() => (props.battery.charging ? t('views.home_dashboard.groups.robots.charging', { level: props.battery.level }) : `${props.battery.level} %`));
const style = computed(() => ({ '--level': props.battery.level / 100, ...(props.battery.low ? { '--tile-color': toneColor('alarm') } : {}) }));
</script>

<style scoped>
.home-robot-battery--low {
  color: var(--tile-ink);
}

.home-robot-battery__glyph {
  position: relative;
  display: inline-block;
  width: 1.25rem;
  height: 0.625rem;
  margin-right: 0.3125rem;
  border-radius: 0.1875rem;
  box-shadow: inset 0 0 0 1.5px currentColor;
  vertical-align: -0.0625rem;
}

.home-robot-battery__glyph::after {
  content: '';
  position: absolute;
  top: 2.5px;
  bottom: 2.5px;
  left: 2.5px;
  width: calc((100% - 5px) * var(--level));
  border-radius: 1px;
  background: currentColor;
}
</style>
