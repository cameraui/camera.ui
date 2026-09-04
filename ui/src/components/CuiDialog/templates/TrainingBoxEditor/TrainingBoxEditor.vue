<template>
  <div ref="rootRef" class="flex flex-col gap-3 h-full min-h-0">
    <div class="flex items-center justify-between gap-2 text-sm">
      <div class="min-w-0 flex items-center gap-2">
        <Tag :severity="currentStatus === 'verified' ? 'success' : 'info'" :value="$t(`views.training.status_${currentStatus}`)" class="shrink-0" />
        <span class="font-medium truncate">{{ cameraName(current.cameraId) }}</span>
        <span class="text-muted shrink-0">{{ formatRelativeTime(current.createdAt) }}</span>
      </div>
      <span class="text-muted tabular-nums shrink-0">{{ position }} / {{ totalCount }}</span>
    </div>

    <div ref="stageRef" class="stage relative w-full bg-black rounded-lg shrink-0 overflow-hidden select-none">
      <VueZoomable
        v-model:pan="stagePan"
        v-model:zoom="stageZoomLevel"
        :pan-enabled="stageZoomLevel > 1 && !drag"
        :enable-control-button="false"
        :dbl-click-enabled="false"
        :min-zoom="1"
        :max-zoom="STAGE_MAX_ZOOM"
        :selector="`[data-stage-zoom='${zoomId}']`"
        zoom-origin="pointer"
        class="absolute inset-0 flex items-center justify-center"
        :class="{ 'zoom-constraining': stageConstraining }"
        @panned="onStageZoomPan"
        @zoom="onStageZoomPan"
        @dblclick="onStageDoubleClick"
        @touchstart="onStageTouchStart"
        @touchend="onStageTouchEnd"
      >
        <div ref="frameRef" :data-stage-zoom="zoomId" class="frame relative" :style="{ '--ar-w': aspect.w, '--ar-h': aspect.h }">
          <img :src="imageUrl(current.id)" class="absolute inset-0 w-full h-full" draggable="false" @load="onImageLoad" />

          <svg
            ref="svgRef"
            class="absolute inset-0 w-full h-full touch-none"
            :class="stageZoomLevel > 1 ? 'cursor-grab' : 'cursor-crosshair'"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
          >
            <g v-for="(box, i) in boxes" :key="i">
              <rect
                :x="pct(box.x)"
                :y="pct(box.y)"
                :width="pct(box.width)"
                :height="pct(box.height)"
                :stroke="styleFor(box.label).color"
                :fill="styleFor(box.label).color"
                :fill-opacity="i === selectedIndex ? 0.22 : 0.12"
                :stroke-width="i === selectedIndex ? 3.5 : 2"
                vector-effect="non-scaling-stroke"
                class="cursor-move"
                @pointerdown.stop="startMove(i, $event)"
                @touchstart.stop
                @mousedown.stop
              />
              <g v-for="corner in corners" :key="corner" class="cursor-nwse-resize" @pointerdown.stop="startResize(i, corner, $event)" @touchstart.stop @mousedown.stop>
                <circle :cx="cornerX(box, corner)" :cy="cornerY(box, corner)" r="14" fill="transparent" />
                <circle :cx="cornerX(box, corner)" :cy="cornerY(box, corner)" r="4.5" :fill="styleFor(box.label).color" />
              </g>
            </g>
            <rect
              v-if="draft"
              :x="pct(draft.x)"
              :y="pct(draft.y)"
              :width="pct(draft.width)"
              :height="pct(draft.height)"
              :stroke="styleFor(draft.label).color"
              :fill="styleFor(draft.label).color"
              fill-opacity="0.1"
              stroke-dasharray="6 4"
              stroke-width="2"
              vector-effect="non-scaling-stroke"
            />
          </svg>

          <div
            v-for="(box, i) in boxes"
            :key="`label-${i}`"
            class="bbox-label cursor-pointer"
            :data-box-label="i"
            @pointerdown.stop
            @touchstart.stop
            @mousedown.stop
            @click.stop="openLabelMenu(i, $event)"
            :class="{
              'label-bottom': labelPlacement(box) === 'below',
              'label-inside': labelPlacement(box) === 'inside',
              'label-right': isLabelOnRight(box),
            }"
            :style="labelStyle(box)"
          >
            <component :is="styleFor(box.label).icon" class="bbox-label-icon" />
            <span class="bbox-label-text">{{ labelText(box.label) }}</span>
            <span v-if="box.text" class="bbox-label-confidence">{{ box.text }}</span>
            <span v-else-if="box.confidence < 1" class="bbox-label-confidence">{{ Math.round(box.confidence * 100) }}%</span>
          </div>
        </div>
      </VueZoomable>

      <div v-if="stageMinimapStyle" class="zoom-minimap" :style="stageMinimapBoxStyle ?? undefined">
        <div class="zoom-minimap-viewport" :style="stageMinimapStyle" />
      </div>

      <div v-if="loupe" class="loupe" :style="{ left: `${loupe.x}px`, top: `${loupe.y}px` }">
        <div
          class="loupe-content"
          :style="{ width: `${loupe.frameW}px`, height: `${loupe.frameH}px`, transform: `translate(${loupe.tx}px, ${loupe.ty}px) scale(${LOUPE_ZOOM})` }"
        >
          <img :src="imageUrl(current.id)" class="absolute inset-0 w-full h-full" draggable="false" />
          <svg class="absolute inset-0 w-full h-full">
            <rect
              v-for="(box, i) in boxes"
              :key="i"
              :x="pct(box.x)"
              :y="pct(box.y)"
              :width="pct(box.width)"
              :height="pct(box.height)"
              :stroke="styleFor(box.label).color"
              :fill="styleFor(box.label).color"
              fill-opacity="0.1"
              stroke-width="1.5"
            />
            <rect
              v-if="draft"
              :x="pct(draft.x)"
              :y="pct(draft.y)"
              :width="pct(draft.width)"
              :height="pct(draft.height)"
              :stroke="styleFor(draft.label).color"
              :fill="styleFor(draft.label).color"
              fill-opacity="0.1"
              stroke-dasharray="4 3"
              stroke-width="1.5"
            />
          </svg>
        </div>
        <div class="loupe-crosshair" />
      </div>

      <div v-if="hasPrev" class="absolute left-2 top-1/2 -translate-y-1/2 z-[5] dark-mode">
        <Button severity="secondary" rounded class="cui-icon-md opacity-60 hover:opacity-100" @click.stop="step(-1)">
          <template #icon><i-mdi:chevron-left width="100%" height="100%" /></template>
        </Button>
      </div>
      <div v-if="hasNext" class="absolute right-2 top-1/2 -translate-y-1/2 z-[5] dark-mode">
        <Button severity="secondary" rounded class="cui-icon-md opacity-60 hover:opacity-100" @click.stop="step(1)">
          <template #icon><i-mdi:chevron-right width="100%" height="100%" /></template>
        </Button>
      </div>
    </div>

    <div v-if="selectedPlateBox" class="flex items-center justify-center gap-2">
      <label class="text-muted text-sm" for="plate-text">{{ $t('components.training_editor.plate_text') }}</label>
      <InputText
        id="plate-text"
        :model-value="selectedPlateBox.text ?? ''"
        size="small"
        maxlength="12"
        class="w-40 uppercase"
        placeholder="ABC 1234"
        @update:model-value="setPlateText"
      />
    </div>

    <div class="flex items-center justify-center gap-1.5">
      <span class="text-muted text-sm text-center">{{ $t('components.training_editor.hint') }}</span>
      <Button v-if="hasFinePointer" severity="secondary" text rounded class="cui-icon-sm shrink-0" @click="showShortcuts = !showShortcuts">
        <template #icon><i-mdi:help-circle-outline class="w-4 h-4" /></template>
      </Button>
    </div>

    <div v-if="hasFinePointer && showShortcuts" class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 justify-center mx-auto text-sm text-muted">
      <span><kbd>Tab</kbd></span
      ><span>{{ $t('components.training_editor.sc_select') }}</span> <span><kbd>←↑→↓</kbd></span
      ><span>{{ $t('components.training_editor.sc_move') }}</span> <span><kbd>Shift</kbd> + <kbd>←↑→↓</kbd></span
      ><span>{{ $t('components.training_editor.sc_resize') }}</span> <span><kbd>S</kbd></span
      ><span>{{ $t('components.training_editor.sc_label') }}</span> <span><kbd>Del</kbd></span
      ><span>{{ $t('components.training_editor.sc_delete') }}</span> <span><kbd>Esc</kbd></span
      ><span>{{ $t('components.training_editor.sc_deselect') }}</span> <span><kbd>Space</kbd></span
      ><span>{{ $t('components.training_editor.sc_verify') }}</span> <span><kbd>←</kbd> / <kbd>→</kbd></span
      ><span>{{ $t('components.training_editor.sc_nav') }}</span>
    </div>

    <CuiMenu ref="labelMenuRef" :items="labelMenuItems" :popover="{ pt: { content: { class: 'p-0! rounded-xl! overflow-hidden!' } } }" />
  </div>
