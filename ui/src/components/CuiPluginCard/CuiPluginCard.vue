<template>
  <div
    :style="{
      height: `${PLUGIN_CARD_SIZE.HEIGHT}px`,
    }"
  >
    <Card class="cui-card" :pt="{ body: { class: 'justify-between h-full' } }">
      <template #content>
        <div class="flex flex-col h-full">
          <div class="flex items-center w-full gap-4">
            <div class="w-16 h-16 relative rounded-full flex-shrink-0 border-2 border-color">
              <Badge class="absolute right-0 bottom-0 min-w-6 w-6 h-6 rounded-full card-background overflow-hidden p-0 border-4 z-1">
                <template #default>
                  <CuiPythonIcon v-if="plugin?.isPython" class="w-[24px]" />
                  <CuiGoIcon v-else-if="plugin?.isGo" class="w-[24px] bg-white" />
                  <CuiJavascriptIcon v-else class="w-[24px]" />
                </template>
              </Badge>
              <CuiImage :src="pluginLogo" alt="Plugin icon" class="block rounded-full overflow-hidden w-full h-full" image-container-class="w-full h-full" />
            </div>

            <RouterLink :to="`/plugins/${plugin.pluginName}`" class="flex flex-col items-start justify-center min-w-0 flex-grow">
              <div class="flex gap-1 items-center min-w-0 w-full">
                <h3 class="text-xl font-semibold truncate">{{ plugin.displayName || 'Plugin Name' }}</h3>
                <i-icon-park-solid:up-c
                  v-if="pluginUpdate?.updateAvailable"
                  v-tooltip="{ value: $t('components.form.tooltip.update_available') }"
                  class="text-green-500"
                />
              </div>
            </RouterLink>

            <ToggleSwitch :model-value="state" class="ml-auto flex-shrink-0" pt:handle:class="bg-white" :disabled="isLoading" @change="togglePlugin" />
          </div>

          <p v-tooltip.bottom="{ value: plugin.description }" class="text-sm text-muted my-4 line-clamp-2">
            {{ plugin.description }}
          </p>
        </div>
      </template>

      <template #footer>
        <div class="flex items-center space-x-1">
          <Button severity="secondary" rounded class="cui-button text-xs p-1 font-bold gap-0" @click="$router.absUrl(plugin.links?.homepage)">
            <span>v{{ plugin.installedVersion || plugin.latestVersion }}</span>
            <i-gg:external class="mb-[1px] ml-1" />
          </Button>

          <Button
            v-if="plugin.restartRequired"
            v-tooltip.top="{ value: $t('components.plugin_card.restart_required') }"
            severity="warn"
            text
            rounded
            class="cui-icon-md"
            :disabled="isLoading"
            @click="openDialog('restart')"
          >
            <template #icon>
              <RestartIcon width="100%" height="100%" />
            </template>
          </Button>

          <div class="ml-auto"></div>

          <Badge
            v-tooltip.top="{ value: $t(`components.plugin_card.status_${pluginsSocket.status.value}`) }"
            class="min-w-3 w-3 h-3 mr-3"
            :style="{
              background: pluginsSocket.statusColor.value,
            }"
          ></Badge>

          <Button v-tooltip.top="{ value: $t('components.form.tooltip.console') }" severity="secondary" text rounded class="cui-icon-md" @click="openDialog('console')">
            <template #icon>
              <i-icon-park-outline:terminal width="100%" height="100%" />
            </template>
          </Button>

          <CuiPluginOAuthButton v-if="isOAuthCapable" :plugin-name="plugin.pluginName" :route-to="isNvr ? '/settings/recordings' : undefined" />

          <Button
            v-if="isNvr"
            v-tooltip.top="{ value: $t('components.form.tooltip.nvr_settings') }"
            severity="secondary"
            text
            rounded
            class="cui-icon-md"
            @click="$router.push('/settings/recordings')"
          >
            <template #icon>
              <i-mdi:cog width="100%" height="100%" />
            </template>
          </Button>

          <Button
            v-tooltip.top="{ value: pluginUpdate?.updateAvailable ? $t('components.form.tooltip.update_available') : '' }"
            severity="secondary"
            text
            rounded
            class="cui-icon-md"
            :disabled="isLoading"
            @click="menuRef?.toggleMenu"
          >
            <template #icon>
              <div class="relative w-6 h-6">
                <div
                  class="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                  :class="{
                    'w-4 h-[2px] rotate-45 top-1/2 -translate-y-1/2 rounded-none': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
                <div
                  class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full transition-all duration-100 bg-current"
                  :class="{
                    'opacity-0 scale-0': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
                <div
                  class="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transform transition-all duration-100 origin-center bg-current"
                  :class="{
                    'w-4 h-[2px] -rotate-45 bottom-1/2 translate-y-1/2 rounded-none': menuRef?.isOpen,
                    'bg-primary-500': pluginUpdate?.updateAvailable,
                  }"
                />
              </div>
            </template>
          </Button>
        </div>
      </template>
    </Card>

    <CuiMenu
      ref="menuRef"
      :items
      :popover="{
        pt: {
          content: {
            class: 'p-0! rounded-xl! overflow-hidden!',
          },
        },
      }"
    ></CuiMenu>
  </div>
