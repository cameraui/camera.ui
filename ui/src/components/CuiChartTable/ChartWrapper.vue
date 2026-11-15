<template>
  <span v-if="!dataset.length" class="text-muted">
    {{ $t('components.charts.no_data') }}
  </span>
  <div v-else class="w-fit -my-2 py-2" v-on="listeners">
    <Bar
      ref="barRef"
      :data="chartData"
      :options="chartOptions"
      :plugins="[columnBand]"
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
    />
    <CuiChartTooltip :anchor="tip && anchor" :title="tip?.title" :rows="tip?.rows" />
  </div>
</template>

<script setup lang="ts">
import { BarElement, CategoryScale, Chart as ChartJS, LinearScale } from 'chart.js';
import { Bar } from 'vue-chartjs';

import { CHART_WRAPPER_DEFAULTS } from './types.js';

import type { Plugin } from 'chart.js';
import type { ChartWrapperProps } from './types.js';

ChartJS.register(CategoryScale, LinearScale, BarElement);

const props = withDefaults(defineProps<ChartWrapperProps>(), CHART_WRAPPER_DEFAULTS);

const { data: chartData, options: chartOptions, width, height } = toRefs(props);

const { active, anchor, listeners } = useChartTooltip(() => barRef.value?.chart, 'column');

const BAND_OPACITY = 0.15;

const columnBand: Plugin<'bar'> = {
  id: 'columnBand',
  beforeDatasetsDraw(chart) {
    const element = chart.getActiveElements()[0]?.element;
    if (!element) return;
    const { ctx, chartArea } = chart;
    const slot = chartArea.width / dataset.value.length;
    ctx.save();
    ctx.globalAlpha = BAND_OPACITY;
    ctx.fillStyle = getComputedStyle(chart.canvas).getPropertyValue('--p-primary-color').trim();
    ctx.fillRect(element.x - slot / 2, chartArea.top, slot, chartArea.height);
    ctx.restore();
  },
};

const barRef = useTemplateRef<{ chart: ChartJS<'bar'> | null }>('barRef');

const dataset = computed(() => chartData.value.datasets?.[0]?.data ?? []);

const tip = computed(() => {
  const index = active.value?.index;
  const time = index === undefined ? undefined : chartData.value.labels?.[index];
  if (index === undefined || time == null) return undefined;
  return {
    title: new Date(Number(time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    rows: [{ text: `${Number(dataset.value[index]).toFixed(2)}%` }],
  };
});
</script>