</template>

<script setup lang="ts">
import VueZoomable from 'vue-zoomable';
import TrashIcon from '~icons/mdi/trash-can-outline';

import { detectionStyle } from '@/common/detectionLabels';
import { formatRelativeTime, randomLetter } from '@/common/utils.js';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import { STAGE_MAX_ZOOM } from '@/composables/useStageZoom.js';
import { TRAINING_LABELS } from './types';

import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CustomDialogComponent } from '@/composables/useCuiDialog.js';
import type { DBTrainingCandidate, DBTrainingCandidateBox } from '@shared/types';
import type { CSSProperties } from 'vue';
import type { TrainingBoxEditorProps } from './types';

type Corner = 'nw' | 'ne' | 'sw' | 'se';

interface DragState {
  mode: 'draw' | 'move' | 'resize';
  index: number;
  corner?: Corner;
  startX: number;
  startY: number;
  moved: boolean;
  origin: DBTrainingCandidateBox;
}

const props = defineProps<TrainingBoxEditorProps>();

const { t, te } = useI18n();

const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];
const MIN_SIZE = 0.01;
const TAP_THRESHOLD = 0.006;
const LABEL_SPACE_PX = 26;
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 400;
const LOUPE_SIZE = 110;
const LOUPE_ZOOM = 2;
const LOUPE_OFFSET = 80;
const LOUPE_MAX_BOX_PX = 50;
const NUDGE_STEP = 0.003;
const edits = new Map<string, DBTrainingCandidateBox[]>();
const removedIds = reactive(new Set<string>());
const verifiedIds = reactive(new Set<string>());
const startIndex = Math.max(
  0,
  props.candidates.findIndex((c) => c.id === props.startId),
);

