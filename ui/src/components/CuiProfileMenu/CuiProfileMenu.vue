<template>
  <div>
    <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="menuRef?.toggleMenu">
      <template #icon>
        <i-proicons:grid-dots class="w-6 h-6" />
      </template>
    </Button>

    <!-- <Button severity="secondary" text class="cui-button p-2 text-color" @click="menuRef?.toggleMenu">
      <div class="relative w-6 h-6">
        <div
          class="absolute top-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
          :class="{
            'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': menuRef?.isOpen,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full transition-all duration-100"
          :class="{
            'opacity-0 scale-0': menuRef?.isOpen,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
        <div
          class="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full transform transition-all duration-100 origin-center"
          :class="{
            'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': menuRef?.isOpen,
          }"
          :style="{
            backgroundColor: 'var(--text-color)',
          }"
        />
      </div>
    </Button> -->

    <CuiMenu
      ref="menuRef"
      :items
      :popover="{
        appendTo: 'self',
        pt: {
          root: { class: 'w-[18rem] profile-menu' },
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    />
  </div>
</template>

<script setup lang="ts">
import ReloadIcon from '~icons/iconoir/reload-window';
import PowerIcon from '~icons/tabler/power';

import { routes } from '@/router/index.js';

import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types.js';

const { t } = useI18n();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');

const profileRoutes = computed<RouteRecordRaw[]>(() => routes.filter((route) => route.meta?.menu && route.meta.auth && hasPermission(route)));
const items = computed<MenuItem[]>(() => {
  const headerItem: MenuItem = {
    label: user.value?.username,
    description: user.value?.role,
    to: '/settings/account',
    position: 'header',
    avatarProps: {
      src: 'avatar',
      size: 35,
      style: {
        width: '35px',
        height: '35px',
      },
    },
  };

  const bodyItems: MenuItem[] = [
    ...profileRoutes.value.map((route): MenuItem => ({
      label: t(`navigation.${(route.name as string).toLowerCase()}`),
      icon: route.meta!.menu!.icon.default,
      to: route.path,
    })),
    {
      label: t('components.user_menu.reload'),
      icon: ReloadIcon,
      onClick: handleReload,
    },
  ];

  const footerItem: MenuItem = {
    label: t('components.user_menu.logout'),
    icon: PowerIcon,
    position: 'footer',
    iconProps: {
      class: '!text-primary',
    },
    labelProps: {
      class: '!text-primary',
    },
    buttonProps: {
      class: 'hover:!bg-primary-500/10 active:!bg-primary-500/10 focus:!bg-primary-500/10',
    },
    onClick: authStore.logout,
  };

  return [headerItem, ...bodyItems, footerItem];
});

function handleReload() {
  window.location.reload();
}
</script>

<style>
.profile-menu {
  left: calc(env(safe-area-inset-right, 0px) + 0.5rem) !important;
  top: calc(env(safe-area-inset-top, 0px) + 3.3rem) !important;
}
</style>
