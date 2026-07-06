<template>
  <path :id="id" :d="edgePath" :style="edgeStyle" class="vue-flow__edge-path" />
  <EdgeLabelRenderer>
    <div
      class="automation-edge-button nodrag nopan"
      :style="{
        pointerEvents: 'all',
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
      }"
    >
      <button class="automation-edge-delete" @click.stop="onDelete">
        <i-mdi:close class="w-3 h-3" />
      </button>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup lang="ts">
import { EdgeLabelRenderer, getBezierPath, useVueFlow } from '@vue-flow/core';

import type { EdgeProps } from '@vue-flow/core';

const props = defineProps<EdgeProps>();

const { removeEdges } = useVueFlow();

const GAP_SIZE = 24;

const pathResult = computed(() => {
  return getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
});

const edgePath = computed(() => pathResult.value[0]);
const labelX = computed(() => pathResult.value[1]);
const labelY = computed(() => pathResult.value[2]);

// Measure actual SVG path length for accurate gap placement
const measuredLength = computed(() => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('d', edgePath.value);
  return svg.getTotalLength();
});

const edgeStyle = computed(() => {
  const total = measuredLength.value;
  if (total <= 0) return { stroke: 'var(--text-muted-color)', strokeWidth: 2, fill: 'none' };

  const half = total / 2;
  const gapHalf = GAP_SIZE / 2;
  const seg1 = Math.max(0, half - gapHalf);
  const seg2 = Math.max(0, total - half - gapHalf);

  return {
    stroke: 'var(--text-muted-color)',
    strokeWidth: 2,
    fill: 'none',
    strokeDasharray: `${seg1} ${GAP_SIZE} ${seg2}`,
  };
});

function onDelete() {
  removeEdges([props.id]);
}
</script>

<style>
.automation-edge-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--text-danger-color);
  color: white;
  border: 2px solid var(--card-background);
  cursor: pointer;
  opacity: 0.4;
  transition:
    opacity 0.15s ease,
    transform 0.1s ease;
}

.automation-edge-delete:hover {
  opacity: 1;
  transform: scale(1.2);
}

@media (pointer: coarse) {
  .automation-edge-delete {
    opacity: 0.7;
    width: 24px;
    height: 24px;
  }
}
</style>