const zoomId = randomLetter();
const rootRef = useTemplateRef<HTMLElement>('rootRef');
const labelMenuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('labelMenuRef');
const stageRef = useTemplateRef<HTMLElement>('stageRef');
const frameRef = useTemplateRef<HTMLElement>('frameRef');
const svgRef = useTemplateRef<SVGSVGElement>('svgRef');
const boxes = ref<DBTrainingCandidateBox[]>(props.candidates[startIndex]?.boxes.map((b) => ({ ...b })) ?? []);
const aspect = ref({ w: 16, h: 9 });
const drag = ref<DragState | null>(null);
const draft = ref<DBTrainingCandidateBox | null>(null);
const selectedIndex = ref(-1);
const showShortcuts = ref(false);
const hasFinePointer = useMediaQuery('(any-pointer: fine)');
const loupe = ref<{ x: number; y: number; tx: number; ty: number; frameW: number; frameH: number } | null>(null);
let contentSwipe: { x: number; y: number; at: number } | null = null;
const labelMenuIndex = ref(-1);
const lastLabel = ref('person');
const index = ref(startIndex);

const {
  zoom: stageZoomLevel,
  pan: stagePan,
  constraining: stageConstraining,
  minimapStyle: stageMinimapStyle,
  minimapBoxStyle: stageMinimapBoxStyle,
  onZoomPan: onStageZoomPan,
  onDoubleClick: onStageDoubleClick,
  onTouchStart: onStageTouchStart,
  onTouchEnd: onStageTouchEnd,
  reset: resetStageZoom,
} = useStageZoom(stageRef, frameRef);

const { height: frameHeight } = useElementSize(frameRef);

