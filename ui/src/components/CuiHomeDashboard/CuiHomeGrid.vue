<template>
  <div class="home-grid" :class="{ 'home-grid--editing': editing }" :style="{ '--home-gap': `${gap}px` }">
    <div ref="gridRef" class="grid-stack" @pointerdown.capture="resizeByTouch" @touchstart.capture="keepHandleTouch">
      <Transition name="home-grid-cells">
        <div v-if="editing" class="home-grid__cells" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }" aria-hidden="true">
          <span v-for="cell in columns * rows" :key="cell" class="home-grid__cell" />
        </div>
      </Transition>
      <div v-for="item in items" :key="item.id" class="grid-stack-item" :data-home-id="item.id">
        <div class="grid-stack-item-content">
          <slot :item />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';

import { nearestSize, settleLayout, updateHomes } from './layout.js';

import type { DBHomeWidgetPosition } from '@shared/types';
import type { GridItemHTMLElement, GridStackMoveOpts, GridStackNode, GridStackWidget } from 'gridstack';
import type { CuiHomeGridEmits, CuiHomeGridProps, HomeCellPosition, HomeCellSize, HomeGridFolder, HomeGridItem } from './types.js';

const props = defineProps<CuiHomeGridProps>();
const emit = defineEmits<CuiHomeGridEmits>();
defineSlots<{ default(props: { item: HomeGridItem }): unknown }>();

const PARK_ROW = 1000;
const PARK_STEP = 20;
const FOLDER_ARM_MS = 450;
const FOLDER_RELEASE_MS = 300;
const FOLDER_DRIFT_PX = 6;
const FOLDER_INSET = 0.22;

const gridRef = useTemplateRef<HTMLDivElement>('gridRef');

let grid: GridStack | null = null;
let builtIds = '';
let homes = new Map<string, HomeCellPosition>();
let start: Map<string, DBHomeWidgetPosition> | undefined;
let folder: HomeGridFolder | undefined;
let dragged: GridStackNode | undefined;

const { width } = useElementSize(gridRef);
const { height: viewHeight } = useWindowSize();

const usedRows = computed(() => Math.max(0, ...props.items.map((item) => item.y + item.h)));
const rows = computed(() => {
  if (!props.editing) return usedRows.value;
  const cell = width.value / props.columns;
  return Math.max(usedRows.value + 2, cell ? Math.ceil(viewHeight.value / cell) : 0);
});
const idsKey = computed(
  () =>
    `${props.columns}|${props.items
      .map((item) => item.id)
      .sort()
      .join(',')}`,
);
const layoutKey = computed(() =>
  props.items
    .map((item) => `${item.id}:${item.x},${item.y},${item.w},${item.h}`)
    .sort()
    .join('|'),
);

function build() {
  destroy();
  if (!gridRef.value) return;

  grid = GridStack.init(
    {
      column: props.columns,
      cellHeight: 'auto',
      margin: props.gap / 2,
      animate: false,
      staticGrid: !props.editing,
      resizable: { handles: 'se' },
      alwaysShowResizeHandle: true,
      mode: 'float',
      minRow: rows.value,
      acceptWidgets: '.home-drag-in',
      auto: false,
    },
    gridRef.value,
  );
  builtIds = idsKey.value;
  holdOverFolders();

  grid?.batchUpdate();
  for (const item of props.items) {
    const el = itemElement(item.id);
    if (el) grid?.makeWidget(el, nodeOf(item));
  }
  grid?.batchUpdate(false);

  updateHomes(homes, currentLayout());

  grid?.on('change', emitLayout);
  grid?.on('resizestop', (_event, el) => requestAnimationFrame(() => fit(el as GridItemHTMLElement)));
  grid?.on('dragstart', (_event, el) => {
    start = currentLayout();
    dragged = (el as GridItemHTMLElement).gridstackNode;
  });
  grid?.on('resizestart', () => (start = currentLayout()));
  grid?.on('dragstop', (_event, el) => requestAnimationFrame(() => dropped(el as GridItemHTMLElement)));
  grid?.on('dropped', (_event, _previous, node) => dropIn(node));
  requestAnimationFrame(() => grid?.setAnimation(true));
}

