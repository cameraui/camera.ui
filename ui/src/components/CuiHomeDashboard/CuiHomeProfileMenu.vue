<template>
  <Button
    v-if="floating"
    severity="secondary"
    rounded
    class="shadow-lg m-1"
    :label="named ? name : undefined"
    aria-haspopup="menu"
    :aria-label="label"
    @click="menuRef?.toggleMenu($event)"
  >
    <template #icon>
      <i-mdi:view-dashboard-outline />
    </template>
  </Button>
  <button
    v-else
    v-tooltip.bottom="label"
    type="button"
    class="home-profile"
    :class="{ 'home-profile--named': named }"
    aria-haspopup="menu"
    :aria-label="label"
    @click="menuRef?.toggleMenu($event)"
  >
    <i-mdi:view-dashboard-outline class="home-profile__icon" />
    <template v-if="named">
      <span class="truncate">{{ name }}</span>
      <i-mdi:pin-outline v-if="pinned" class="home-profile__pin" />
    </template>
  </button>
  <CuiMenu ref="menuRef" :items dividers="sections" max-height="60vh" />
</template>

<script setup lang="ts">
import type { CuiHomeProfileMenuProps } from './types.js';

const props = defineProps<CuiHomeProfileMenuProps>();

const { t } = useI18n();

const menuRef = useTemplateRef('menuRef');

const label = computed(() => t(props.pinned ? 'views.home_dashboard.profile_switch_pinned' : 'views.home_dashboard.profile_switch', { name: props.name }));
</script>

<style scoped>
.home-profile {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-width: 2.75rem;
  max-width: 14rem;
  height: 2.75rem;
  border-radius: 9999px;
  border: 1px solid var(--border-color);
  background: var(--p-content-background);
  color: var(--text-color);
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.home-profile--named {
  padding: 0 1rem;
}

.home-profile:hover {
  background: var(--p-content-hover-background);
}

.home-profile:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 2px;
}

.home-profile__icon {
  flex-shrink: 0;
  width: 1.25rem;
  height: 1.25rem;
}

.home-profile__pin {
  flex-shrink: 0;
  width: 1rem;
  height: 1rem;
  color: var(--text-secondary-color);
}
</style>
