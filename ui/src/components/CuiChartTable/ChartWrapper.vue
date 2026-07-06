<template>
  <span v-if="!dataset.length" class="text-muted">
    {{ $t('components.charts.no_data') }}
  </span>
  <Bar
    v-else
    ref="barRef"
    :data="chartData"
    :options="chartOptions"
    :height="height"
    :width="width"
    :style="{
      contain: 'strict',
      contentVisibility: 'auto',
      containIntrinsicSize: `${width}px ${height}px`,
      maxWidth: `${width}px`,
      minWidth: `${width}px`,
      minHeight: `${height}px`,
      maxHeight: `${height}px`,
    }"
    @mouseenter="enableTooltip"
    @mouseleave="disableTooltip"
  />
</template>

<script setup lang="ts">
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'vue-chartjs';

import { CHART_WRAPPER_DEFAULTS } from './types.js';

import type { ChartWrapperProps } from './types.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const props = withDefaults(defineProps<ChartWrapperProps>(), CHART_WRAPPER_DEFAULTS);

const { data: chartData, options: chartOptions, width, height } = toRefs(props);

const barRef = useTemplateRef<{ chart: ChartJS<'bar'> | null }>('barRef');

const dataset = computed(() => chartData.value.datasets?.[0].data ?? []);

function enableTooltip() {
  const chart = barRef.value?.chart;
  if (chart) {
    chart.options.events = ['mousemove', 'mouseout'];
    chart.options.plugins!.tooltip!.enabled = true;
    chart.update('none');
  }
}

function disableTooltip() {
  const chart = barRef.value?.chart;
  if (chart) {
    chart.options.events = [];
    chart.options.plugins!.tooltip!.enabled = false;
    chart.update('none');
  }
}
</script>

<style scoped>
.chart-container {
  position: relative;
}
</style>
