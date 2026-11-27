<template>
  <button
    type="button"
    class="home-room-menu"
    aria-haspopup="menu"
    :aria-label="t('views.home_dashboard.room_switch', { name: current })"
    @click="menuRef?.toggleMenu($event)"
  >
    <span class="truncate">{{ current }}</span>
    <i-mdi:chevron-down class="home-room-menu__chevron" />
  </button>
  <CuiMenu ref="menuRef" :items max-height="60vh" />

  <CuiBottomSheet v-if="editing" v-model="arranging" :title="t('views.home_dashboard.tab_rooms')">
    <div class="flex flex-col gap-3">
      <span class="text-xs text-muted px-2">{{ t('views.home_dashboard.rooms_hint') }}</span>
      <CuiHomeRoomList :pages="rooms" @reorder="emit('reorder', $event)" @hide="(id, hidden) => emit('hide', id, hidden)" />
    </div>
  </CuiBottomSheet>
</template>

<script setup lang="ts">
import PencilIcon from '~icons/mdi/pencil-outline';

import CuiHomeRoomList from './CuiHomeRoomList.vue';
import { HOME_PAGE } from './home.js';

import type { MenuItem } from '../CuiMenu/types.js';
import type { CuiHomeRoomListEmits, CuiHomeRoomMenuProps } from './types.js';

const props = defineProps<CuiHomeRoomMenuProps>();
const emit = defineEmits<CuiHomeRoomListEmits>();
const page = defineModel<string>('page', { required: true });

const { t } = useI18n();

const menuRef = useTemplateRef('menuRef');
const arranging = ref(false);

const current = computed(() => props.pages.find((tab) => tab.id === page.value)?.name ?? '');
const rooms = computed(() => props.pages.filter((tab) => tab.id !== HOME_PAGE));
const items = computed<MenuItem[]>(() => [
  ...props.pages.map((tab) => ({
    key: tab.id,
    label: tab.name,
    description: tab.hidden ? t('views.home_dashboard.room_hidden') : undefined,
    active: tab.id === page.value,
    onClick: () => (page.value = tab.id),
  })),
  ...(props.editing
    ? [{ key: 'arrange', label: t('views.home_dashboard.rooms_arrange'), icon: PencilIcon, position: 'footer' as const, onClick: () => (arranging.value = true) }]
    : []),
]);
</script>

<style scoped>
.home-room-menu {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  max-width: 100%;
  padding: 0.5rem 0.625rem;
  border-radius: 999px;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.home-room-menu:active {
  background: var(--p-content-hover-background);
}

.home-room-menu__chevron {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--text-secondary-color);
}
</style>