const current = computed(() => props.candidates[index.value]);
const position = computed(() => props.candidates.slice(0, index.value + 1).filter((c) => !removedIds.has(c.id)).length);
const totalCount = computed(() => props.candidates.filter((c) => !removedIds.has(c.id)).length);
const hasPrev = computed(() => props.candidates.slice(0, index.value).some((c) => !removedIds.has(c.id)));
const hasNext = computed(() => props.candidates.slice(index.value + 1).some((c) => !removedIds.has(c.id)));
const currentStatus = computed(() => (verifiedIds.has(current.value.id) ? 'verified' : current.value.status));

const selectedPlateBox = computed(() => {
  const box = boxes.value[selectedIndex.value];
  return box?.label === 'license_plate' ? box : null;
});

const labelMenuItems = computed<MenuItem[]>(() => [
  ...TRAINING_LABELS.map((label) => ({
    key: label,
    label: labelText(label),
    icon: detectionStyle(label).icon,
    iconProps: { style: { color: detectionStyle(label).color } },
    active: boxes.value[labelMenuIndex.value]?.label === label,
    onClick: () => setLabel(label),
  })),
  {
    key: 'remove',
    label: t('components.training_editor.remove_box'),
    icon: TrashIcon,
    iconProps: { class: 'text-red-500' },
    labelProps: { class: 'text-red-500' },
    onClick: () => removeBox(labelMenuIndex.value),
  },
]);

const labelPlacement = computed(() => (box: DBTrainingCandidateBox): 'above' | 'below' | 'inside' => {
  const height = frameHeight.value || 360;
  if (box.y * height >= LABEL_SPACE_PX) return 'above';
  if (height - (box.y + box.height) * height >= LABEL_SPACE_PX) return 'below';
  return 'inside';
});

const isLabelOnRight = computed(() => (box: DBTrainingCandidateBox): boolean => {
  return box.x > 0.7;
});

function labelText(label: string): string {
  const key = `components.training_editor.labels.${label}`;
  return te(key) ? t(key) : label;
}

function styleFor(label: string) {
  return detectionStyle(label);
}

function pct(value: number): string {
  return `${value * 100}%`;
}

function cornerX(box: DBTrainingCandidateBox, corner: Corner): string {
  return pct(corner === 'nw' || corner === 'sw' ? box.x : box.x + box.width);
}

function cornerY(box: DBTrainingCandidateBox, corner: Corner): string {
  return pct(corner === 'nw' || corner === 'ne' ? box.y : box.y + box.height);
}

function labelStyle(box: DBTrainingCandidateBox): CSSProperties {
  const style: CSSProperties = { backgroundColor: styleFor(box.label).color };
  if (isLabelOnRight.value(box)) style.right = pct(1 - box.x - box.width);
  else style.left = pct(box.x);
  const placement = labelPlacement.value(box);
  if (placement === 'above') style.top = pct(box.y);
  else if (placement === 'below') style.top = pct(box.y + box.height);
  else style.top = `calc(${pct(box.y)} + 2px)`;
  return style;
}

function onImageLoad(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (img.naturalWidth && img.naturalHeight) aspect.value = { w: img.naturalWidth, h: img.naturalHeight };
}

function pointerPos(event: PointerEvent): { x: number; y: number } {
  const rect = svgRef.value?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  };
}

function dragStart(event: PointerEvent, state: Omit<DragState, 'moved'>): void {
  drag.value = { ...state, moved: false };
  svgRef.value?.setPointerCapture(event.pointerId);
}

function onPointerDown(event: PointerEvent): void {
  if (stageZoomLevel.value > 1) return;
  const { x, y } = pointerPos(event);
  dragStart(event, { mode: 'draw', index: -1, startX: x, startY: y, origin: { label: lastLabel.value, confidence: 1, x, y, width: 0, height: 0 } });
}

function startMove(index: number, event: PointerEvent): void {
  const { x, y } = pointerPos(event);
  selectedIndex.value = index;
  dragStart(event, { mode: 'move', index, startX: x, startY: y, origin: { ...boxes.value[index] } });
}

function startResize(index: number, corner: Corner, event: PointerEvent): void {
  const { x, y } = pointerPos(event);
  selectedIndex.value = index;
  dragStart(event, { mode: 'resize', index, corner, startX: x, startY: y, origin: { ...boxes.value[index] } });
}

