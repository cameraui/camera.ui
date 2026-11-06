import { routes } from '@/router/index.js';

import type { RouteRecordRaw } from 'vue-router';

export function useSettingsSections() {
  const { t, locale } = useI18n();

  function label(route: RouteRecordRaw): string {
    return t(`navigation.${(route.meta!.name as string).toLowerCase()}`);
  }

  return computed(() => {
    const pages = routes.find((route) => route.name === 'Settings')!.children!.filter((route) => route.meta?.settingsBar && hasPermission(route));
    return (['personal', 'system'] as const)
      .map((key) => ({
        key,
        routes: pages.filter((route) => (route.meta!.settingsBar!.group ?? 'personal') === key).sort((a, b) => label(a).localeCompare(label(b), locale.value)),
      }))
      .filter((section) => section.routes.length > 0);
  });
}
