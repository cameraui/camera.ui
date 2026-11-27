<template>
  <div>
    <Button severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="menuRef?.toggleMenu">
      <template #icon>
        <i-proicons:grid-dots class="w-6 h-6" />
      </template>
    </Button>

    <CuiMenu
      ref="menuRef"
      :items
      :popover="{
        appendTo: 'self',
        pt: {
          root: { class: 'w-[18rem] profile-menu' },
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
  left: calc(var(--safe-area-inset-left) + 0.5rem) !important;
  top: calc(var(--safe-area-inset-top) + 3.3rem) !important;
}
</style>
