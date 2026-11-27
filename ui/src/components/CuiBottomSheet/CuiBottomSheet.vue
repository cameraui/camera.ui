<template>
  <Teleport to="body">
    <Transition name="cui-bottom-sheet-backdrop" @after-leave="unstack">
      <div
        v-if="modelValue && isFirstSheet"
        ref="backdropRef"
        class="cui-bottom-sheet-backdrop"
        :class="{ 'cui-bottom-sheet-backdrop--lowered': lowered }"
        :style="backdropStyle"
        @pointerdown="onBackdropPress"
        @click="onBackdropClick"
      />
    </Transition>

    <Transition name="cui-bottom-sheet" @after-leave="unstack">
      <div
        v-if="modelValue"
        ref="sheetRef"
        class="cui-bottom-sheet min-w-0"
        :class="{
          'cui-bottom-sheet--stacked-behind': isStackedBehind,
          'cui-bottom-sheet--stacked-on-top': isStackedOnTop,
        }"
        :style="sheetStyle"
        @touchstart="onTouchStart"
        @touchend="onTouchEnd"
      >
        <div v-if="showHandle" ref="handleRef" class="cui-bottom-sheet__handle" :class="{ 'cui-bottom-sheet__handle--hidden': isStackedBehind }" @mousedown="onMouseDown">
          <div class="cui-bottom-sheet__handle-bar" />
        </div>

        <div v-if="title || subtitle || $slots.header || showCloseButton" class="cui-bottom-sheet__header" :class="{ 'cui-bottom-sheet__header--centered': centered }">
          <slot name="header">
            <div v-if="title || subtitle" class="cui-bottom-sheet__header-text">
              <span v-if="title" class="cui-bottom-sheet__title">{{ title }}</span>
              <span v-if="subtitle" class="cui-bottom-sheet__subtitle">{{ subtitle }}</span>
            </div>
          </slot>
          <Button v-if="showCloseButton" severity="secondary" text rounded class="cui-bottom-sheet__close" @click="close">
            <template #icon>
              <i-mdi:close />
            </template>
          </Button>
        </div>

        <div class="cui-bottom-sheet__content">
          <slot />
        </div>

        <div v-if="$slots.footer" class="cui-bottom-sheet__footer">
          <slot name="footer" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ZIndex } from '@openuxkit/utils/zindex';

import { randomLetter } from '@/common/utils.js';

import type { CuiBottomSheetEmits, CuiBottomSheetProps } from './types.js';

const props = withDefaults(defineProps<CuiBottomSheetProps>(), {
  title: undefined,
  subtitle: undefined,
  centered: false,
  showHandle: true,
  closeOnBackdrop: true,
  height: 'auto',
  maxHeight: undefined,
  minHeight: '200px',
  draggable: true,
  dismissThreshold: 0.3,
  lowered: false,
});

const emit = defineEmits<CuiBottomSheetEmits>();

const {
  register,
  unregister,
  updateMeasuredHeight,
  isTopmost,
  closeTopmost,
  getStackTransform,
  topmostMeasuredHeight,
  setDragProgress,
  dragProgress,
  lockBodyScroll,
  unlockBodyScroll,
  stackSize,
} = useCuiBottomSheet();

const { modelValue, height: heightProp, maxHeight, minHeight, draggable, dismissThreshold, closeOnBackdrop, lowered } = toRefs(props);
const { shortBreakpoint } = useSharedCuiBreakpoint();

const Z_INDEX_BASE = 1000;
const LOWERED_OFFSET = '100%';
const HEIGHT_TRANSITION_MS = 300;

const sheetId = ref(randomLetter());
const stackPosition = ref(-1);
const sheetRef = useTemplateRef('sheetRef');
const backdropRef = useTemplateRef('backdropRef');
const handleRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragStartY = ref(0);
const dragCurrentY = ref(0);
const sheetHeight = ref(0);

const { height: elementHeight } = useElementSize(sheetRef);