function resizeByTouch(event: PointerEvent) {
  const handle = resizeHandle(event);
  if (!handle || event.pointerType === 'mouse' || !event.isPrimary) return;
  event.stopPropagation();
  event.preventDefault();
  const forward = (type: string, { clientX, clientY, screenX, screenY }: PointerEvent, target: EventTarget = document) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX, clientY, screenX, screenY }));
  const move = (moveEvent: PointerEvent) => {
    if (moveEvent.pointerId === event.pointerId) forward('mousemove', moveEvent);
  };
  const end = (endEvent: PointerEvent) => {
    if (endEvent.pointerId !== event.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    forward('mouseup', endEvent);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  forward('mousedown', event, handle);
}

function keepHandleTouch(event: TouchEvent) {
  if (resizeHandle(event)) event.stopPropagation();
}

function resizeHandle(event: Event): Element | null {
  return event.target instanceof Element ? event.target.closest('.ui-resizable-handle') : null;
}

function destroy() {
  dragged = undefined;
  leaveFolder();
  grid?.offAll();
  grid?.destroy(false);
  grid = null;
}

function emitLayout() {
  if (!grid || !props.editing) return;
  emit('layout', Object.fromEntries(currentLayout()));
}

function currentLayout(): Map<string, DBHomeWidgetPosition> {
  return new Map((grid?.engine.nodes ?? []).map((node) => [String(node.id), { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 }]));
}

function dropIn(node: GridStackNode) {
  if (!grid || !node.el) return;
  const position = { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 };
  grid.removeWidget(node.el, true, false);
  emit('drop', String(node.id), position);
}

function fit(el: GridItemHTMLElement) {
  const node = el.gridstackNode;
  const item = props.items.find((entry) => entry.id === String(node?.id));
  if (!node || !item) return;
  const size = { w: node.w ?? 1, h: node.h ?? 1 };
  settle(item.id, item.range ? size : nearestSize(item.sizes, size).size);
}

function overFolder(node: GridStackNode, options: GridStackMoveOpts): boolean {
  const { rect, cellWidth, cellHeight } = options;
  if (!rect || !cellWidth || !cellHeight) return false;
  const at = { x: (rect.x ?? 0) + (rect.w ?? 0) / 2, y: (rect.y ?? 0) + (rect.h ?? 0) / 2, cellWidth, cellHeight };
  const id = String(node.id);
  const target = grid?.engine.nodes.find((entry) => entry !== node && inside(entry, at, 0) && props.groupAction?.(id, String(entry.id)));
  if (target !== folder?.node) hoverFolder(target, target && props.groupAction?.(id, String(target.id)));
  if (!folder) return false;
  folder.cell = { x: options.x ?? 0, y: options.y ?? 0 };
  const { x = 0, y = 0, w = 1, h = 1 } = folder.node;
  restOn(inside(folder.node, at, FOLDER_INSET), Math.hypot(at.x - (x + w / 2) * cellWidth, at.y - (y + h / 2) * cellHeight));
  return folder.held;
}

function hoverFolder(node: GridStackNode | undefined, label: string | undefined) {
  leaveFolder();
  if (!node || !label) return;
  folder = { node, label, closest: Infinity, armed: false, held: true };
}

function holdOverFolders() {
  if (!grid) return;
  const moveNodeCheck = grid.engine.moveNodeCheck.bind(grid.engine);
  grid.engine.moveNodeCheck = (node, options) =>
    node === dragged && props.groupAction && !options.resizing && overFolder(node, options) ? false : moveNodeCheck(node, options);
}

function restOn(middle: boolean, distance: number) {
  const hover = folder!;
  if (!hover.held) return;
  if (middle) {
    hover.closest = Math.min(hover.closest, distance);
    if (hover.middle) return;
    hover.middle = true;
    clearTimeout(hover.timer);
    hover.timer = setTimeout(() => armFolder(true), FOLDER_ARM_MS);
    return;
  }
  if (distance > hover.closest + FOLDER_DRIFT_PX) return release(hover);
  const nearer = distance < hover.closest - FOLDER_DRIFT_PX;
  if (hover.middle === false && !nearer) return;
  hover.middle = false;
  hover.closest = Math.min(hover.closest, distance);
  armFolder(false);
  clearTimeout(hover.timer);
  hover.timer = setTimeout(() => release(hover), FOLDER_RELEASE_MS);
}

function release(hover: HomeGridFolder) {
  clearTimeout(hover.timer);
  armFolder(false);
  hover.held = false;
}

function armFolder(armed: boolean) {
  if (!folder || folder.armed === armed) return;
  folder.armed = armed;
  const content = folder.node.el?.firstElementChild as HTMLElement | null;
  if (content) content.dataset.folder = folder.label;
  folder.node.el?.classList.toggle('home-grid__folder', armed);
  gridRef.value?.classList.toggle('home-grid--folding', armed);
  if (armed) navigator.vibrate?.(10);
}

function leaveFolder() {
  if (!folder) return;
  clearTimeout(folder.timer);
  armFolder(false);
  folder = undefined;
}

function dropped(el: GridItemHTMLElement) {
  dragged = undefined;
  const target = folder?.armed ? folder.node : undefined;
  const cell = folder?.cell;
  leaveFolder();
  if (!target) return moved(el, cell);
  emit('group', String(el.gridstackNode?.id), String(target.id), { x: target.x ?? 0, y: target.y ?? 0 });
  start = undefined;
}

function inside(node: GridStackNode, at: { x: number; y: number; cellWidth: number; cellHeight: number }, inset: number): boolean {
  const width = (node.w ?? 1) * at.cellWidth;
  const height = (node.h ?? 1) * at.cellHeight;
  const left = (node.x ?? 0) * at.cellWidth + width * inset;
  const top = (node.y ?? 0) * at.cellHeight + height * inset;
  return at.x >= left && at.x <= left + width * (1 - 2 * inset) && at.y >= top && at.y <= top + height * (1 - 2 * inset);
}

function moved(el: GridItemHTMLElement, cell?: HomeCellPosition) {
  const node = el.gridstackNode;
  if (!node) return;
  settle(String(node.id), { w: node.w ?? 1, h: node.h ?? 1 }, cell);
}

function settle(id: string, size: HomeCellSize, cell?: HomeCellPosition) {
  const before = start ?? currentLayout();
  start = undefined;
  const nodes = grid?.engine.nodes ?? [];
  const active = nodes.find((node) => String(node.id) === id);
  if (!grid || !active?.el) return;

  const settled = settleLayout(before, id, { ...(cell ?? { x: active.x ?? 0, y: active.y ?? 0 }), ...size }, props.columns, homes);
  updateHomes(homes, settled, id);
  const changed = nodes.flatMap((node) => {
    const spot = settled.get(String(node.id));
    return spot && (node.x !== spot.x || node.y !== spot.y || node.w !== spot.w || node.h !== spot.h) ? [{ node, spot }] : [];
  });
  grid.batchUpdate();
  changed.forEach(({ node }, index) => grid?.update(node.el!, { y: PARK_ROW + index * PARK_STEP }));
  for (const { node, spot } of changed.sort((a, b) => a.spot.y - b.spot.y)) grid.update(node.el!, spot);
  grid.batchUpdate(false);
  emitLayout();
}

function resetHomes() {
  homes = new Map();
  updateHomes(homes, currentLayout());
}

function itemElement(id: string) {
  return gridRef.value?.querySelector<GridItemHTMLElement>(`[data-home-id="${CSS.escape(id)}"]`) ?? undefined;
}

function nodeOf({ id, x, y, w, h, sizes, range }: HomeGridItem): GridStackWidget {
  if (range) return { id, x, y, w, h, minW: range.w[0], maxW: Math.min(range.w[1], props.columns), minH: range.h[0], maxH: range.h[1] };
  const ws = sizes.map(({ size }) => size.w);
  const hs = sizes.map(({ size }) => size.h);
  return { id, x, y, w, h, minW: Math.min(...ws), maxW: Math.max(...ws), minH: Math.min(...hs), maxH: Math.max(...hs) };
}

function rebuild() {
  build();
  resetHomes();
}

function reveal(id: string) {
  itemElement(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

watch(
  [idsKey, layoutKey],
  () => {
    if (props.editing && idsKey.value === builtIds) return;
    build();
  },
  { flush: 'post' },
);

watch(
  () => props.editing,
  (editing) => {
    grid?.setStatic(!editing);
    resetHomes();
  },
);

watch(rows, (minRow) => grid?.updateOptions({ minRow }));

onMounted(build);

onBeforeUnmount(destroy);

defineExpose({ reveal, settle, rebuild });
</script>

<style scoped>
.home-grid {
  isolation: isolate;
  margin: calc(var(--home-gap) / -2);
}

.home-grid__cells {
  position: absolute;
  inset: 0 0 auto;
  display: grid;
  grid-auto-rows: var(--gs-cell-height);
  pointer-events: none;
}

.home-grid-cells-enter-active,
.home-grid-cells-leave-active {
  transition: opacity 0.25s ease;
}

.home-grid-cells-enter-from,
.home-grid-cells-leave-to {
  opacity: 0;
}

.home-grid__cell {
  margin: calc(var(--home-gap) / 2);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--text-color) 4%, transparent);
}

.home-grid :deep(.grid-stack > .grid-stack-item > .grid-stack-item-content) {
  overflow: visible;
}

.home-grid--editing :deep(.grid-stack-item.ui-draggable-dragging > .grid-stack-item-content) {
  transform: scale(1.02);
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 0.35));
}

