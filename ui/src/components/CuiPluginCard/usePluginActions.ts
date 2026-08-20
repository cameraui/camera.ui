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
import { usePluginUpdates } from '@/composables/usePluginUpdates.js';

import type { PluginConsoleProps } from '@/components/CuiDialog/templates/PluginConsole/types.js';
import type { PluginUpdateProgressProps } from '@/components/CuiDialog/templates/PluginUpdateProgress/types.js';
import type { VersionsHandlerProps } from '@/components/CuiDialog/templates/VersionsHandler/types.js';
import type { MenuItem } from '@/components/CuiMenu/types.js';
import type { CameraUiPlugin } from '@shared/types';
import type { Ref } from 'vue';

const PluginConsoleDialog = asyncComponent(() => import('@/components/CuiDialog/templates/PluginConsole/PluginConsole.vue'));
const PluginUpdateProgressDialog = asyncComponent(() => import('@/components/CuiDialog/templates/PluginUpdateProgress/PluginUpdateProgress.vue'));
const VersionsHandlerDialog = asyncComponent(() => import('@/components/CuiDialog/templates/VersionsHandler/VersionsHandler.vue'));

export function usePluginActions(plugin: Ref<CameraUiPlugin>) {
  const pluginsQuery = new PluginsQuery();

  const route = useRoute();
  const dialog = useCuiDialog();
  const toast = useCuiToast();
  const { t } = useI18n();

  const pluginsSocket = usePluginsSocket(plugin.value.pluginName);
  const { isUpdating: isPluginUpdating, runOf, startUpdate } = usePluginUpdates();
  const updatesSocket = useUpdatesSocket();

  const { data: pluginUpdate } = pluginsQuery.getPluginUpdateQuery(plugin.value.pluginName);
  const { mutateAsync: installPlugin } = pluginsQuery.installPluginQuery();
  const { mutate: enablePlugin, isPending: enableLoading } = pluginsQuery.enablePluginQuery();
  const { mutate: disablePlugin, isPending: disableLoading } = pluginsQuery.disablePluginQuery();
  const { mutate: startPlugin, isPending: startLoading } = pluginsQuery.startPluginQuery();
  const { mutate: stopPlugin, isPending: stopLoading } = pluginsQuery.stopPluginQuery();
  const { mutate: restartPlugin, isPending: restartLoading } = pluginsQuery.restartPluginQuery();

  const state = ref(!plugin.value.disabled);

  const updatesRunActive = computed(() => updatesSocket.status.value?.runActive === true);

  const queued = computed(() => pluginsSocket.manageEntry.value?.status === 'queued');

  const updating = computed(() => {
    if (isPluginUpdating(plugin.value.pluginName)) return true;
    const entry = pluginsSocket.manageEntry.value;
    return entry?.action === 'install' || entry?.action === 'update';
  });

  const isLoading = computed(
    () =>
      updatesRunActive.value ||
      enableLoading.value ||
      disableLoading.value ||
      restartLoading.value ||
      startLoading.value ||
      stopLoading.value ||
      updating.value ||
      !!pluginsSocket.manageEntry.value,
  );

  const isPluginStopped = computed(
    () =>
      pluginsSocket.status.value === PLUGIN_STATUS.STOPPED ||
      pluginsSocket.status.value === PLUGIN_STATUS.DISABLED ||
      pluginsSocket.status.value === PLUGIN_STATUS.ERROR ||
      pluginsSocket.status.value === PLUGIN_STATUS.UNKNOWN ||
      pluginsSocket.status.value === PLUGIN_STATUS.UPDATE_REQUIRED ||
      pluginsSocket.status.value === PLUGIN_STATUS.SERVER_UPDATE_REQUIRED,
  );

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

  async function handleInlineUpdate() {
    const name = plugin.value.pluginName;

    if (isPluginUpdating(name)) {
      openUpdateProgress();
      return;
    }

    if (pluginsSocket.manageEntry.value) {
      openDialog('console');
      return;
    }

    const version = pluginUpdate.value?.latestVersion;
    if (!version) return;

    const ok = await startUpdate(name, version, () => installPlugin({ pluginData: { pluginname: name, pluginversion: version } }));
    if (!ok) {
      toast.add({
        severity: 'error',
        summary: plugin.value.displayName,
        detail: runOf(name)?.error,
        life: 6000,
      });
    }
  }

  function openUpdateProgress() {
    dialog.openComponentDialog<PluginUpdateProgressProps>(PluginUpdateProgressDialog, {
      data: {
        title: t('components.plugin_card.update_progress_title', { name: plugin.value.displayName }),
        hideConfirmButton: true,
        contentProps: {
          pluginName: plugin.value.pluginName,
        },
        dialogContentClass: 'not-md:px-0 h-full md:h-[50vh]',
      },
    });
  }

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

  return {
    pluginsSocket,
    pluginUpdate,
    state,
    queued,
    updating,
    isLoading,
    isPluginStopped,
    items,
    togglePlugin,
    openDialog,
    handleInlineUpdate,
    openUpdateProgress,
  };
}
