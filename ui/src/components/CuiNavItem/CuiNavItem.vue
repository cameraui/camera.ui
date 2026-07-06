<template>
  <RouterLink v-slot="{ isActive }" :to>
    <Button
      v-tooltip="{ value: showTooltip && !expanded ? label : '', pt: { root: { class: 'dark-mode' } } }"
      text
      severity="secondary"
      class="cui-button navitem-button w-full h-full flex items-center relative"
      :class="{
        'dark-mode': darkMode,
        '!text-white navitem-active': (isActive || isItemActive) && !avatar,
        'hover:!text-color active:!text-color focus:!text-color': !isActive && !isItemActive,
        'navitem-inactive': !isActive && !isItemActive,
      }"
      :style="activeColor && (isActive || isItemActive) ? { '--navitem-active-color': activeColor } : undefined"
      fluid
      v-bind="buttonProps"
    >
      <template #default>
        <div
          class="flex items-center justify-center h-full"
          :class="{
            'absolute left-[14px]': !bottomBar,
          }"
        >
          <div v-if="avatar" class="shrink-0 relative left-[-9px]">
            <CuiAvatar
              :src="avatar"
              :size="avatarSize"
              :style="{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
              }"
            />
          </div>
          <div v-else-if="(icon && !isActive && !isItemActive) || !activeIcon" class="shrink-0">
            <icon
              :class="iconClass"
              :style="{
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                color: (isActive || isItemActive) && activeIconColor ? activeIconColor : undefined,
              }"
            />
          </div>
          <div v-else-if="activeIcon && (isActive || isItemActive)" class="shrink-0">
            <activeIcon
              :style="{
                width: `${iconSize}px`,
                height: `${iconSize}px`,
                color: activeIconColor,
              }"
            />
          </div>
        </div>

        <Transition name="fade">
          <div v-if="expanded" class="overflow-hidden flex-1 ml-10">
            <div class="flex flex-row items-center justify-between">
              <div class="text-start flex-1">
                <div
                  class="text-sm max-w-100 truncate font-semibold"
                  :class="[
                    labelClass,
                    {
                      'text-color font-bold': avatar,
                    },
                  ]"
                >
                  {{ label }}
                </div>
                <div v-if="description" class="text-xs text-muted">{{ description }}</div>
              </div>

              <Button v-if="showLogout" text rounded class="dark-mode cui-icon-md" @click.stop.prevent="onLogout">
                <template #icon>
                  <i-tabler:power width="100%" height="100%" />
                </template>
              </Button>
            </div>
          </div>
        </Transition>
      </template>
    </Button>
  </RouterLink>
</template>

<script setup lang="ts">
import type { CuiNavItemProps } from './types.js';

const props = withDefaults(defineProps<CuiNavItemProps>(), {
  avatarSize: 24,
  iconSize: 24,
});

const route = useRoute();

const authStore = useAuthStore();

const {
  icon,
  iconSize,
  iconClass,
  activeIcon,
  avatarSize,
  avatar,
  labelClass,
  label,
  description,
  expanded,
  to,
  showLogout,
  darkMode,
  buttonProps,
  showTooltip,
  fallbackActivePath,
  activeColor,
  activeIconColor,
  bottomBar,
} = toRefs(props);

const isItemActive = computed(() => {
  return route.path === to.value || (to.value !== '/' && (route.path.startsWith(to.value + '/') || route.path.startsWith((fallbackActivePath.value ?? to.value) + '/')));
});

function onLogout() {
  authStore.logout();
}
</script>

<style scoped>
/* .p-button-text.p-button-secondary:not(:disabled):not(.navitem-active):hover {
  border-top: 1px solid var(--p-surface-800);
  background: var(--p-surface-900) !important;
}

.p-button-text.p-button-secondary:not(:disabled):not(.navitem-active):active {
  border-top: 1px solid var(--p-surface-700);
  background: var(--p-surface-800) !important;
} */

.navitem-active {
  background: var(--navitem-active-color, var(--p-button-text-primary-active-background));
  border-color: transparent;
  border-top: 1px solid var(--navitem-active-color, var(--p-button-outlined-danger-hover-background));
}
</style>
