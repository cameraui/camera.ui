<template>
  <div>
    <div v-if="showCompatWarning && !showConsole">
      <div v-if="platformIncompatible" class="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 mb-3">
        <i-mdi:alert-circle class="w-5 h-5 shrink-0 text-orange-400 mt-0.5" />
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-sm font-semibold text-orange-400">
            {{ $t('components.plugin_search.incompatible_system') }}<span v-if="platformRequirement"> — {{ platformRequirement }}</span>
          </span>
          <span class="text-xs text-orange-600 dark:text-orange-300">{{ $t('components.plugin_search.incompatible_worker_hint') }}</span>
        </div>
      </div>

      <div v-for="issue in compatIssues" :key="issue.engine" class="flex items-start gap-3 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30 mb-3">
        <i-mdi:alert-circle class="w-5 h-5 shrink-0 text-orange-400 mt-0.5" />
        <span class="text-sm text-orange-400">
          {{ $t('components.dialog.message.compatibility_engine', { engine: issue.engine, required: issue.required, current: issue.current }) }}
        </span>
      </div>
    </div>

    <div v-else-if="showReleaseNotes && changelog && !showConsole">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('components.form.label.changelog') }}</h3>
      <div class="markdown-body" v-html="markdownIt.render(changelog)" />
    </div>

    <div v-else-if="isUninstall && !showConsole">
      <p class="text-muted">{{ $t('components.dialog.message.confirm_uninstall_plugin') }}</p>
      <div class="flex items-center gap-4 mt-4 px-4 py-3 rounded-xl bg-orange-500/10 border border-orange-500/30">
        <div class="flex flex-col gap-1 min-w-0">
          <span class="text-sm font-semibold text-orange-400">{{ $t('components.dialog.message.uninstall_remove_storage') }}</span>
          <span class="text-xs text-orange-600 dark:text-orange-300">{{ $t('components.dialog.message.uninstall_remove_storage_hint') }}</span>
        </div>
        <ToggleSwitch v-model="removeStorage" class="ml-auto shrink-0" />
      </div>
    </div>

    <div v-else-if="!installVersion && !showConsole && !showReleaseNotes">
      <label class="cui-label">{{ $t('components.form.label.version') }}</label>
      <Select v-model="selectedVersion" :options="allVersions" :loading="versionsLoading" class="w-full mt-2" />
    </div>

    <div v-else-if="showConsole" class="w-full h-full relative">
      <CuiConsole ref="consoleRef" :options="options" class="bg-black !w-full" ignore-breakpoint @resize="logsSocket.reportSize" />
    </div>

    <div v-else class="w-full h-full p-4 flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>
  </div>
</template>

<script setup lang="ts">
import 'highlight.js/styles/vs2015.min.css';

import { compareVersions } from 'compare-versions';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

import { ConfigQuery } from '@/api/routes/config.js';
import { PluginsQuery } from '@/api/routes/plugins.js';
import { ServerQuery } from '@/api/routes/server.js';
import { describePlatform } from '@/common/platformLabels.js';
import { isPluginTarget, isServerTarget } from './types.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { ContentComponentProps, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { EngineIssue, IConfig } from '@shared/types';
import type { ITerminalOptions } from '@xterm/xterm';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { VersionsHandlerProps } from './types.js';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);

const MIN_SERVER_VERSION = '2.0.0';

const pluginsQuery = new PluginsQuery();
const serverQuery = new ServerQuery();
const configQuery = new ConfigQuery();
const queryClient = useQueryClient();

const props = defineProps<VersionsHandlerProps>();

const toast = useCuiToast();
const { t } = useI18n();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { beginServerRestart } = useServerRestart();
const { isBeta } = useUpdateChannel();
const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { target, installVersion, isNewPlugin } = toRefs(props);
const selectedVersion = ref<string | undefined>();

pluginsQuery.toggleQueryActivator('getPluginVersionsQuery', false);
pluginsQuery.toggleQueryActivator('getPluginChangelogQuery', false);
pluginsQuery.toggleQueryActivator('getPluginCompatQuery', false);
serverQuery.toggleQueryActivator('checkVersionQuery', false);
serverQuery.toggleQueryActivator('getServerChangelogQuery', false);

const logTarget = computed(() => (isPluginTarget(target.value) ? target.value.pluginName : 'server'));
const isUninstall = computed(() => props.action === 'uninstall' && isPluginTarget(target.value));

const logsSocket = useLogsSocket({
  target: logTarget.value,
  onStdout: (data) => consoleRef.value?.writeTerminal(data),
  onDisconnect: () => consoleRef.value?.writeTerminal('\n\rWebsocket failed to connect! Is the server running?\r\n\r\n'),
  onClearLog: () => consoleRef.value?.clearTerminal(),
  onReconnected: () => {
    consoleRef.value?.writeTerminal('\r\n--- Reconnected ---\r\n\r\n');
  },
});

const pluginQueryVersion = computed<{ pluginversion?: string }>(() => {
  return { pluginversion: selectedVersion.value || installVersion.value };
});

