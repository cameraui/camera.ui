<template>
  <DndProvider :backend="isTouch ? TouchBackend : HTML5Backend">
    <div class="w-full h-full flex flex-row">
      <div ref="viewRef" class="view-container w-full flex flex-col min-w-0 overflow-y-auto items-center" :class="{ 'px-2': editMode && lgBreakpoint }">
        <Button v-if="isFullscreen" severity="secondary" rounded class="cui-fs-exit" :aria-label="$t('components.form.tooltip.fullscreen_off')" @click="toggleFs">
          <template #icon>
            <i-mingcute:fullscreen-exit-fill class="w-5 h-5" />
          </template>
        </Button>

        <div v-if="expandedIdx !== undefined" class="w-full aspect-video relative my-auto" :style="{ maxWidth: `${maxWidth}px` }">
          <ViewDnDCard
            ref="fsCardRef"
            :class="[
              'w-full h-full',
              {
                'card-expanded': fullScreenCard !== undefined,
                'card-collapsing': collapsingCard !== undefined,
              },
            ]"
            :camera="cards[expandedIdx]?.lastDroppedCamera"
            :cameras
            :dropped-cameras
            mode="normal"
            :index="expandedIdx"
            :camera-card-props="{ ...activeCameraCardProps(cards[expandedIdx]?.lastDroppedCamera), expanded: true }"
            :camera-card-models
            @expand="(camera: DBCamera, expanded: boolean) => toggleFullScreenCard(camera, expandedIdx!, expanded)"
          />
        </div>

        <div
          v-show="expandedIdx === undefined"
          ref="wrapperRef"
          class="w-full relative my-auto"
          :class="smBreakpoint ? 'h-auto' : 'aspect-video'"
          :style="smBreakpoint ? undefined : { maxWidth: `${maxWidth}px` }"
        >
          <div ref="gridRef" class="grid-stack w-full h-full">
            <div
              v-for="(card, idx) in cards"
              :key="idx"
              class="grid-stack-item"
              :gs-id="String(idx)"
              :gs-x="getWidgetPos(idx).x"
              :gs-y="getWidgetPos(idx).y"
              :gs-w="getWidgetPos(idx).w"
              :gs-h="getWidgetPos(idx).h"
            >
              <div class="grid-stack-item-content">
                <ViewDnDCard
                  ref="cardRefs"
                  :camera="card.lastDroppedCamera"
                  :cameras
                  :dropped-cameras
                  :mode="currentMode"
                  :index="idx"
                  :camera-card-props="{ ...activeCameraCardProps(card.lastDroppedCamera), expanded: expandedIdx === idx }"
                  :camera-card-models
                  :on-drop="(camera: DBCamera) => emit('drop', idx, camera)"
                  @expand="(camera: DBCamera, expanded: boolean) => toggleFullScreenCard(camera, idx, expanded)"
                  @drop="(camera: DBCamera) => emit('drop', idx, camera)"
                  @remove="(camera: DBCamera) => emit('remove', camera)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ViewDnDSidebar
        v-if="editMode && lgBreakpoint"
        :cameras
        :dropped-cameras
        :title
        class="view-box shadow-xl"
        :style="{ 'margin-right': editMode ? '0px' : `-${SIDEBAR_WIDTH}px` }"
        @change-view-size="emit('changeViewSize')"
      />
    </div>
  </DndProvider>
</template>

<script setup lang="ts">
import { NvrPlaybackKey } from '@camera.ui/nvr';
import { GridStack } from 'gridstack';
import 'gridstack/dist/gridstack.min.css';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { DndProvider } from 'vue3-dnd';

import { CUI_CAMERA_VIEW_DND_DEFAULTS, DEFAULT_LAYOUTS, SIDEBAR_WIDTH, VIEW_GRID_INFO } from './types.js';

import type { CameraActivityMode, VideoStreamingMode } from '@camera.ui/browser';
import type { StreamingRole } from '@camera.ui/sdk';
import type { DBCamera, DBCamviewLayoutCamera } from '@shared/types';
import type { CuiCameraViewDnDEmits, CuiCameraViewDnDProps, GsLayoutItem } from './types.js';
import type ViewDnDCard from './ViewDnDCard.vue';