</template>

<script setup lang="ts">
import { hasInterface, PluginInterface } from '@camera.ui/sdk';
import { PLUGIN_STATUS } from '@shared/types';
import StopIcon from '~icons/carbon/stop-filled';
import RestartIcon from '~icons/iconamoon/restart-bold';
import TrashIcon from '~icons/iconamoon/trash-fill';
import UpdateIcon from '~icons/material-symbols/deployed-code-update';
import SettingsIcon from '~icons/mdi/cog';
import PlayIcon from '~icons/solar/play-bold';
import VersionsIcon from '~icons/stash/version-solid';

import { PluginsQuery } from '@/api/routes/plugins.js';
import { asyncComponent } from '@/common/asyncComponent.js';
import CuiMenu from '@/components/CuiMenu/CuiMenu.vue';
import CuiPluginOAuthButton from './CuiPluginOAuthButton.vue';
import { PLUGIN_CARD_SIZE } from './types.js';

import type { PluginConsoleProps } from '@/components/CuiDialog/templates/PluginConsole/types.js';
import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CuiPluginCardProps } from './types.js';

const PluginConsoleDialog = asyncComponent(() => import('@/components/CuiDialog/templates/PluginConsole/PluginConsole.vue'));
const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));

const pluginsQuery = new PluginsQuery();

const props = defineProps<CuiPluginCardProps>();

const route = useRoute();
const dialog = useCuiDialog();
const { t } = useI18n();

const pluginsSocket = usePluginsSocket(props.plugin.pluginName);

const { plugin } = toRefs(props);

const { data: pluginUpdate } = pluginsQuery.getPluginUpdateQuery(plugin.value.pluginName);
const { data: pluginLogo } = pluginsQuery.getPluginLogoQuery(plugin.value.pluginName);
const { mutate: enablePlugin, isPending: enableLoading } = pluginsQuery.enablePluginQuery();
const { mutate: disablePlugin, isPending: disableLoading } = pluginsQuery.disablePluginQuery();
const { mutate: startPlugin, isPending: startLoading } = pluginsQuery.startPluginQuery();
const { mutate: stopPlugin, isPending: stopLoading } = pluginsQuery.stopPluginQuery();
const { mutate: restartPlugin, isPending: restartLoading } = pluginsQuery.restartPluginQuery();

const menuRef = useTemplateRef<InstanceType<typeof CuiMenu>>('menuRef');
const state = ref(!plugin.value.disabled);

const isLoading = computed(() => enableLoading.value || disableLoading.value || restartLoading.value || startLoading.value || stopLoading.value);

const isPluginStopped = computed(
  () =>
    pluginsSocket.status.value === PLUGIN_STATUS.STOPPED ||
    pluginsSocket.status.value === PLUGIN_STATUS.DISABLED ||
    pluginsSocket.status.value === PLUGIN_STATUS.ERROR ||
    pluginsSocket.status.value === PLUGIN_STATUS.UNKNOWN,
);

const isNvr = plugin.value.contract && hasInterface(plugin.value.contract, PluginInterface.NVR);
const isOAuthCapable = plugin.value.contract && hasInterface(plugin.value.contract, PluginInterface.OAuthCapable);