const serverChangelogVersion = computed<string>(() => selectedVersion.value || installVersion.value || '');

const { data: versionInfo, isBusy: serverVersionsLoading } = serverQuery.checkVersionQuery();
const { data: config } = configQuery.getConfigQuery(true);
const { data: availableVersions, isBusy: pluginVersionsLoading } = pluginsQuery.getPluginVersionsQuery(isPluginTarget(target.value) ? target.value.pluginName : '');
const {
  data: pluginChangelog,
  isBusy: pluginChangelogLoading,
  suspense: pluginChangelogSuspense,
} = pluginsQuery.getPluginChangelogQuery(isPluginTarget(target.value) ? target.value.pluginName : '', pluginQueryVersion);
const { data: serverChangelog, isBusy: serverChangelogLoading, suspense: serverChangelogSuspense } = serverQuery.getServerChangelogQuery(serverChangelogVersion);
const { data: pluginCompat, suspense: pluginCompatSuspense } = pluginsQuery.getPluginCompatQuery(
  isPluginTarget(target.value) ? target.value.pluginName : '',
  pluginQueryVersion,
);
const { mutate: restartServer, isPending: restartServerLoading } = serverQuery.restartServerQuery();
const { mutate: restartPlugin, isPending: restartPluginLoading } = pluginsQuery.restartPluginQuery();
const { mutateAsync: installPlugin, isPending: installPluginLoading } = pluginsQuery.installPluginQuery();
const { mutateAsync: uninstallPlugin, isPending: uninstallPluginLoading } = pluginsQuery.uninstallPluginQuery();
const { mutateAsync: updateServer, isPending: updateServerLoading } = serverQuery.updateServerQuery();

const markdownIt = MarkdownIt('commonmark', {
  highlight(str: string, lang: string): string {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre><code class="hljs">' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
      } catch {
        // ignore
      }
    }

    return '<pre><code class="hljs">' + markdownIt.utils.escapeHtml(str) + '</code></pre>';
  },
});

const consoleRef = useTemplateRef<InstanceType<typeof CuiConsole>>('consoleRef');
const showConsole = ref(false);
const showReleaseNotes = ref(false);
const newVersionInstalled = ref(false);
const uninstallDone = ref(false);
const removeStorage = ref(false);
const changelogReady = ref(false);
const showCompatWarning = ref(false);
const compatChecked = ref(false);
const compatWarningReady = ref(false);

const versionsLoading = computed(() => pluginVersionsLoading.value || serverVersionsLoading.value);

const isLoading = computed(() =>
  // prettier-ignore
  Boolean(
    dialogRefProps.loading?.value ||
    pluginVersionsLoading.value ||
    serverVersionsLoading.value ||
    pluginChangelogLoading.value ||
    serverChangelogLoading.value ||
    installPluginLoading.value ||
    uninstallPluginLoading.value ||
    updateServerLoading.value ||
    restartPluginLoading.value ||
    restartServerLoading.value,
  ),
);

const pluginBetaVersions = computed(() => {
  const cfg = config.value;
  return cfg && typeof cfg !== 'string' ? ((cfg as IConfig).plugins?.betaVersions ?? false) : false;
});

const allVersions = computed<string[]>(() => {
  if (isPluginTarget(target.value)) {
    return (availableVersions.value?.versions || []).filter((version) => pluginBetaVersions.value || !version.includes('-'));
  } else if (isServerTarget(target.value)) {
    return (versionInfo.value?.versions || [])
      .filter((version) => compareVersions(version, MIN_SERVER_VERSION) >= 0)
      .filter((version) => isBeta.value || !version.includes('-'));
  }

  return [];
});

const compatIssues = computed<EngineIssue[]>(() => pluginCompat.value?.issues ?? []);

const platformIncompatible = computed(() => pluginCompat.value?.platformCompatible === false);

const platformRequirement = computed(() => describePlatform(pluginCompat.value?.os, pluginCompat.value?.cpu));

const changelog = computed<string | undefined>(() => {
  if (isPluginTarget(target.value)) {
    return pluginChangelog.value;
  }
  return serverChangelog.value;
});

const options = computed<ITerminalOptions>(() => {
  return {
    fontSize: mdBreakpoint.value ? 12 : 14,
  };
});

function startConsole(): void {
  showConsole.value = true;
  logsSocket.connect();
}

async function fetchChangelog(): Promise<void> {
  if (isPluginTarget(target.value)) {
    try {
      pluginsQuery.toggleQueryActivator('getPluginChangelogQuery', true);
      const { isError } = await pluginChangelogSuspense();

      if (isError) {
        throw new Error('Failed to fetch changelog');
      }

      showReleaseNotes.value = true;
    } catch {
      //
    }
  } else if (isServerTarget(target.value)) {
    try {
      serverQuery.toggleQueryActivator('getServerChangelogQuery', true);
      const { isError } = await serverChangelogSuspense();

      if (isError) {
        throw new Error('Failed to fetch changelog');
      }

      showReleaseNotes.value = true;
    } catch {
      //
    }
  }
}

