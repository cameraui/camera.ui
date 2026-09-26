<template>
  <div>
    <template v-for="section in sections" :key="section.key">
      <span class="card-title">{{ $t(`views.settings.section_${section.key}`) }}</span>
      <CuiList size="large" dividers class="!h-auto mb-4 last:mb-0">
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
    </template>
  </div>
</template>

<script setup lang="ts">
import { routes } from '@/router/index.js';

const { t } = useI18n();

const items = computed(() =>
  routes
    .find((route) => route.name === 'Settings')!
    .children!.filter((route) => route.meta?.settingsBar && hasPermission(route))
    .map((route) => ({
      to: `/settings/${route.path}`,
      label: t(`navigation.${(route.meta!.name as string).toLowerCase()}`),
      icon: route.meta!.settingsBar!.icon.default,
      group: route.meta!.settingsBar!.group ?? 'personal',
    })),
);

const sections = computed(() =>
  (['personal', 'system'] as const).map((key) => ({ key, items: items.value.filter((item) => item.group === key) })).filter((section) => section.items.length > 0),
);
</script>