function onPointerMove(event: PointerEvent): void {
  const state = drag.value;
  if (!state) return;
  const { x, y } = pointerPos(event);
  if (Math.hypot(x - state.startX, y - state.startY) > TAP_THRESHOLD) state.moved = true;
  if (event.pointerType === 'touch' && state.moved) {
    if (loupeWanted(state)) updateLoupe(event);
    else loupe.value = null;
  }

  if (state.mode === 'draw') {
    if (state.moved) {
      const rect = normalizedRect(state.startX, state.startY, x, y);
      draft.value = rect.width >= MIN_SIZE && rect.height >= MIN_SIZE ? { label: lastLabel.value, confidence: 1, ...rect } : null;
    }
    return;
  }

  if (state.mode === 'move') {
    if (!state.moved) return;
    const box = boxes.value[state.index];
    box.x = Math.min(1 - state.origin.width, Math.max(0, state.origin.x + (x - state.startX)));
    box.y = Math.min(1 - state.origin.height, Math.max(0, state.origin.y + (y - state.startY)));
    return;
  }

  const anchorX = state.corner === 'nw' || state.corner === 'sw' ? state.origin.x + state.origin.width : state.origin.x;
  const anchorY = state.corner === 'nw' || state.corner === 'ne' ? state.origin.y + state.origin.height : state.origin.y;
  Object.assign(boxes.value[state.index], normalizedRect(anchorX, anchorY, x, y));
}

function onPointerUp(event: PointerEvent): void {
  const state = drag.value;
  drag.value = null;
  loupe.value = null;
  if (!state) return;

  if (state.mode === 'draw') {
    if (draft.value && draft.value.width >= MIN_SIZE && draft.value.height >= MIN_SIZE) {
      boxes.value.push({ ...draft.value });
      selectedIndex.value = boxes.value.length - 1;
    } else if (!state.moved) {
      selectedIndex.value = -1;
    }
    draft.value = null;
    return;
  }

  if (state.mode === 'move' && !state.moved) openLabelMenu(state.index, event);
}

function loupeWanted(state: DragState): boolean {
  const rect = svgRef.value?.getBoundingClientRect();
  if (!rect || rect.width === 0) return false;
  const box = state.mode === 'draw' ? draft.value : boxes.value[state.index];
  if (!box) return true;
  return Math.max(box.width * rect.width, box.height * rect.height) <= LOUPE_MAX_BOX_PX;
}

function updateLoupe(event: PointerEvent): void {
  const frameRect = frameRef.value?.getBoundingClientRect();
  const stageRect = stageRef.value?.getBoundingClientRect();
  if (!frameRect || !stageRect || frameRect.width === 0 || frameRect.height === 0) {
    loupe.value = null;
    return;
  }
  const half = LOUPE_SIZE / 2;
  const x = Math.min(Math.max(event.clientX - stageRect.left, half + 4), stageRect.width - half - 4);
  let y = event.clientY - stageRect.top - LOUPE_OFFSET;
  if (y - half < 4) y = event.clientY - stageRect.top + LOUPE_OFFSET;
  loupe.value = {
    x,
    y,
    frameW: frameRect.width,
    frameH: frameRect.height,
    tx: half - (event.clientX - frameRect.left) * LOUPE_ZOOM,
    ty: half - (event.clientY - frameRect.top) * LOUPE_ZOOM,
  };
}

function swipeAllowed(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement || target instanceof SVGElement ? target : null;
  if (!el) return false;
  if (stageRef.value?.contains(el) || el.closest('.p-dialog-header') || el.closest('button')) return false;
  const footer = rootRef.value?.closest('.p-dialog-content')?.lastElementChild;
  return !(footer && footer !== rootRef.value && footer.contains(el));
}

function onContentTouchStart(event: TouchEvent): void {
  contentSwipe = null;
  if (event.touches.length !== 1 || !swipeAllowed(event.target)) return;
  const touch = event.touches[0];
  contentSwipe = { x: touch.clientX, y: touch.clientY, at: Date.now() };
}

function onContentTouchEnd(event: TouchEvent): void {
  const start = contentSwipe;
  contentSwipe = null;
  if (!start || event.changedTouches.length !== 1) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (Date.now() - start.at <= SWIPE_MAX_MS && Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 2 * Math.abs(dy)) {
    step(dx < 0 ? 1 : -1);
  }
}

