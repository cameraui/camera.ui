<template>
  <div ref="boxRef">
    <div :ref="drag" :style="collect.style">
      <Button
        :disabled="isDropped"
        fluid
        severity="secondary"
        class="cui-rounded-corner dark-mode shadow-sm items-center justify-normal"
        :style="{ cursor: isDropped ? 'not-allowed' : 'grab' }"
      >
        <template #default>
          <i-mdi:drag-vertical size="20" class="text-muted mr-2" />
          <CuiCameraSnapshot :camera width="110px" class="cui-rounded-corner shadow-md overflow-hidden" :class="{ 'opacity-30': isDropped }" />
          <span class="text-sm text-muted truncate">{{ camera.name }}</span>
        </template>
      </Button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { useDrag } from 'vue3-dnd';

import type { ViewDragProps } from './types.js';

const props = defineProps<ViewDragProps>();

const { camera, canDrag } = toRefs(props);

const boxRef = useTemplateRef('boxRef');
const dragPreview = shallowRef<HTMLElement | null>(null);
const offsetX = ref(0);
const offsetY = ref(0);
const isDraggingActive = ref(false);

const { x: mouseX, y: mouseY, sourceType } = useSharedMouse();

const [collect, drag] = useDrag(() => ({
  type: 'camera-sidebar',
  options: { dropEffect: 'copy' },
  item: camera.value,
  canDrag: canDrag.value,
  collect: (monitor) => ({
    style: { opacity: monitor.isDragging() ? 0.4 : 1 },
    isDragging: monitor.isDragging(),
  }),
}));

const isDragging = computed(() => collect.value.isDragging);
const isDraggingTouch = computed(() => isDragging.value && sourceType.value === 'touch');

function removeDragPreview(): void {
  if (dragPreview.value && document.body.contains(dragPreview.value)) {
    document.body.removeChild(dragPreview.value);
  }
  dragPreview.value = null;
}

function createDragPreview(): void {
  removeDragPreview();
  if (!boxRef.value) return;
  const clone = boxRef.value.cloneNode(true) as HTMLElement;
  const boxRect = boxRef.value.getBoundingClientRect();
  clone.style.width = `${boxRect.width}px`;
  clone.style.height = `${boxRect.height}px`;
  clone.classList.add('drag-preview');
  clone.style.position = 'fixed';
  clone.style.left = `${mouseX.value - offsetX.value}px`;
  clone.style.top = `${mouseY.value - offsetY.value}px`;
  document.body.appendChild(clone);
  dragPreview.value = clone;
}

function endDrag(): void {
  isDraggingActive.value = false;
  removeDragPreview();
}

function startDrag(): void {
  endDrag();
  isDraggingActive.value = true;
  const rect = boxRef.value?.getBoundingClientRect();
  if (!rect) return;
  offsetX.value = mouseX.value - rect.left;
  offsetY.value = mouseY.value - rect.top;
  createDragPreview();
}

function updateDragPreview(): void {
  if (!dragPreview.value || !isDraggingActive.value) return;
  requestAnimationFrame(() => {
    if (!dragPreview.value) return;
    dragPreview.value.style.left = `${mouseX.value - offsetX.value}px`;
    dragPreview.value.style.top = `${mouseY.value - offsetY.value}px`;
  });
}

watch(isDraggingTouch, (v) => (v ? startDrag() : endDrag()));
watch([mouseX, mouseY], () => updateDragPreview(), { flush: 'sync' });

onBeforeUnmount(() => endDrag());
</script>

<style scoped>
.drag-preview {
  position: fixed !important;
  pointer-events: none !important;
  z-index: 9999 !important;
  opacity: 0.8 !important;
  border-radius: 0.75rem !important;
  overflow: hidden !important;
  transform: none !important;
  transition: none !important;
  will-change: left, top !important;
  cursor: grabbing !important;
}
</style>
