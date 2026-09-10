<template>
  <div>
    <section class="flex flex-col items-center py-8">
      <RouterLink to="/settings/account" class="flex flex-col items-center justify-center">
        <CuiAvatar src="avatar" :size="80" :style="{ width: '80px', height: '80px' }" />
        <div class="mt-3 text-lg font-semibold">{{ user?.username ?? 'Unknown' }}</div>
        <div class="text-sm text-muted">{{ user?.role ?? 'user' }}</div>
      </RouterLink>
    </section>

    <section v-for="section in sections" :key="section.key" class="px-4 mb-4">
      <span class="card-title">{{ $t(`navigation.group_${section.key}`) }}</span>
      <CuiList size="large" dividers>
        <CuiListItem v-for="item in section.items" :key="item.to" :to="item.to">
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
        <CuiListItem v-for="item in settingsItems" :key="item.to" :to="item.to">
          <template #prepend>
            <component :is="item.icon" class="w-5 h-5 text-muted" />
          </template>
          {{ item.label }}
          <template #append>
            <i-mdi:chevron-right class="w-5 h-5 text-muted" />
          </template>
        </CuiListItem>
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
import { bounceToCloudFrontend, isCapacitor } from '@/connection/index.js';
import { routes } from '@/router/index.js';

import type { RouteRecordRaw } from 'vue-router';

interface MenuItemDef {
  to: string;
  label: string;
  icon: any;
}

const { t } = useI18n();
const { groups: navGroups } = useNavLayout();

const authStore = useAuthStore();
const { user } = storeToRefs(authStore);

const SETTINGS_ROUTES = ['Updates', 'Settings'];

const ungroupedRoutes = computed<RouteRecordRaw[]>(() =>
  routes.filter((r) => r.meta?.navbar?.position === 'bottom' && !r.meta.navbar.group && !SETTINGS_ROUTES.includes(r.name as string) && hasPermission(r)),
);

const sections = computed(() =>
  NAV_GROUPS.map((key) => ({
    key,
    items: toItems([...(key === 'manage' ? ungroupedRoutes.value : []), ...navGroups.value[key].map((entry) => entry.route)]),
  })).filter((section) => section.items.length > 0),
);

const settingsItems = computed<MenuItemDef[]>(() => toItems(routes.filter((r) => SETTINGS_ROUTES.includes(r.name as string) && hasPermission(r))));

function toItems(routesList: RouteRecordRaw[]): MenuItemDef[] {
  return routesList
    .filter((r) => r.meta?.menu)
    .map((r) => ({
      to: r.path,
      label: t(`navigation.${(r.name as string).toLowerCase()}`),
      icon: r.meta!.menu!.icon.default,
    }));
}

function handleReload() {
  window.location.reload();
}

async function handleSwitchServer() {
  await bounceToCloudFrontend();
}
</script>