const props = withDefaults(defineProps<CuiCameraViewDnDProps>(), CUI_CAMERA_VIEW_DND_DEFAULTS);

const emit = defineEmits<CuiCameraViewDnDEmits>();

const { isTouch } = useSharedCuiUserAgent();
const { smBreakpoint, lgBreakpoint } = useSharedCuiBreakpoint();
const nvrMaster = inject(NvrPlaybackKey, undefined);

const routerStore = useRouterStore();
const { routeFrom, routeTo } = storeToRefs(routerStore);

const { editMode, rearrangeMode, viewSize, cards, cameraCardProps } = toRefs(props);

const viewRef = useTemplateRef('viewRef');
const wrapperRef = useTemplateRef<HTMLDivElement>('wrapperRef');
const gridRef = useTemplateRef<HTMLDivElement>('gridRef');
const cardRefs = useTemplateRef<InstanceType<typeof ViewDnDCard>[]>('cardRefs');
const fullScreenCard = ref<number>();
const collapsingCard = ref<number>();

let gsInstance: GridStack | null = null;

const { isFullscreen, toggle: toggleFs } = useCuiFullscreen(viewRef, { mode: 'scroll' });
const viewBounds = useElementSize(viewRef);
const wrapperSize = useElementSize(wrapperRef);

const currentMode = computed<'normal' | 'edit' | 'rearrange'>(() => {
  if (editMode.value) return 'edit';
  if (rearrangeMode.value) return 'rearrange';
  return 'normal';
});

const expandedIdx = computed(() => fullScreenCard.value ?? collapsingCard.value);

const activeCameraCardProps = computed(() => {
  return (camera: DBCamera | undefined) => {
    const p = { ...toRaw(cameraCardProps.value) };
    if (camera) {
      const routeFromMatch = routeFrom.value?.includes(`/cameras/${camera.name}`) ?? false;
      const routeToMatch = routeTo.value?.includes(`/cameras/${camera.name}`) ?? false;
      const enableViewTransition = p.viewTransition && (routeFromMatch || routeToMatch);
      const basePath = `/cameras/${camera.name}`;
      if (nvrMaster?.isActive.value) {
        const tsMs = Math.floor(nvrMaster.currentTimestamp.value / 1000);
        p.routerLink = `${basePath}?startTs=${tsMs}`;
      } else {
        p.routerLink = basePath;
      }
      p.viewTransition = enableViewTransition;
    }
    return p;
  };
});

const maxWidth = computed(() => (viewBounds.height.value - 16) * (16 / 9));

const droppedCameras = computed<DBCamera[]>(() => {
  return cards.value.filter((c) => c.lastDroppedCamera).map((c) => c.lastDroppedCamera!);
});

function getWidgetPos(idx: number): GsLayoutItem {
  const card = cards.value[idx];
  // Mobile: single column, use stored y-position or stack default
  if (smBreakpoint.value) {
    return { x: 0, y: card?.y ?? idx, w: 1, h: 1 };
  }
  const defaults = DEFAULT_LAYOUTS[viewSize.value]?.[idx];
  return {
    x: card?.x ?? defaults?.x ?? 0,
    y: card?.y ?? defaults?.y ?? 0,
    w: card?.colSpan ?? defaults?.w ?? 1,
    h: card?.rowSpan ?? defaults?.h ?? 1,
  };
}

function emitRearrange(): void {
  if (!gsInstance) return;

  const layoutCameras: DBCamviewLayoutCamera[] = [];
  for (const el of gsInstance.getGridItems()) {
    const node = (el as any).gridstackNode;
    if (!node) continue;
    const idx = parseInt(node.id as string);
    const card = cards.value[idx];
    if (!card?.lastDroppedCamera) continue;

    layoutCameras.push({
      index: idx,
      cameraId: card.lastDroppedCamera._id,
      colSpan: node.w,
      rowSpan: node.h,
      x: node.x,
      y: node.y,
    });
  }

  emit('rearrange', layoutCameras);
}

