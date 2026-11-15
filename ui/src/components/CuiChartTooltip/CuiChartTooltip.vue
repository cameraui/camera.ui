<template>
  <Teleport to="body">
    <div v-if="anchor" ref="tip" class="cui-chart-tooltip" role="tooltip">
      <div v-if="title" class="cui-chart-tooltip-title">{{ title }}</div>
      <div v-for="(row, index) in rows" :key="index" class="cui-chart-tooltip-row">
        <span v-if="row.color" class="cui-chart-tooltip-key" :style="{ background: row.color }" />
        <span>{{ row.text }}</span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { ChartTooltipAnchor, CuiChartTooltipProps } from './types.js';

const props = defineProps<CuiChartTooltipProps>();

const GAP = 8;
const MARGIN = 8;
const FADE_IN_MS = 120;

const tip = useTemplateRef<HTMLElement>('tip');

let placed: HTMLElement | null = null;

function place(element: HTMLElement, anchor: ChartTooltipAnchor): void {
  const { offsetWidth: width, offsetHeight: height } = element;
  const left = Math.min(Math.max(anchor.x - width / 2, MARGIN), window.innerWidth - width - MARGIN);
  const above = anchor.top - height - GAP;
  const position = `translate(${Math.round(left)}px, ${Math.round(above >= MARGIN ? above : anchor.bottom + GAP)}px)`;
  if (element === placed) {
    element.style.transform = position;
    return;
  }

  placed = element;
  element.style.transition = 'none';
  element.style.transform = position;
  element.getBoundingClientRect();
  element.style.transition = '';
  element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE_IN_MS });
}

watch(
  () => [tip.value, props.anchor, props.title, props.rows] as const,
  ([element, anchor]) => {
    if (element && anchor) place(element, anchor);
  },
  { flush: 'post' },
);
</script>

<style scoped>
.cui-chart-tooltip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2147483647;
  width: max-content;
  max-width: calc(100vw - 16px);
  padding: 8px 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 6px;
  background: var(--p-content-background);
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary-color);
  pointer-events: none;
  transition: transform 0.15s ease-out;
}

.cui-chart-tooltip-title {
  font-weight: 600;
  color: var(--p-text-color);
}

.cui-chart-tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.cui-chart-tooltip-key {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
