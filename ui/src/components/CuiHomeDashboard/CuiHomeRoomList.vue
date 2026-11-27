<template>
  <div ref="listRef" class="home-rooms">
    <TransitionGroup tag="ul" name="home-rooms" class="flex flex-col gap-1">
      <li
        v-for="tab in pages"
        :key="tab.id"
        :data-room="tab.id"
        class="home-rooms__row"
        :class="{ 'home-rooms__row--lifted': tab.id === sorting, 'home-rooms__row--hidden': tab.hidden }"
      >
        <span class="home-rooms__grip" :aria-label="t('views.home_dashboard.room_move', { name: tab.name })" @pointerdown="grab($event, tab.id)" @touchstart.stop>
          <i-mdi:drag />
        </span>
        <span class="home-rooms__name">{{ tab.name }}</span>
        <Button
          text
          rounded
          severity="secondary"
          class="cui-icon-lg"
          :aria-label="t(tab.hidden ? 'views.home_dashboard.room_show' : 'views.home_dashboard.room_hide', { name: tab.name })"
          :aria-pressed="tab.hidden"
          @click="emit('hide', tab.id, !tab.hidden)"
        >
          <template #icon>
            <i-mdi:eye-off-outline v-if="tab.hidden" />
            <i-mdi:eye-outline v-else />
          </template>
        </Button>
      </li>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import type { CuiHomeRoomListEmits, CuiHomeRoomListProps } from './types.js';

const props = defineProps<CuiHomeRoomListProps>();
const emit = defineEmits<CuiHomeRoomListEmits>();

const { t } = useI18n();

const listRef = useTemplateRef<HTMLDivElement>('listRef');
const sorting = ref<string>();

function grab(event: PointerEvent, id: string) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  sorting.value = id;
  navigator.vibrate?.(10);
  window.addEventListener('pointermove', follow);
  window.addEventListener('pointerup', drop);
  window.addEventListener('pointercancel', drop);
}

function follow(event: PointerEvent) {
  const list = listRef.value;
  const id = sorting.value;
  if (!list || !id) return;
  const y = event.clientY - list.getBoundingClientRect().top;
  const over = Array.from(list.querySelectorAll<HTMLElement>('[data-room]')).find((row) => y >= row.offsetTop && y < row.offsetTop + row.offsetHeight);
  const target = over?.dataset.room;
  if (!target || target === id) return;
  const ids = props.pages.map((tab) => tab.id).filter((entry) => entry !== id);
  ids.splice(
    props.pages.findIndex((tab) => tab.id === target),
    0,
    id,
  );
  emit('reorder', ids);
}

function drop() {
  sorting.value = undefined;
  window.removeEventListener('pointermove', follow);
  window.removeEventListener('pointerup', drop);
  window.removeEventListener('pointercancel', drop);
}

onBeforeUnmount(drop);
</script>

<style scoped>
.home-rooms {
  position: relative;
}

.home-rooms__row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.25rem 0.25rem 0;
  border-radius: 1.125rem;
  background: var(--p-content-background);
  transition:
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

.home-rooms__row--lifted {
  position: relative;
  z-index: 1;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
}

.home-rooms__row--hidden .home-rooms__name {
  opacity: 0.5;
}

.home-rooms__grip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 2.75rem;
  height: 2.75rem;
  color: var(--text-secondary-color);
  cursor: grab;
  touch-action: none;
}

.home-rooms__grip svg {
  width: 1.25rem;
  height: 1.25rem;
}

.home-rooms__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-color);
}

.home-rooms-move {
  transition: transform 0.15s ease;
}
</style>