function onGridChange(): void {
  emitRearrange();
}

function initGrid(): void {
  if (!gridRef.value) return;
  const info = VIEW_GRID_INFO[viewSize.value];
  if (!info) return;

  const isMobile = smBreakpoint.value;
  const cols = isMobile ? 1 : info.cols;
  const rows = isMobile ? cards.value.length : info.rows;
  const wrapper = wrapperRef.value;
  const wrapperW = wrapper?.clientWidth ?? 0;
  const cellH = isMobile ? (wrapperW * 9) / 16 : wrapperW > 0 ? (wrapperW * 9) / 16 / info.rows : 60;
  const isRearrange = currentMode.value === 'rearrange';

  gsInstance = GridStack.init(
    {
      column: cols,
      minRow: rows,
      cellHeight: cellH,
      margin: isRearrange ? 3 : 1,
      float: false,
      animate: false,
      staticGrid: !isRearrange,
      resizable: isMobile ? { handles: '' } : { handles: 'se' },
      disableResize: isMobile,
      alwaysShowResizeHandle: !isMobile,
    },
    gridRef.value,
  );

  if (!gsInstance) return;

  gsInstance.on('change', onGridChange);

  // Enable animation after first paint so items don't slide on initial load
  requestAnimationFrame(() => gsInstance?.setAnimation(true));
}

function destroyGrid(): void {
  if (!gsInstance) return;
  gsInstance.offAll();
  gsInstance.destroy(false);
  gsInstance = null;
}

function toggleFullScreenCard(camera: DBCamera, index: number, expanded: boolean): void {
  if (!expanded) {
    collapsingCard.value = index;
    fullScreenCard.value = undefined;
    setTimeout(() => {
      collapsingCard.value = undefined;
    }, 250);
  } else {
    fullScreenCard.value = index;
  }
  emit('expand', camera, expanded);
}

async function toggleFullscreen(): Promise<void> {
  await toggleFs();
}

function toggleAllPlayerMute(state?: boolean): void {
  for (const child of cardRefs.value || []) child.togglePlayerMute(state);
}

async function toggleAllPlayerMicrophone(state?: boolean, enableSpeaker?: boolean): Promise<void> {
  await Promise.allSettled((cardRefs.value || []).map((c) => c.toggleMicrophone(state, enableSpeaker)));
}

function toggleAllPlayerActivityMode(state?: CameraActivityMode): void {
  for (const child of cardRefs.value || []) child.togglePlayerActivityMode(state);
}

async function toggleAllPlayerSourceRole(state?: StreamingRole): Promise<void> {
  await Promise.allSettled((cardRefs.value || []).map((c) => c.togglePlayerSourceRole(state)));
}

async function toggleAllPlayerStreamingMode(state?: VideoStreamingMode): Promise<void> {
  await Promise.allSettled((cardRefs.value || []).map((c) => c.togglePlayerStreamingMode(state)));
}

function toggleAllPlayerBbox(state?: boolean): void {
  for (const child of cardRefs.value || []) child.togglePlayerBbox(state);
}

function toggleAllPip(state?: boolean): void {
  for (const child of cardRefs.value || []) child.togglePip(state);
}

function compactGrid(): void {
  if (!gsInstance) return;
  gsInstance.compact();
  emitRearrange();
}