const showCloseButton = computed(() => !draggable.value);
const sheetMaxHeight = computed(() => maxHeight.value ?? (shortBreakpoint.value ? '85vh' : '70vh'));

const isTopSheet = computed(() => isTopmost(sheetId.value));

const isFirstSheet = computed(() => stackPosition.value === 0);

const dragOffset = computed(() => {
  if (!isDragging.value) return 0;
  const offset = dragCurrentY.value - dragStartY.value;
  return Math.max(0, offset);
});

const backdropStyle = computed(() => ({
  '--backdrop-opacity': 1 - dragProgress.value,
}));

const sheetStyle = computed<Record<string, string | number | undefined>>(() => {
  const currentStackSize = stackSize.value;
  const _dragProgress = dragProgress.value; // dependency for reactivity

  const { scaleX, topReserve, brightness, visible } = getStackTransform(stackPosition.value);
  const dragY = isDragging.value && dragOffset.value > 0 ? dragOffset.value : 0;

  const isTopmostSheet = stackPosition.value === currentStackSize - 1;
  const topMeasuredHeight = topmostMeasuredHeight.value;

  let sheetHeightValue: string;
  let maxHeightValue: string;

  const newMaxHeight = sheetMaxHeight.value;

  if (currentStackSize > 1 && !isTopmostSheet && topMeasuredHeight > 0) {
    const peekHeight = 16;
    sheetHeightValue = `calc(${topMeasuredHeight}px + ${peekHeight}px + var(--safe-area-inset-bottom))`;
    maxHeightValue = sheetHeightValue;
  } else {
    const effectiveMaxHeight = `calc(${newMaxHeight} - ${topReserve}px)`;

    const explicitHeight = heightProp.value !== 'auto' ? heightProp.value : undefined;
    const isFullHeight = newMaxHeight === '100%' || newMaxHeight === '100vh';
    sheetHeightValue = explicitHeight ?? (isFullHeight ? effectiveMaxHeight : 'auto');
    maxHeightValue = effectiveMaxHeight;
  }

  const dragging = isDragging.value;

  return {
    '--sheet-height': sheetHeightValue,
    '--sheet-max-height': maxHeightValue,
    '--sheet-min-height': minHeight.value,
    '--sheet-scale-x': scaleX,
    '--sheet-brightness': brightness,
    // a direct transform skips the css variable recalc on every frame
    transform: dragging ? `translateX(-50%) translateY(${dragY}px) scaleX(${scaleX})` : undefined,
    '--sheet-translate-y': dragging ? undefined : lowered.value ? LOWERED_OFFSET : `${dragY}px`,
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? undefined : 'none',
    transition: dragging ? 'none' : undefined,
    boxShadow: dragging ? 'none' : undefined,
  };
});

const isStackedBehind = computed(() => stackSize.value > 1 && !isTopSheet.value);

const isStackedOnTop = computed(() => stackPosition.value > 0);

let rafId = 0;
let backdropPressed = false;
let heightTimer: ReturnType<typeof setTimeout> | undefined;
const stacked = new Set<HTMLElement>();

function close() {
  emit('update:modelValue', false);
  emit('close');
}

function stack(element: HTMLElement): void {
  ZIndex.set('modal', element, Z_INDEX_BASE);
  stacked.add(element);
}

function restack(backdrop: HTMLElement | null, sheet: HTMLElement | null): void {
  if (backdrop && !stacked.has(backdrop)) {
    stack(backdrop);
    if (sheet && stacked.has(sheet)) unstack(sheet);
  }
  if (sheet && !stacked.has(sheet)) stack(sheet);
}

function unstack(element: Element): void {
  ZIndex.clear(element as HTMLElement);
  stacked.delete(element as HTMLElement);
}

function onBackdropPress() {
  backdropPressed = true;
}

function onBackdropClick() {
  if (!backdropPressed) return;
  backdropPressed = false;
  if (closeOnBackdrop.value) {
    closeTopmost();
  }
}

