<template>
  <div
    ref="itemRef"
    class="home-dock-item cui-tile"
    :class="{
      'home-dock-item--inline': inline,
      'home-dock-item--compact': compact,
      'home-dock-item--open': open,
      'home-dock-item--editing': editing,
      'home-dock-item--dragging': dragging,
    }"
    :style="{ '--tile-color': item.color, transform: shift && `translate(${shift.x}px, ${shift.y}px) scale(1.04)` }"
  >
    <component
      :is="editing ? 'div' : 'button'"
      v-tooltip.top="{ value: compact ? item.label : '' }"
      class="home-dock-item__main"
      v-bind="editing ? {} : { type: 'button', 'aria-expanded': open }"
      @click="editing || emit('select')"
    >
      <CuiTileIcon :icon="item.icon" :active="item.active" />
      <span class="home-dock-item__text">
        <span class="home-dock-item__label">{{ item.label }}</span>
        <span class="home-dock-item__state">{{ item.state }}</span>
      </span>
      <i-mdi:drag v-if="editing" class="home-dock-item__grip" />
    </component>

    <Button
      v-if="editing"
      rounded
      severity="secondary"
      class="home-dock-item__remove cui-icon-md"
      :aria-label="t('views.home_dashboard.dock_remove', { name: item.label })"
      @click="emit('remove')"
    >
      <template #icon>
        <i-mdi:minus />
      </template>
    </Button>
  </div>
</template>

<script setup lang="ts">
import CuiTileIcon from '@/components/CuiSensorTile/frame/CuiTileIcon.vue';
import { usePointerDrag } from '@/components/CuiSensorTile/usePointerDrag.js';

import type { CuiHomeDockItemEmits, CuiHomeDockItemProps, HomePoint } from './types.js';

const props = defineProps<CuiHomeDockItemProps>();
const emit = defineEmits<CuiHomeDockItemEmits>();

const { t } = useI18n();

const COMPACT_WIDTH = 144;

const itemRef = useTemplateRef<HTMLDivElement>('itemRef');
const shift = ref<{ x: number; y: number }>();
let grab: { x: number; y: number } | undefined;
let pointer: HomePoint | undefined;
let frame = 0;
let fromGrip = false;

const { width } = useElementSize(itemRef);

const compact = computed(() => !props.inline && width.value > 0 && width.value < COMPACT_WIDTH);

useEventListener(itemRef, 'pointerdown', (event: PointerEvent) => {
  fromGrip = event.pointerType === 'mouse' || !props.inline || !!(event.target as Element).closest('.home-dock-item__grip');
});

usePointerDrag(itemRef, {
  draggable: () => props.editing && fromGrip,
  onMove: (event, delta) => {
    const el = itemRef.value!;
    if (!grab) {
      const rect = el.getBoundingClientRect();
      grab = { x: event.clientX - delta.x - rect.left, y: event.clientY - delta.y - rect.top };
      frame = requestAnimationFrame(follow);
    }
    pointer = { clientX: event.clientX, clientY: event.clientY };
    emit('drag', pointer);
  },
  onEnd: () => {
    cancelAnimationFrame(frame);
    grab = pointer = shift.value = undefined;
    emit('drop');
  },
});

function follow() {
  const el = itemRef.value;
  const parent = el?.offsetParent;
  if (el && parent && grab && pointer) {
    const box = parent.getBoundingClientRect();
    const scroll = edgeScroll(pointer.clientX, box);
    if (scroll) {
      parent.scrollLeft += scroll;
      emit('drag', pointer);
    }
    shift.value = {
      x: pointer.clientX - grab.x - box.left - el.offsetLeft + parent.scrollLeft,
      y: pointer.clientY - grab.y - box.top - el.offsetTop + parent.scrollTop,
    };
  }
  frame = requestAnimationFrame(follow);
}

function edgeScroll(x: number, box: DOMRect): number {
  const zone = 48;
  if (x < box.left + zone) return -Math.ceil((box.left + zone - x) / 4);
  if (x > box.right - zone) return Math.ceil((x - box.right + zone) / 4);
  return 0;
}

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<style scoped>
.home-dock-item {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  border-radius: 1.375rem;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.15s ease;
}

.home-dock-item--inline {
  flex: none;
  border-radius: 9999px;
}

.home-dock-item--open {
  border-color: transparent;
  background: var(--text-color);
}

.home-dock-item--editing {
  border-style: dashed;
  touch-action: none;
  cursor: grab;
}

.home-dock-item--inline.home-dock-item--editing {
  touch-action: pan-x;
}

.home-dock-item--inline .home-dock-item__grip {
  box-sizing: content-box;
  margin: -0.625rem -0.625rem -0.625rem 0;
  padding: 0.625rem;
  touch-action: none;
}

.home-dock-item--dragging {
  z-index: 1;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.3);
  cursor: grabbing;
  transition: none;
}

.home-dock-item__main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  height: 4rem;
  padding: 0 1rem 0 0.625rem;
  border-radius: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.home-dock-item--inline .home-dock-item__main {
  height: 3.5rem;
  padding: 0 1.125rem 0 0.4375rem;
}

.home-dock-item__text {
  flex: 1;
  min-width: 0;
}

.home-dock-item--compact .home-dock-item__main {
  justify-content: center;
  padding: 0;
}

.home-dock-item--compact .home-dock-item__text,
.home-dock-item--compact .home-dock-item__grip {
  display: none;
}

.home-dock-item__main:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-dock-item__label {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-dock-item__state {
  display: block;
  font-size: 0.8125rem;
  color: var(--text-secondary-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.home-dock-item--open .home-dock-item__label,
.home-dock-item--open .home-dock-item__state {
  color: var(--p-content-background);
}

.home-dock-item__grip {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-secondary-color);
}

.home-dock-item__remove {
  position: absolute;
  top: -0.5rem;
  left: -0.5rem;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
}
</style>