function fitAspectRatios(): void {
  if (!gsInstance) return;

  const info = VIEW_GRID_INFO[viewSize.value];
  if (!info) return;
  const totalCols = info.cols;

  // 1. Collect card info with cell aspect ratios
  type CardEntry = { idx: number; el: HTMLElement; cellRatio: number };
  const entries: CardEntry[] = [];

  for (const el of gsInstance.getGridItems()) {
    const node = (el as any).gridstackNode;
    if (!node) continue;
    const idx = parseInt(node.id as string);
    const camera = cards.value[idx]?.lastDroppedCamera;
    const aspectStr = camera?.interfaceSettings?.aspectRatio || '16:9';
    const [rw, rh] = aspectStr.split(':').map(Number);
    // w/h ratio in grid cells for this aspect ratio
    entries.push({ idx, el, cellRatio: (rw / rh) * (9 / 16) });
  }

  if (!entries.length) return;

  // 2. Justified-rows fit that respects BOTH width and height.
  const totalRows = info.rows;

  type PackedRow = { row: CardEntry[]; ratioSum: number; rowH: number; filled: boolean };
  function pack(targetH: number): { rows: PackedRow[]; totalH: number } {
    const rows: PackedRow[] = [];
    let totalH = 0;
    let k = 0;
    while (k < entries.length) {
      const row: CardEntry[] = [];
      let ratioSum = 0;
      let filled = false;
      while (k < entries.length) {
        const next = entries[k].cellRatio;
        if (targetH * (ratioSum + next) > totalCols && row.length > 0) {
          filled = true;
          break;
        }
        row.push(entries[k]);
        ratioSum += next;
        k++;
      }
      const rowH = filled ? totalCols / ratioSum : targetH;
      rows.push({ row, ratioSum, rowH, filled });
      totalH += rowH;
    }
    return { rows, totalH };
  }

  let lo = 0.25;
  let hi = totalRows;
  let best = lo;
  for (let iter = 0; iter < 40; iter++) {
    const mid = (lo + hi) / 2;
    if (pack(mid).totalH <= totalRows) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const { rows } = pack(best);

  // 3. Lay out
  const naturalSum = rows.reduce((a, r) => a + r.rowH, 0) || 1;
  const vScale = naturalSum > totalRows ? totalRows / naturalSum : 1;
  const rowHeights = rows.map((r) => r.rowH * vScale);
  const scaledSum = rowHeights.reduce((a, b) => a + b, 0);

  const positions = new Map<number, { x: number; y: number; w: number; h: number }>();
  let prevY = Math.max(0, Math.round((totalRows - scaledSum) / 2)); // center the mosaic vertically
  let yFloat = prevY;
  for (let r = 0; r < rows.length; r++) {
    yFloat += rowHeights[r];
    const yEnd = Math.min(totalRows, Math.round(yFloat));
    const rowH = Math.max(1, yEnd - prevY);
    const { row, ratioSum, filled } = rows[r];

    if (filled) {
      // Justified to the full width; last card takes the remaining cols.
      let x = 0;
      for (let j = 0; j < row.length; j++) {
        const w = j === row.length - 1 ? Math.max(1, totalCols - x) : Math.max(1, Math.round((row[j].cellRatio / ratioSum) * totalCols));
        positions.set(row[j].idx, { x, y: prevY, w, h: rowH });
        x += w;
      }
    } else {
      // Partial trailing row: cards at their natural width (aspect × height),
      // centered horizontally rather than stretched across the whole width.
      const widths = row.map((c) => Math.max(1, Math.round(c.cellRatio * rowH)));
      const rowWidth = widths.reduce((a, b) => a + b, 0);
      let x = Math.max(0, Math.round((totalCols - rowWidth) / 2));
      for (let j = 0; j < row.length; j++) {
        positions.set(row[j].idx, { x, y: prevY, w: widths[j], h: rowH });
        x += widths[j];
      }
    }
    prevY = yEnd;
  }

  // 4. Apply all positions at once
  gsInstance.batchUpdate();
  for (const [idx, pos] of positions) {
    const entry = entries.find((e) => e.idx === idx);
    if (entry) gsInstance!.update(entry.el, pos);
  }
  gsInstance.batchUpdate(false);
  emitRearrange();
}

watch(
  [viewSize, () => cards.value.length, smBreakpoint],
  () => {
    destroyGrid();
    nextTick(() => initGrid());
  },
  { immediate: false },
);

// Toggle static mode and margin when mode changes
watch(currentMode, (mode) => {
  if (!gsInstance) return;
  const isRearrange = mode === 'rearrange';
  gsInstance.setStatic(!isRearrange);
  gsInstance.margin(isRearrange ? 3 : 1);
});

watch(
  () => wrapperSize.width.value,
  (w) => {
    if (!gsInstance || w <= 0) return;
    gsInstance.setAnimation(false);
    if (smBreakpoint.value) {
      gsInstance.cellHeight((w * 9) / 16);
    } else {
      const rows = VIEW_GRID_INFO[viewSize.value]?.rows ?? 1;
      gsInstance.cellHeight((w * 9) / 16 / rows);
    }
    requestAnimationFrame(() => gsInstance?.setAnimation(true));
  },
);

onMounted(() => {
  nextTick(() => initGrid());
});

onBeforeUnmount(() => {
  destroyGrid();
});

defineExpose({
  toggleFullscreen,
  toggleAllPlayerMute,
  toggleAllPlayerMicrophone,
  toggleAllPlayerActivityMode,
  toggleAllPlayerSourceRole,
  toggleAllPlayerStreamingMode,
  toggleAllPlayerBbox,
  toggleAllPip,
  compactGrid,
  fitAspectRatios,
  isFullscreen,
});
</script>

<style scoped>
.view-container {
  width: 100%;
  height: 100%;
  transition: padding 0.2s ease-in-out;
}

.cui-fs-exit {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 12px);
  right: calc(env(safe-area-inset-right) + 12px);
  z-index: 2147483647;
  width: 40px;
  height: 40px;
  background: rgba(0, 0, 0, 0.55) !important;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: white !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  opacity: 0.85;
  transition: opacity 0.15s ease;
}

