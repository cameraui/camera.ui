<template>
  <div>
    <div v-if="showCompatWarning && !showConsole">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('components.form.label.compatibility') }}</h3>
      <p v-if="compatIssues.length" class="text-muted mb-4">{{ $t('components.dialog.message.compatibility_warning') }}</p>
      <ul v-if="compatIssues.length" class="list-disc pl-5 space-y-1 mb-4">
        <li v-for="issue in compatIssues" :key="issue.engine" class="text-sm">
          {{ $t('components.dialog.message.compatibility_engine', { engine: issue.engine, required: issue.required, current: issue.current }) }}
        </li>
      </ul>
      <div v-if="platformIncompatible">
        <p class="font-medium">
          {{ $t('components.plugin_search.incompatible_system') }}<span v-if="platformRequirement"> — {{ platformRequirement }}</span>
        </p>
        <p class="text-muted text-sm mt-1">{{ $t('components.plugin_search.incompatible_worker_hint') }}</p>
      </div>
    </div>

    <div v-else-if="showReleaseNotes && changelog && !showConsole">
      <h3 class="text-base font-semibold border-b-[1px] border-color mb-3 pb-3">{{ $t('components.form.label.changelog') }}</h3>
      <div class="markdown-body" v-html="markdownIt.render(changelog)" />
    </div>

    <div v-else-if="isUninstall && !showConsole">
      <p class="text-muted">{{ $t('components.dialog.message.confirm_uninstall_plugin') }}</p>
    </div>

    <div v-else-if="!installVersion && !showConsole && !showReleaseNotes">
      <label class="cui-label">{{ $t('components.form.label.version') }}</label>
      <Select v-model="selectedVersion" :options="allVersions" :loading="versionsLoading" class="w-full mt-2" />
    </div>

    <div v-else-if="showConsole" class="w-full h-full relative">
      <Button
        v-tooltip.left="$t('components.form.button.copy')"
        type="button"
        severity="secondary"
        rounded
        class="!absolute top-2 right-2 z-10 !w-8 !h-8 !p-0 opacity-70 hover:opacity-100"
        @click="consoleRef?.copyAll()"
      >
        <i-mdi:content-copy class="w-4 h-4" />
      </Button>
      <CuiConsole ref="consoleRef" :options="options" class="bg-black !w-full" ignore-breakpoint @resize="logsSocket.reportSize" />
    </div>

    <div v-else class="w-full h-full p-4 flex items-center justify-center">
      <ProgressSpinner class="w-[30px] h-[30px] m-0" stroke-width="5" />
    </div>
  </div>
</template>

<script setup lang="ts">
import 'highlight.js/styles/vs2015.min.css';

import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import yaml from 'highlight.js/lib/languages/yaml';
import MarkdownIt from 'markdown-it';

import { PluginsQuery } from '@/api/routes/plugins.js';
import { ServerQuery } from '@/api/routes/server.js';
import { describePlatform } from '@/common/platformLabels.js';
import { isPluginTarget, isServerTarget } from './types.js';

import type CuiConsole from '@/components/CuiConsole/CuiConsole.vue';
import type { ContentComponentProps, DialogRefProps } from '@/composables/useCuiDialog.js';
import type { EngineIssue } from '@shared/types';
import type { ITerminalOptions } from '@xterm/xterm';
import type { DynamicDialogInstance } from 'primevue/dynamicdialogoptions';
import type { VersionsHandlerProps } from './types.js';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('python', python);

const pluginsQuery = new PluginsQuery();
const serverQuery = new ServerQuery();
const queryClient = useQueryClient();

const props = defineProps<VersionsHandlerProps>();

const toast = useCuiToast();
const { t } = useI18n();
const { mdBreakpoint } = useSharedCuiBreakpoint();
const { beginServerRestart } = useServerRestart();
const dialogRef = inject<Ref<DynamicDialogInstance>>('dialogRef')!;
const dialogRefProps = inject<DialogRefProps>('dialogRefProps')!;

const { target, installVersion, isNewPlugin } = toRefs(props);

pluginsQuery.toggleQueryActivator('getPluginVersionsQuery', false);
pluginsQuery.toggleQueryActivator('getPluginChangelogQuery', false);
pluginsQuery.toggleQueryActivator('getPluginCompatQuery', false);
serverQuery.toggleQueryActivator('checkVersionQuery', false);

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

const { data: versionInfo, isBusy: serverVersionsLoading } = serverQuery.checkVersionQuery();
const { data: availableVersions, isBusy: pluginVersionsLoading } = pluginsQuery.getPluginVersionsQuery(isPluginTarget(target.value) ? target.value.pluginName : '');
const {
  data: pluginChangelog,
  isBusy: pluginChangelogLoading,
  suspense: pluginChangelogSuspense,
} = pluginsQuery.getPluginChangelogQuery(isPluginTarget(target.value) ? target.value.pluginName : '', pluginQueryVersion);
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
const selectedVersion = ref<string | undefined>();
const showConsole = ref(false);
const showReleaseNotes = ref(false);
const newVersionInstalled = ref(false);
const uninstallDone = ref(false);
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
    installPluginLoading.value ||
    uninstallPluginLoading.value ||
    updateServerLoading.value ||
    restartPluginLoading.value ||
    restartServerLoading.value,
  ),
);

const allVersions = computed<string[]>(() => {
  if (isPluginTarget(target.value)) {
    return availableVersions.value?.versions || [];
  } else if (isServerTarget(target.value)) {
    return versionInfo.value?.versions || [];
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
  // Placeholder for server changelog when API is available
  return undefined;
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
    // Server doesn't have changelog endpoint yet
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
    await uninstallPlugin({ pluginName: target.value.pluginName });

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
