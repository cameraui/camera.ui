<template>
  <div ref="boxRef" class="camera-wrapper">
    <div
      :ref="setRef"
      class="rounded-xl overflow-hidden border-[1px] border-color relative"
      :class="{
        'cursor-move': canDrag && !isDragging,
      }"
      :style="{
        opacity: isDragging ? 0 : 1,
        viewTransitionName: viewTransition ? `camera-card-${camera.name.replace(/[^a-zA-Z0-9-_]/g, '-')}` : undefined,
      }"
      :draggable="canDrag"
    >
      <div v-if="camera.disabled" class="absolute inset-0 z-2 flex items-center justify-center bg-black/80 pointer-events-none">
        <i-fluent:video-off-32-filled class="w-8 h-8 text-white/60" />
      </div>

      <div v-if="selectionMode" class="absolute top-3 left-3 z-4 pointer-events-none">
        <div
          class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
          :class="selected ? 'bg-primary border-primary' : 'bg-black/40 border-white/80'"
        >
          <i-mdi:check v-if="selected" class="w-4 h-4 text-white" />
        </div>
      </div>

      <div class="w-full h-[60px] p-4 absolute bottom-0 z-3 flex items-center gap-1 justify-between pointer-events-none">
        <span class="text-xs font-semibold p-2 bg-black/60 rounded-full text-white flex items-center gap-1">
          {{ camera.name }}
          <i-fluent:video-off-32-filled v-if="camera.disabled" class="w-3 h-3 text-red-400" />
          <i-solar:moon-sleep-bold v-else-if="camera.detectionSettings?.snooze" class="w-3 h-3 text-amber-400" />
        </span>

        <template v-if="!selectionMode">
          <template v-if="!camera.disabled">
            <Button
              v-tooltip.top="{ value: $t('components.player.refresh_snapshot') }"
              severity="secondary"
              rounded
              class="dark-mode cui-icon-md pointer-events-auto ml-auto"
              @click.stop="$emit('refresh-snapshot')"
            >
              <template #icon>
                <i-material-symbols:refresh-rounded width="100%" height="100%" />
              </template>
            </Button>

            <Button
              v-if="hasPermission(undefined, 'admin')"
              v-tooltip.top="{ value: $t('components.player.log') }"
              severity="secondary"
              rounded
              class="dark-mode cui-icon-md pointer-events-auto"
              @click.stop="$emit('open-console')"
            >
              <template #icon>
                <i-icon-park-outline:terminal width="100%" height="100%" />
              </template>
            </Button>
          </template>

          <Button
            v-if="hasPermission(undefined, 'admin')"
            v-tooltip.top="{ value: $t('components.player.settings') }"
            rounded
            severity="secondary"
            class="dark-mode cui-icon-md pointer-events-auto"
            :class="{ 'ml-auto': camera.disabled }"
            @click.stop="$emit('open-settings')"
          >
            <template #icon>
              <i-mdi:cog width="100%" height="100%" />
            </template>
          </Button>
        </template>
      </div>

      <CuiCameraSnapshot :ref="snapshotRef" :camera show-timestamp class="cursor-pointer" @click="$emit('click')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDrag, useDrop } from 'vue3-dnd';

import type { CuiDraggableCameraCardEmits, CuiDraggableCameraCardProps, DragItem } from './types.js';

const props = defineProps<CuiDraggableCameraCardProps>();

defineEmits<CuiDraggableCameraCardEmits>();

const { x: mouseX, y: mouseY, sourceType } = useSharedMouse();

const { camera, noDrag, viewTransition } = toRefs(props);

const SWAP_COOLDOWN = 300;

const boxRef = useTemplateRef('boxRef');
const card = shallowRef<HTMLDivElement>();
const dragPreview = shallowRef<HTMLElement | null>(null);
const offsetX = ref(0);
const offsetY = ref(0);
const isDraggingActive = ref(false);