function normalizedRect(x1: number, y1: number, x2: number, y2: number): Pick<DBTrainingCandidateBox, 'x' | 'y' | 'width' | 'height'> {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return { x, y, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

function openLabelMenu(boxIndex: number, event: Event): void {
  labelMenuIndex.value = boxIndex;
  const anchor = frameRef.value?.querySelector(`[data-box-label="${boxIndex}"]`);
  labelMenuRef.value?.toggleMenu(event, anchor ?? undefined);
}

function setLabel(label: string): void {
  const box = boxes.value[labelMenuIndex.value];
  if (!box) return;
  box.label = label;
  box.confidence = 1;
  lastLabel.value = label;
}

function setPlateText(value: string | undefined): void {
  const box = boxes.value[selectedIndex.value];
  if (!box) return;
  const text = (value ?? '').toUpperCase().replace(/[^A-Z0-9ÄÖÜ\- ]/g, '');
  box.text = text || undefined;
}

function removeBox(boxIndex: number): void {
  if (boxIndex < 0 || boxIndex >= boxes.value.length) return;
  boxes.value.splice(boxIndex, 1);
  selectedIndex.value = -1;
}

function goTo(next: number, stashEdits = true): void {
  if (next < 0 || next >= props.candidates.length) return;
  if (stashEdits) {
    edits.set(
      current.value.id,
      boxes.value.map((b) => ({ ...b })),
    );
  }
  index.value = next;
  boxes.value = (edits.get(current.value.id) ?? current.value.boxes).map((b) => ({ ...b }));
  draft.value = null;
  drag.value = null;
  loupe.value = null;
  selectedIndex.value = -1;
  labelMenuIndex.value = -1;
  labelMenuRef.value?.hide();
  resetStageZoom();
}

async function save(status: DBTrainingCandidate['status']): Promise<null | undefined> {
  await props.onSave(
    current.value.id,
    boxes.value.map((b) => ({ ...b })),
    status,
  );
  edits.set(
    current.value.id,
    boxes.value.map((b) => ({ ...b })),
  );
  if (status === 'verified') verifiedIds.add(current.value.id);
  return step(1, false) ? null : undefined;
}

function step(direction: 1 | -1, stash = true): boolean {
  let next = index.value + direction;
  while (next >= 0 && next < props.candidates.length && removedIds.has(props.candidates[next].id)) next += direction;
  if (next < 0 || next >= props.candidates.length) return false;
  goTo(next, stash);
  return true;
}

async function removeCurrent(): Promise<null | undefined> {
  const id = current.value.id;
  await props.onDelete(id);
  edits.delete(id);
  removedIds.add(id);
  return step(1, false) || step(-1, false) ? null : undefined;
}

function preloadNeighbors(): void {
  for (const direction of [1, -1] as const) {
    let next = index.value + direction;
    while (next >= 0 && next < props.candidates.length && removedIds.has(props.candidates[next].id)) next += direction;
    const neighbor = props.candidates[next];
    if (neighbor) new Image().src = props.imageUrl(neighbor.id);
  }
}

function selectNextBox(direction: 1 | -1): void {
  if (!boxes.value.length) return;
  selectedIndex.value = (selectedIndex.value + direction + boxes.value.length) % boxes.value.length;
}

function cycleLabel(direction: 1 | -1): void {
  const box = boxes.value[selectedIndex.value];
  if (!box) return;
  const labels = TRAINING_LABELS as readonly string[];
  const next = labels[(labels.indexOf(box.label) + direction + labels.length) % labels.length];
  box.label = next;
  box.confidence = 1;
  lastLabel.value = next;
}

function nudgeSelected(dx: number, dy: number, resize: boolean): void {
  const box = boxes.value[selectedIndex.value];
  if (!box) return;
  if (resize) {
    box.width = Math.min(1 - box.x, Math.max(MIN_SIZE, box.width + dx));
    box.height = Math.min(1 - box.y, Math.max(MIN_SIZE, box.height + dy));
  } else {
    box.x = Math.min(1 - box.width, Math.max(0, box.x + dx));
    box.y = Math.min(1 - box.height, Math.max(0, box.y + dy));
  }
}

watch(index, preloadNeighbors, { immediate: true });

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if ((event.target as HTMLElement | null)?.closest?.('input, textarea')) return;

  const arrows: Record<string, [number, number]> = {
    ArrowLeft: [-NUDGE_STEP, 0],
    ArrowRight: [NUDGE_STEP, 0],
    ArrowUp: [0, -NUDGE_STEP],
    ArrowDown: [0, NUDGE_STEP],
  };

  if (arrows[event.key]) {
    if (selectedIndex.value >= 0) {
      event.preventDefault();
      const [dx, dy] = arrows[event.key];
      nudgeSelected(dx, dy, event.shiftKey);
    } else if (!event.repeat && event.key === 'ArrowLeft') step(-1);
    else if (!event.repeat && event.key === 'ArrowRight') step(1);
    return;
  }

  if (event.repeat) return;
  if (event.key === 'Tab') {
    event.preventDefault();
    selectNextBox(event.shiftKey ? -1 : 1);
  } else if (event.key === 'Escape') {
    selectedIndex.value = -1;
    labelMenuRef.value?.hide();
  } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIndex.value >= 0) {
    removeBox(selectedIndex.value);
  } else if (event.key === 's' || event.key === 'S') {
    cycleLabel(event.shiftKey ? -1 : 1);
  } else if (event.key === ' ' && !labelMenuRef.value?.isOpen) {
    event.preventDefault();
    save('verified');
  }
});

