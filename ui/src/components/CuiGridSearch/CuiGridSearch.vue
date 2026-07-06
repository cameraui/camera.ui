<template>
  <div class="absolute inset-0 pointer-events-auto" style="z-index: 10">
    <svg
      ref="svgRef"
      class="w-full h-full"
      :viewBox="`0 0 ${cols} ${rows}`"
      preserveAspectRatio="none"
      style="cursor: crosshair; touch-action: none"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <line v-for="c in cols - 1" :key="`v${c}`" :x1="c" :y1="0" :x2="c" :y2="rows" class="grid-line" />

      <line v-for="r in rows - 1" :key="`h${r}`" :x1="0" :y1="r" :x2="cols" :y2="r" class="grid-line" />

      <rect v-for="(region, idx) in modelValue" :key="idx" :x="region.col" :y="region.row" :width="region.w" :height="region.h" class="grid-region" />

      <rect v-if="dragPreview" :x="dragPreview.col" :y="dragPreview.row" :width="dragPreview.w" :height="dragPreview.h" class="grid-region grid-region-preview" />
    </svg>

    <button
      v-for="(region, idx) in modelValue"
      :key="`rm-${idx}`"
      class="grid-remove-btn"
      :style="removeButtonStyle(region)"
      @click.stop="removeRegion(idx)"
      @pointerdown.stop
    >
      <i-mdi:close class="w-[10px] h-[10px]" />
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CuiGridSearchEmits, CuiGridSearchProps, GridRegion, GridSearchPoint } from './types.js';

const props = withDefaults(defineProps<CuiGridSearchProps>(), {
  cols: 10,
  rows: 11,
});

const emit = defineEmits<CuiGridSearchEmits>();

const svgRef = useTemplateRef('svgRef');
const dragging = ref(false);
const dragStart = ref<GridSearchPoint | null>(null);
const dragEnd = ref<GridSearchPoint | null>(null);

const occupied = computed(() => {
  const set = new Set<string>();
  for (const r of props.modelValue) {
    for (let row = r.row; row < r.row + r.h; row++) {
      for (let col = r.col; col < r.col + r.w; col++) {
        set.add(`${col}:${row}`);
      }
    }
  }
  return set;
});

const dragPreview = computed<GridRegion | null>(() => {
  if (!dragging.value || !dragStart.value || !dragEnd.value) return null;
  return clampedRegion(dragStart.value, dragEnd.value);
});

function clampPass(start: GridSearchPoint, end: GridSearchPoint, occ: Set<string>, colFirst: boolean): GridRegion {
  const colDir = end.col >= start.col ? 1 : -1;
  const rowDir = end.row >= start.row ? 1 : -1;

  let maxCol = start.col;
  let maxRow = start.row;

  if (colFirst) {
    const rMin = Math.min(start.row, end.row);
    const rMax = Math.max(start.row, end.row);
    for (let col = start.col; colDir > 0 ? col <= end.col : col >= end.col; col += colDir) {
      let blocked = false;
      for (let row = rMin; row <= rMax; row++) {
        if (occ.has(`${col}:${row}`)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      maxCol = col;
    }
    const cMin = Math.min(start.col, maxCol);
    const cMax = Math.max(start.col, maxCol);
    for (let row = start.row; rowDir > 0 ? row <= end.row : row >= end.row; row += rowDir) {
      let blocked = false;
      for (let col = cMin; col <= cMax; col++) {
        if (occ.has(`${col}:${row}`)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      maxRow = row;
    }
  } else {
    const cMin = Math.min(start.col, end.col);
    const cMax = Math.max(start.col, end.col);
    for (let row = start.row; rowDir > 0 ? row <= end.row : row >= end.row; row += rowDir) {
      let blocked = false;
      for (let col = cMin; col <= cMax; col++) {
        if (occ.has(`${col}:${row}`)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      maxRow = row;
    }
    const rMin = Math.min(start.row, maxRow);
    const rMax = Math.max(start.row, maxRow);
    for (let col = start.col; colDir > 0 ? col <= end.col : col >= end.col; col += colDir) {
      let blocked = false;
      for (let row = rMin; row <= rMax; row++) {
        if (occ.has(`${col}:${row}`)) {
          blocked = true;
          break;
        }
      }
      if (blocked) break;
      maxCol = col;
    }
  }

  return buildRegion(start, { col: maxCol, row: maxRow });
}

function clampedRegion(start: GridSearchPoint, end: GridSearchPoint): GridRegion {
  const occ = occupied.value;
  const r1 = clampPass(start, end, occ, true);
  const r2 = clampPass(start, end, occ, false);
  return r1.w * r1.h >= r2.w * r2.h ? r1 : r2;
}

function buildRegion(a: GridSearchPoint, b: GridSearchPoint): GridRegion {
  const minCol = Math.min(a.col, b.col);
  const maxCol = Math.max(a.col, b.col);
  const minRow = Math.min(a.row, b.row);
  const maxRow = Math.max(a.row, b.row);
  return { col: minCol, row: minRow, w: maxCol - minCol + 1, h: maxRow - minRow + 1 };
}

function cellFromPointer(e: PointerEvent): GridSearchPoint | undefined {
  const svg = svgRef.value;
  if (!svg) return undefined;

  const rect = svg.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  if (x < 0 || x >= 1 || y < 0 || y >= 1) return undefined;

  return {
    col: Math.min(Math.floor(x * props.cols), props.cols - 1),
    row: Math.min(Math.floor(y * props.rows), props.rows - 1),
  };
}

function onPointerDown(e: PointerEvent) {
  const cell = cellFromPointer(e);
  if (!cell) return;

  if (occupied.value.has(`${cell.col}:${cell.row}`)) return;

  dragging.value = true;
  dragStart.value = cell;
  dragEnd.value = cell;
  (e.target as Element)?.setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging.value) return;
  const cell = cellFromPointer(e);
  if (cell) {
    dragEnd.value = cell;
  }
}

function onPointerUp() {
  if (dragging.value && dragPreview.value) {
    emit('update:modelValue', [...props.modelValue, dragPreview.value]);
  }
  dragging.value = false;
  dragStart.value = null;
  dragEnd.value = null;
}

function removeRegion(idx: number) {
  const next = [...props.modelValue];
  next.splice(idx, 1);
  emit('update:modelValue', next);
}

function removeButtonStyle(region: GridRegion): Record<string, string> {
  const useRight = region.col === 0;
  const useBottom = region.row === 0;

  const col = useRight ? region.col + region.w : region.col;
  const row = useBottom ? region.row + region.h : region.row;

  return {
    left: `${(col / props.cols) * 100}%`,
    top: `${(row / props.rows) * 100}%`,
  };
}
</script>

<style scoped>
.grid-line {
  stroke: rgba(255, 255, 255, 0.25);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}

.grid-region {
  fill: color-mix(in srgb, var(--p-primary-color) 35%, transparent);
  stroke: var(--p-primary-color);
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

.grid-region-preview {
  opacity: 0.7;
}

.grid-remove-btn {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--p-primary-color);
  color: white;
  border: none;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform 0.1s;
  line-height: 0;
}

.grid-remove-btn:hover {
  transform: translate(-50%, -50%) scale(1.2);
}
</style>