let lastSwapTarget: string | null = null;
let lastSwapTime = 0;

const canDrag = computed(() => !noDrag.value);
const originalIndex = computed(() => props.findCard(camera.value._id).index);

const [collect, drag] = useDrag(() => ({
  type: 'camera-card',
  canDrag() {
    return canDrag.value;
  },
  item: () => {
    lastSwapTarget = null;
    lastSwapTime = 0;
    return { id: camera.value._id, originalIndex: originalIndex.value };
  },
  collect: (monitor) => ({
    isDragging: monitor.isDragging(),
  }),
  end: (item, monitor) => {
    const { id: droppedId, originalIndex } = item as DragItem;
    const didDrop = monitor.didDrop();
    // If dropped outside valid target, revert to original position
    if (!didDrop) {
      props.moveCard(droppedId, originalIndex);
    }
  },
}));

const [, drop] = useDrop(() => ({
  accept: 'camera-card',
  hover({ id: draggedId }: DragItem) {
    if (draggedId !== camera.value._id) {
      const now = Date.now();

      // Prevent rapid back-and-forth swapping
      if (lastSwapTarget === camera.value._id && now - lastSwapTime < SWAP_COOLDOWN) {
        return;
      }

      const { index: overIndex } = props.findCard(camera.value._id);
      const { index: draggedIndex } = props.findCard(draggedId);

      // Only swap if positions are actually different
      if (draggedIndex !== overIndex) {
        lastSwapTarget = camera.value._id;
        lastSwapTime = now;
        props.moveCard(draggedId, overIndex);
      }
    }
  },
}));

const isDragging = computed(() => collect.value.isDragging);
const isDraggingTouch = computed(() => isDragging.value && sourceType.value === 'touch');

function startDrag() {
  endDrag();

  isDraggingActive.value = true;

  const rect = boxRef.value?.getBoundingClientRect();
  if (!rect) return;

  offsetX.value = mouseX.value - rect.left;
  offsetY.value = mouseY.value - rect.top;

  createDragPreview();
}

function endDrag() {
  isDraggingActive.value = false;
  removeDragPreview();
  offsetX.value = 0;
  offsetY.value = 0;
}

function createDragPreview() {
  removeDragPreview();

  if (!boxRef.value) return;

  const clone = boxRef.value.cloneNode(true) as HTMLElement;
  const boxRect = boxRef.value.getBoundingClientRect();
  clone.style.width = `${boxRect.width}px`;
  clone.style.height = `${boxRect.height}px`;
  clone.classList.add('drag-preview');
  document.body.appendChild(clone);
  dragPreview.value = clone;
}

function removeDragPreview() {
  if (dragPreview.value && document.body.contains(dragPreview.value)) {
    document.body.removeChild(dragPreview.value);
  }

  dragPreview.value = null;
}

function updateDragPreview() {
  if (!dragPreview.value || !isDraggingActive.value) return;

  requestAnimationFrame(() => {
    if (!dragPreview.value) return;

    const newLeft = mouseX.value - offsetX.value;
    const newTop = mouseY.value - offsetY.value;

    dragPreview.value.style.left = `${newLeft}px`;
    dragPreview.value.style.top = `${newTop}px`;
  });
}

function setRef(el: any) {
  card.value = drag(drop(el));
}

watch(isDraggingTouch, (newValue) => {
  if (newValue) {
    startDrag();
  } else {
    endDrag();
  }
});

watch(
  [mouseX, mouseY],
  () => {
    updateDragPreview();
  },
  { flush: 'sync' },
);

onBeforeUnmount(() => {
  endDrag();
});
</script>

<style scoped>
.camera-wrapper {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

.drag-preview {
  position: fixed !important;
  pointer-events: none !important;
  z-index: 9999 !important;
  opacity: 0.8 !important;
  transform: none !important;
  transition: none !important;
  will-change: left, top !important;
  cursor: grabbing !important;
}
</style>