const items = computed<MenuItem[]>(() => {
  const menuItems: MenuItem[] = [
    {
      label: t('components.plugin_card.update'),
      icon: UpdateIcon,
      hide: !pluginUpdate.value?.updateAvailable,
      buttonProps: {
        disabled: isLoading.value,
        severity: 'primary',
      },
      iconProps: {
        class: 'text-primary',
      },
      labelProps: {
        class: 'text-primary',
      },
      onClick: () => {
        openDialog('install');
      },
    },
    {
      label: t('components.plugin_card.settings'),
      icon: SettingsIcon,
      to: `/plugins/${plugin.value.pluginName}`,
    },
    {
      label: t('components.plugin_card.select_version'),
      icon: VersionsIcon,
      hide: plugin.value.private,
      buttonProps: {
        disabled: isLoading.value,
      },
      onClick: () => {
        openDialog('versions');
      },
    },
    {
      label: isPluginStopped.value ? t('components.plugin_card.start') : t('components.plugin_card.stop'),
      icon: isPluginStopped.value ? PlayIcon : StopIcon,
      hide: plugin.value.disabled,
      buttonProps: {
        disabled: isLoading.value,
      },
      onClick: () => {
        if (isPluginStopped.value) {
          startPlugin({ pluginName: plugin.value.pluginName });
        } else {
          stopPlugin({ pluginName: plugin.value.pluginName });
        }
      },
    },
    {
      label: t('components.plugin_card.restart'),
      icon: RestartIcon,
      hide: isPluginStopped.value,
      buttonProps: {
        disabled: isLoading.value,
      },
      onClick: () => {
        openDialog('restart');
      },
    },
    {
      label: t('components.plugin_card.uninstall'),
      icon: TrashIcon,
      iconProps: {
        class: 'text-red-500',
      },
      labelProps: {
        class: 'text-red-500',
      },
      buttonProps: {
        disabled: isLoading.value,
        severity: 'danger',
      },
      onClick: () => {
        openDialog('uninstall');
      },
    },
  ];

  if (route.path === `/plugins/${plugin.value.pluginName}`) {
    menuItems.splice(1, 1);
  }

  return menuItems;
});

function togglePlugin() {
  if (!state.value) {
    enablePlugin(
      { pluginName: plugin.value.pluginName },
      {
        onError: () => {
          state.value = false;
        },
        onSuccess: () => {
          state.value = true;
        },
      },
    );
  } else {
    disablePlugin(
      { pluginName: plugin.value.pluginName },
      {
        onError: () => {
          state.value = true;
        },
        onSuccess: () => {
          state.value = false;
        },
      },
    );
  }
}

function openDialog(type: 'console' | 'restart' | 'uninstall' | 'versions' | 'install') {
  switch (type) {
    case 'console':
      dialog.openComponentDialog<PluginConsoleProps>(PluginConsoleDialog, {
        data: {
          title: t('components.dialog.title.log'),
          confirmText: t('components.form.button.download'),
          loading: isLoading,
          stayActive: true,
          contentProps: {
            plugin: unref(plugin),
          },
          dialogContentClass: 'not-md:px-0 h-full md:h-[50vh]',
        },
      });
      break;
    case 'versions':
    case 'install':
      dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
        data: {
          title: t('components.dialog.title.install_version'),
          confirmText: type === 'install' ? t('components.form.button.restart') : t('components.form.button.install'),
          loading: isLoading,
          contentProps: {
            target: unref(plugin),
            installVersion: type === 'install' ? pluginUpdate.value?.latestVersion : undefined,
          },
        },
      });
      break;
    case 'restart':
      dialog.openTextDialog({
        data: {
          title: t('components.dialog.title.confirm'),
          contentText: t('components.dialog.message.confirm_restart_plugin'),
          confirmText: t('components.form.button.restart'),
        },
        onConfirm: () => {
          restartPlugin({ pluginName: plugin.value.pluginName });
        },
      });
      break;
    case 'uninstall':
      dialog.openComponentDialog<VersionsHandlerProps>(VersionsHandlerDialog, {
        data: {
          title: t('components.dialog.title.confirm'),
          confirmText: t('components.form.button.uninstall'),
          confirmButtonProps: {
            severity: 'danger',
          },
          loading: isLoading,
          contentProps: {
            target: unref(plugin),
            action: 'uninstall',
          },
        },
      });
      break;
  }
}

watch(pluginsSocket.status, (status) => {
  if (status === PLUGIN_STATUS.STARTING || status === PLUGIN_STATUS.READY || status === PLUGIN_STATUS.STARTED) {
    state.value = true;
  }
});

onBeforeMount(() => {
  pluginsSocket.connect();
});
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