.home-grid :deep(.grid-stack-item > .grid-stack-item-content) {
  transition: transform 0.2s ease;
}

.home-grid :deep(.grid-stack > .grid-stack-item:not([gs-x])) {
  visibility: hidden;
}

.home-grid :deep(.home-grid__folder > .grid-stack-item-content) {
  outline: 3px solid var(--p-primary-color);
  outline-offset: 3px;
  border-radius: 1.5rem;
  transform: scale(1.04);
}

.home-grid :deep(.home-grid__folder > .grid-stack-item-content::after) {
  content: attr(data-folder);
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border-radius: 1.5rem;
  background: color-mix(in srgb, var(--p-primary-color) 30%, rgb(0 0 0 / 0.55));
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  text-align: center;
  pointer-events: none;
  animation: home-grid-folder 0.2s ease;
}

@keyframes home-grid-folder {
  from {
    opacity: 0;
  }
}

.home-grid--folding :deep(.grid-stack-item.ui-draggable-dragging > .grid-stack-item-content) {
  transform: scale(0.8);
  opacity: 0.8;
}

.home-grid--folding :deep(.grid-stack-placeholder) {
  opacity: 0;
}

.home-grid :deep(.grid-stack-placeholder > .placeholder-content) {
  border: 2px dashed color-mix(in srgb, var(--p-primary-color) 60%, transparent);
  border-radius: 1rem;
  background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
}

.home-grid :deep(.grid-stack-item > .ui-resizable-se) {
  touch-action: none;
  right: var(--gs-item-margin-right);
  bottom: var(--gs-item-margin-bottom);
  width: 2.5rem;
  height: 2.5rem;
  background: none;
  transform: none;
}

.home-grid :deep(.grid-stack-item > .ui-resizable-se::after) {
  content: '';
  position: absolute;
  right: 0.625rem;
  bottom: 0.625rem;
  width: 1.125rem;
  height: 1.125rem;
  border-right: 3px solid var(--text-secondary-color);
  border-bottom: 3px solid var(--text-secondary-color);
  border-bottom-right-radius: 0.625rem;
}

.home-grid :deep(.grid-stack-item:has(.home-camera) > .ui-resizable-se::after) {
  border-color: white;
  filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.6));
}
</style>
