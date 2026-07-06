<template>
  <div v-if="instanceStore.isMultiInstance">
    <Button v-if="smBreakpoint" severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="menuRef?.toggleMenu">
      <template #icon>
        <i-bx:server class="w-6 h-6" />
      </template>
    </Button>

    <Button v-else severity="secondary" text class="cui-button p-2 text-color non-draggable-region" @click="menuRef?.toggleMenu">
      <template #default>
        <i-bx:server class="w-5 h-5 shrink-0 pointer-events-none" />
        <span class="text-sm font-medium truncate max-w-40 pointer-events-none">{{ instanceStore.activeInstance?.name ?? 'Local' }}</span>
        <i-mdi:chevron-down v-if="!menuRef?.isOpen" class="w-4 h-4 opacity-60 shrink-0 pointer-events-none" />
        <i-mdi:chevron-up v-else-if="menuRef?.isOpen" class="w-4 h-4 opacity-60 shrink-0 pointer-events-none" />
      </template>
    </Button>

    <CuiMenu
      ref="menuRef"
      :items
      :popover="{
        appendTo: 'body',
        pt: {
          root: { class: 'w-[18rem]' },
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
      @show="onMenuShow"
      dividers="sections"
    />
  </div>
</template>

<script setup lang="ts">
import GoBackIcon from '~icons/mdi/arrow-left';
import SettingsIcon from '~icons/mdi/cog';

import type CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import type { MenuItem } from '@/components/CuiMenu/types';

const { t } = useI18n();
const { smBreakpoint } = useSharedCuiBreakpoint();

const instanceStore = useInstanceStore();

const OFFLINE_BADGE_PROPS = { style: 'background: color-mix(in srgb,var(--p-red-500),transparent 84%); color: var(--p-red-400);' };

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const instanceStatuses = reactive<Record<string, 'checking' | 'online' | 'offline'>>({});
let statusAbort: AbortController | null = null;

const items = computed<MenuItem[]>(() => {
  const active = instanceStore.activeInstance;
  const showGoBack = !instanceStore.isHomeActive || instanceStore.redirectInfo;

  const headerItem: MenuItem = {
    label: active.name,
    position: 'header',
    active: true,
  };

  const remoteItems: MenuItem[] = instanceStore.favoriteInstances
    .filter((i) => i.id !== instanceStore.activeId)
    .map((instance): MenuItem => {
      const status = instanceStatuses[instance.id];
      const isChecking = instance.hasCredentials && status === 'checking';
      const isOffline = instance.hasCredentials && status === 'offline';

      let badge: string | undefined;
      let badgeProps: Record<string, string> | undefined;

      if (isOffline) {
        badge = 'Offline';
        badgeProps = OFFLINE_BADGE_PROPS;
      }

      return {
        label: instance.name,
        badge,
        badgeProps,
        loading: isChecking,
        disabled: isChecking || isOffline,
        onClick: () => instanceStore.switchInstance(instance.id),
      };
    });

  const goBackItem: MenuItem[] = showGoBack
    ? [
        {
          label: t('components.instance_switcher.go_back'),
          icon: GoBackIcon,
          position: 'footer',
          // If we landed here via cross-origin URL handoff (`redirectInfo`
          // set), "home" lives on a different Origin → full-page nav back.
          // Otherwise an in-SPA switch to the local home suffices.
          onClick: () => {
            const info = instanceStore.redirectInfo;
            if (info) {
              window.location.href = info.sourceUrl;
            } else {
              instanceStore.switchInstance(null);
            }
          },
        },
      ]
    : [];

  const footerItem: MenuItem = {
    label: t('components.instance_switcher.manage'),
    icon: SettingsIcon,
    position: 'footer',
    to: '/instances',
  };

  return [headerItem, ...remoteItems, ...goBackItem, footerItem];
});

function onMenuShow() {
  statusAbort?.abort();
  statusAbort = new AbortController();
  const { signal } = statusAbort;

  const targets = instanceStore.favoriteInstances.filter((i) => i.id !== instanceStore.activeId && i.hasCredentials);

  for (const inst of targets) {
    instanceStatuses[inst.id] = 'checking';
  }

  for (const inst of targets) {
    instanceStore
      .probeInstance(inst.id, signal)
      .then((reachable) => {
        if (!signal.aborted) instanceStatuses[inst.id] = reachable ? 'online' : 'offline';
      })
      .catch(() => {
        if (!signal.aborted) instanceStatuses[inst.id] = 'offline';
      });
  }
}
</script>