useEventListener(() => (rootRef.value?.closest('.p-dialog-content') as HTMLElement | null) ?? undefined, 'touchstart', onContentTouchStart, {
  passive: true,
});
useEventListener(() => (rootRef.value?.closest('.p-dialog-content') as HTMLElement | null) ?? undefined, 'touchend', onContentTouchEnd, {
  passive: true,
});

defineExpose<CustomDialogComponent>({
  onConfirm: () => save('verified'),
  onCancel: () => removeCurrent(),
});
</script>

<style scoped>
.stage {
  height: clamp(240px, 52vh, 620px);
  container-type: size;
}

.frame {
  width: min(100cqw, calc(100cqh * var(--ar-w) / var(--ar-h)));
  height: min(100cqh, calc(100cqw * var(--ar-h) / var(--ar-w)));
}

.zoom-constraining :deep(> *) {
  transition: transform 0.15s ease-out !important;
}

.zoom-minimap {
  position: absolute;
  right: 10px;
  bottom: 10px;
  width: 80px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  z-index: 5;
  pointer-events: none;
  overflow: hidden;
}

.zoom-minimap-viewport {
  position: absolute;
  border: 1.5px solid rgba(255, 255, 255, 0.7);
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.12);
}

.loupe {
  position: absolute;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
  background-color: #000;
  background-repeat: no-repeat;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  z-index: 6;
  pointer-events: none;
  overflow: hidden;
}

.loupe-content {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.loupe-crosshair {
  position: absolute;
  inset: 0;
}

kbd {
  padding: 1px 6px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  font-family: monospace;
  font-size: 12px;
}

.loupe-crosshair::before,
.loupe-crosshair::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.85);
}

.loupe-crosshair::before {
  left: 50%;
  top: calc(50% - 9px);
  width: 1.5px;
  height: 18px;
  transform: translateX(-50%);
}

.loupe-crosshair::after {
  top: 50%;
  left: calc(50% - 9px);
  height: 1.5px;
  width: 18px;
  transform: translateY(-50%);
}

.bbox-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  color: white;
  font-size: 12px;
  font-weight: bold;
  white-space: nowrap;
  max-width: 100%;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  border-bottom-left-radius: 0;
  transform: translateY(-100%);
}

.bbox-label.label-bottom {
  transform: translateY(0);
  border-radius: 0;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  border-top-right-radius: 6px;
  border-top-left-radius: 0;
}

.bbox-label.label-right {
  flex-direction: row-reverse;
  border-top-left-radius: 6px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 6px;
}

.bbox-label.label-inside {
  transform: translateY(0);
  border-radius: 6px;
}

.bbox-label-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.bbox-label-text {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.bbox-label-confidence {
  opacity: 0.9;
}
</style>