function onTouchStart(e: TouchEvent) {
  if (!draggable.value) return;

  const target = e.target as HTMLElement;
  const isHandle = handleRef.value?.contains(target);

  if (!isHandle) return;

  isDragging.value = true;
  dragStartY.value = e.touches[0].clientY;
  dragCurrentY.value = e.touches[0].clientY;
  sheetHeight.value = sheetRef.value?.offsetHeight || 0;

  // passive: false, or iOS ignores preventDefault()
  sheetRef.value?.addEventListener('touchmove', onTouchMove, { passive: false });
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value) return;
  const clientY = e.touches[0].clientY;

  if (clientY - dragStartY.value > 0) {
    e.preventDefault();
  }

  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    dragCurrentY.value = clientY;

    if (isTopSheet.value && sheetHeight.value > 0) {
      const progress = Math.min(1, dragOffset.value / sheetHeight.value);
      setDragProgress(progress);
    }
  });
}

function onTouchEnd() {
  if (!isDragging.value) return;

  sheetRef.value?.removeEventListener('touchmove', onTouchMove);
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  const threshold = sheetHeight.value * dismissThreshold.value;
  if (dragOffset.value > threshold) {
    close();
  }

  setDragProgress(0);

  isDragging.value = false;
  dragStartY.value = 0;
  dragCurrentY.value = 0;
}

function onMouseDown(e: MouseEvent) {
  if (!draggable.value) return;

  isDragging.value = true;
  dragStartY.value = e.clientY;
  dragCurrentY.value = e.clientY;
  sheetHeight.value = sheetRef.value?.offsetHeight || 0;

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  dragCurrentY.value = e.clientY;

  // progress over the full height, not the dismiss threshold, keeps the effect gradual
  if (isTopSheet.value && sheetHeight.value > 0) {
    const progress = Math.min(1, dragOffset.value / sheetHeight.value);
    setDragProgress(progress);
  }
}

function onMouseUp() {
  if (!isDragging.value) return;

  const threshold = sheetHeight.value * dismissThreshold.value;
  if (dragOffset.value > threshold) {
    close();
  }

  setDragProgress(0);

  isDragging.value = false;
  dragStartY.value = 0;
  dragCurrentY.value = 0;

  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && modelValue.value && isTopSheet.value) {
    close();
  }
}

watch(elementHeight, (height) => {
  if (height > 0) {
    updateMeasuredHeight(sheetId.value, height);
  }
});

watch(modelValue, (open) => {
  if (open) {
    stackPosition.value = register(sheetId.value, close, sheetMaxHeight.value);
  } else {
    unregister(sheetId.value);
    stackPosition.value = -1;
  }
});

watch(
  () => modelValue.value && !lowered.value,
  (locked) => (locked ? lockBodyScroll() : unlockBodyScroll()),
);

watch([backdropRef, sheetRef], ([backdrop, sheet]) => restack(backdrop, sheet), { flush: 'post' });

watch(
  () => sheetStyle.value['--sheet-height'],
  async (next, previous) => {
    const sheet = sheetRef.value;
    if (!sheet || isDragging.value || (next !== 'auto' && previous !== 'auto')) return;
    const from = sheet.offsetHeight;
    await nextTick();
    if (!sheet.isConnected) return;
    clearTimeout(heightTimer);
    sheet.style.transitionProperty = 'transform, opacity';
    sheet.style.height = '';
    sheet.style.maxHeight = '';
    const to = sheet.offsetHeight;
    sheet.style.maxHeight = 'none';
    sheet.style.height = `${from}px`;
    sheet.getBoundingClientRect();
    sheet.style.transitionProperty = '';
    sheet.style.height = `${to}px`;
    heightTimer = setTimeout(() => {
      sheet.style.height = '';
      sheet.style.maxHeight = '';
    }, HEIGHT_TRANSITION_MS);
  },
);

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  clearTimeout(heightTimer);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  sheetRef.value?.removeEventListener('touchmove', onTouchMove);
  stacked.forEach(unstack);

  if (modelValue.value) unregister(sheetId.value);
  if (modelValue.value && !lowered.value) unlockBodyScroll();
});
</script>