async function fetchCompat(): Promise<void> {
  if (!isPluginTarget(target.value)) {
    return;
  }

  try {
    pluginsQuery.toggleQueryActivator('getPluginCompatQuery', true);
    await pluginCompatSuspense();

    if (compatIssues.value.length || platformIncompatible.value) {
      showCompatWarning.value = true;
    }
  } catch {
    //
  }
}

function shouldShowChangelog(version: string): boolean {
  if (isServerTarget(target.value)) return true;
  if (!isPluginTarget(target.value)) return false;
  if (target.value.private) return false;
  if (version === target.value.installedVersion) return false;
  return true;
}

async function installTarget(version: string): Promise<void> {
  if (!showReleaseNotes.value && shouldShowChangelog(version)) {
    await fetchChangelog();

    if (showReleaseNotes.value) {
      if (dialogRefProps.confirmText) {
        dialogRefProps.confirmText.value = t('components.form.button.continue');
      }

      changelogReady.value = true;
      return;
    }
  }

  if (!compatChecked.value) {
    compatChecked.value = true;
    await fetchCompat();

    if (showCompatWarning.value) {
      if (dialogRefProps.confirmText) {
        dialogRefProps.confirmText.value = t('components.form.button.continue');
      }

      compatWarningReady.value = true;
      return;
    }
  }

  startConsole();

  try {
    if (isPluginTarget(target.value)) {
      await installPlugin({
        pluginData: {
          pluginname: target.value.pluginName,
          pluginversion: version,
        },
      });
    } else if (isServerTarget(target.value)) {
      await updateServer({
        serverData: {
          version: version,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['api'] });
    }

    newVersionInstalled.value = true;

    if (dialogRefProps.confirmText) {
      dialogRefProps.confirmText.value = !isNewPlugin.value ? t('components.form.button.restart') : t('components.form.button.finish');
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

async function uninstallTarget(): Promise<void> {
  if (!isPluginTarget(target.value)) {
    return;
  }

  startConsole();

  try {
    await uninstallPlugin({ pluginName: target.value.pluginName, removeStorage: removeStorage.value });

    uninstallDone.value = true;

    if (dialogRefProps.confirmText) {
      dialogRefProps.confirmText.value = t('components.form.button.finish');
    }
  } catch (error: any) {
    toast.add({ severity: 'error', detail: error, life: 3000 });
  }
}

function restartTarget() {
  if (isPluginTarget(target.value)) {
    restartPlugin({
      pluginName: target.value.pluginName,
    });
  } else if (isServerTarget(target.value)) {
    beginServerRestart();
    restartServer();
  }
}

async function onConfirm(): Promise<void | null> {
  if (isUninstall.value) {
    if (uninstallDone.value) {
      return;
    }

    await uninstallTarget();
    return null;
  }

  if (newVersionInstalled.value && isNewPlugin.value) {
    return;
  }

  if (newVersionInstalled.value) {
    restartTarget();
    return;
  }

  if (changelogReady.value) {
    changelogReady.value = false;
    if (installVersion.value) {
      await installTarget(installVersion.value);
    } else if (selectedVersion.value) {
      await installTarget(selectedVersion.value);
    }
    return null;
  }

  if (compatWarningReady.value) {
    compatWarningReady.value = false;
    if (installVersion.value) {
      await installTarget(installVersion.value);
    } else if (selectedVersion.value) {
      await installTarget(selectedVersion.value);
    }
    return null;
  }

  if (installVersion.value) {
    await installTarget(installVersion.value);
    return null;
  } else {
    if (!selectedVersion.value) {
      toast.add({ severity: 'error', detail: t('components.toast.no_version_selected'), life: 3000 });
      return null;
    }

    await installTarget(selectedVersion.value);
    return null;
  }
}

watch(
  allVersions,
  (versions) => {
    if (versions.length) {
      selectedVersion.value = versions[0];
    }
  },
  { immediate: true, deep: true },
);

watch(showConsole, (show) => {
  if (show) {
    (dialogRef.value.data as ContentComponentProps<VersionsHandlerProps>).dialogContentClass = 'not-md:px-0 h-full md:h-[50vh]';
  } else {
    delete (dialogRef.value.data as ContentComponentProps<VersionsHandlerProps>).dialogContentClass;
  }
});

watch(mdBreakpoint, (isActive) => {
  if (!isActive && (showConsole.value || showReleaseNotes.value) && dialogRef.value.options.props) {
    dialogRef.value.options.props.style.height = '60vh';
    dialogRef.value.options.props.style.width = '70vh';
    dialogRef.value.options.props.style.maxWidth = '100%';
  }
});

onMounted(() => {
  if (isUninstall.value) {
    return;
  }

  if (installVersion.value) {
    installTarget(installVersion.value);
  } else {
    if (isPluginTarget(target.value)) {
      pluginsQuery.toggleQueryActivator('getPluginVersionsQuery', true);
    } else if (isServerTarget(target.value)) {
      serverQuery.toggleQueryActivator('checkVersionQuery', true);
    }
  }
});

onUnmounted(() => {
  logsSocket.disconnect();
});

defineExpose({
  isLoading,
  onConfirm,
});
</script>

<style scoped></style>