.cui-fs-exit:hover,
.cui-fs-exit:focus {
  opacity: 1;
}

.view-box {
  margin-right: -400px;
  transition: 0.2s all ease-in-out;
}

.card-expanded {
  animation: card-expand 0.25s ease-out;
}

@keyframes card-expand {
  from {
    transform: scale(0.9);
    opacity: 0.8;
  }

  to {
    transform: scale(1);
    opacity: 1;
  }
}

.card-collapsing {
  animation: card-collapse 0.25s ease-out forwards;
}

@keyframes card-collapse {
  from {
    transform: scale(1);
    opacity: 1;
  }

  to {
    transform: scale(0.9);
    opacity: 0;
  }
}
</style>

<style>
.grid-stack > .grid-stack-item > .grid-stack-item-content {
  overflow: hidden;
  background: #000;
  border: 2px solid transparent;
  transition:
    top 0.25s ease,
    right 0.25s ease,
    bottom 0.25s ease,
    left 0.25s ease,
    border-radius 0.25s ease;
}

.grid-stack > .grid-stack-placeholder > .placeholder-content {
  border: 2px dashed rgba(223, 42, 76, 0.6) !important;
  background: rgba(223, 42, 76, 0.08) !important;
  border-radius: 8px;
}

.grid-stack:not(.grid-stack-static) > .grid-stack-item:not(.ui-resizable-disabled) > .ui-resizable-se {
  display: block !important;
  width: 24px !important;
  height: 24px !important;
  background: linear-gradient(135deg, transparent 50%, rgba(223, 42, 76, 0.6) 50%) !important;
  transform: none !important;
  border-radius: 0 0 8px 0;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 10;
}

.grid-stack:not(.grid-stack-static) > .grid-stack-item:hover > .ui-resizable-se {
  opacity: 1;
}

.grid-stack:not(.grid-stack-static) > .grid-stack-item > .grid-stack-item-content {
  border-radius: 12px;
  border: 2px solid transparent;
  animation: rearrange-border-pulse 0.5s ease-out;
  transition:
    top 0.25s ease,
    right 0.25s ease,
    bottom 0.25s ease,
    left 0.25s ease,
    border-radius 0.25s ease,
    border-color 0.15s;
}

@keyframes rearrange-border-pulse {
  0% {
    border-color: transparent;
  }

  35% {
    border-color: rgba(223, 42, 76, 0.7);
  }

  100% {
    border-color: transparent;
  }
}

.grid-stack:not(.grid-stack-static) > .grid-stack-item:hover > .grid-stack-item-content {
  border-color: rgba(223, 42, 76, 0.5);
}

.grid-stack > .grid-stack-item.ui-draggable-dragging > .grid-stack-item-content {
  border-color: rgba(223, 42, 76, 0.8);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
</style>