<style scoped>
.cui-bottom-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: var(--p-mask-background, rgba(0, 0, 0, 0.6));
  opacity: var(--backdrop-opacity, 1);
  transition: opacity 0.2s ease;
}

.cui-bottom-sheet-backdrop--lowered {
  opacity: 0;
  pointer-events: none;
}

.cui-bottom-sheet {
  --sheet-scale-x: 1;
  --sheet-translate-y: 0px;
  --sheet-brightness: 1;

  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(var(--sheet-translate-y)) scaleX(var(--sheet-scale-x));
  transform-origin: bottom center;
  width: calc(100% - 24px);
  max-width: 500px;
  height: var(--sheet-height);
  max-height: var(--sheet-max-height);
  min-height: var(--sheet-min-height);
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: var(--border-radius-xl) var(--border-radius-xl) 0 0;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: var(--safe-area-inset-bottom);
  will-change: transform;
  transition:
    transform 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    opacity 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    height 0.3s cubic-bezier(0.32, 0.72, 0, 1),
    max-height 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.cui-bottom-sheet--stacked-behind {
  border-radius: var(--border-radius-xl);
  pointer-events: none;
  filter: brightness(var(--sheet-brightness));
}

.cui-bottom-sheet--stacked-on-top {
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.08);
}

.cui-bottom-sheet__handle {
  display: flex;
  justify-content: center;
  padding: 12px 0 4px;
  cursor: grab;
  touch-action: none;
  opacity: 1;
  transition: opacity 0.2s ease;
}

.cui-bottom-sheet__handle--hidden {
  opacity: 0;
  pointer-events: none;
}

.cui-bottom-sheet__handle:active {
  cursor: grabbing;
}

.cui-bottom-sheet__handle-bar {
  width: 36px;
  height: 4px;
  background: var(--text-passive-color);
  border-radius: 9999px;
  transition: background 0.2s ease;
}

.cui-bottom-sheet__handle:hover .cui-bottom-sheet__handle-bar {
  background: var(--text-muted-color);
}

.cui-bottom-sheet__header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
}

.cui-bottom-sheet__header-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cui-bottom-sheet__title {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--text-color);
  line-height: 1.3;
}

.cui-bottom-sheet__subtitle {
  font-size: 0.8125rem;
  color: var(--text-muted-color);
  line-height: 1.3;
}

.cui-bottom-sheet__header--centered {
  justify-content: center;
}

.cui-bottom-sheet__header--centered .cui-bottom-sheet__header-text {
  align-items: center;
  text-align: center;
}

.cui-bottom-sheet__close {
  flex-shrink: 0;
  width: 32px !important;
  height: 32px !important;
}

.cui-bottom-sheet__content {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
  overscroll-behavior: contain;
}

.cui-bottom-sheet__footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-top: none;
  background: transparent;
}

.cui-bottom-sheet__footer :deep(.p-button) {
  flex: 1;
}

.cui-bottom-sheet__footer :deep(.p-button.p-button-secondary) {
  background: transparent;
  border-color: transparent;
}

.cui-bottom-sheet__footer :deep(.p-button.p-button-secondary:hover) {
  background: var(--card-inner-background);
}

.cui-bottom-sheet-backdrop-enter-active,
.cui-bottom-sheet-backdrop-leave-active {
  transition: opacity 0.15s ease-out;
}

.cui-bottom-sheet-backdrop-enter-from,
.cui-bottom-sheet-backdrop-leave-to {
  opacity: 0;
}

.cui-bottom-sheet-enter-active,
.cui-bottom-sheet-leave-active {
  transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.cui-bottom-sheet-enter-from,
.cui-bottom-sheet-leave-to {
  transform: translateX(-50%) translateY(100%) scaleX(1) !important;
}

@media (max-width: 480px) {
  .cui-bottom-sheet {
    width: 100%;
    max-width: none;
    border-radius: 16px 16px 0 0;
    border-left: none;
    border-right: none;
  }
}
</style>
