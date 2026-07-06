<template>
  <div>
    <section class="flex flex-col items-center py-8">
      <RouterLink to="/settings/account" class="flex flex-col items-center justify-center">
        <CuiAvatar src="avatar" :size="80" :style="{ width: '80px', height: '80px' }" />
        <div class="mt-3 text-lg font-semibold">{{ user?.username ?? 'Unknown' }}</div>
        <div class="text-sm text-muted">{{ user?.role ?? 'user' }}</div>
      </RouterLink>
    </section>

    <section class="px-4 mb-4">
      <span class="card-title">{{ $t('views.menu.section_app') }}</span>
      <CuiList size="large" dividers>
        <CuiListItem v-for="item in appItems" :key="item.to" :to="item.to">
          <template #prepend>
            <component :is="item.icon" class="w-5 h-5 text-muted" />
          </template>
          {{ item.label }}
          <template #append>
            <i-mdi:chevron-right class="w-5 h-5 text-muted" />
          </template>
        </CuiListItem>
      </CuiList>
    </section>

    <section v-if="systemItems.length" class="px-4 mb-4">
      <span class="card-title">{{ $t('views.menu.section_system') }}</span>
      <CuiList size="large" dividers>
        <CuiListItem v-for="item in systemItems" :key="item.to" :to="item.to">
          <template #prepend>
            <component :is="item.icon" class="w-5 h-5 text-muted" />
          </template>
          {{ item.label }}
          <template #append>
            <i-mdi:chevron-right class="w-5 h-5 text-muted" />
          </template>
        </CuiListItem>
      </CuiList>
    </section>

    <section class="px-4 mb-4">
      <span class="card-title">{{ $t('views.menu.section_actions') }}</span>
      <CuiList size="large" dividers>
        <CuiListItem to="/about">
          <template #prepend>
            <i-mdi:information-outline class="w-5 h-5 text-muted" />
          </template>
          {{ $t('navigation.about') }}
          <template #append>
            <i-mdi:chevron-right class="w-5 h-5 text-muted" />
          </template>
        </CuiListItem>
        <CuiListItem @click="handleReload">
          <template #prepend>
            <i-iconoir:reload-window class="w-5 h-5 text-muted" />
          </template>
          {{ $t('views.menu.reload') }}
        </CuiListItem>
        <CuiListItem v-if="isCapacitor" @click="handleSwitchServer">
          <template #prepend>
            <i-iconoir:data-transfer-both class="w-5 h-5 text-muted" />
          </template>
          {{ $t('views.menu.switch_server') }}
        </CuiListItem>
        <CuiListItem @click="() => authStore.logout()">
          <template #prepend>
            <i-tabler:power class="w-5 h-5 text-primary" />
          </template>
          <span class="text-primary">{{ $t('views.menu.logout') }}</span>
        </CuiListItem>
      </CuiList>
    </section>
  </div>
</template>

<script lang="ts" setup>
import { routes } from '@/router/index.js';

interface MenuItemDef {
  to: string;
  label: string;
  icon: any;
}

import { bounceToCloudFrontend, isCapacitor } from '@/connection/index.js';

const { t } = useI18n();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const appRouteNames = new Set(['Faces', 'Plugins', 'Settings']);

const menuRoutes = computed(() => routes.filter((r) => r.meta?.menu && r.meta.auth && hasPermission(r)));

const appItems = computed<MenuItemDef[]>(() =>
  menuRoutes.value
    .filter((r) => appRouteNames.has(r.name as string))
    .map((r) => ({
      to: r.path,
      label: t(`navigation.${(r.name as string).toLowerCase()}`),
      icon: r.meta!.menu!.icon.default,
    })),
);

const systemItems = computed<MenuItemDef[]>(() =>
  menuRoutes.value
    .filter((r) => !appRouteNames.has(r.name as string))
    .map((r) => ({
      to: r.path,
      label: t(`navigation.${(r.name as string).toLowerCase()}`),
      icon: r.meta!.menu!.icon.default,
    })),
);

function handleReload() {
  window.location.reload();
}

async function handleSwitchServer() {
  await bounceToCloudFrontend();
}
</script>
